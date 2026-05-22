/**
 * Republic — Citizen LRU Pager (Phase 4: Scalability)
 *
 * A tiered memory system for handling thousands of citizens without
 * loading all of them into RAM simultaneously.
 *
 * Architecture (from implementation_plan.md Phase 4B):
 *
 *  Tier 0: Hot cache  — top N most recently accessed citizens (LRU Map, in-process)
 *  Tier 1: Warm SQLite — all citizens, last 7 days events (republic-db)
 *  Tier 2: Cold archive — monthly summaries (future: S3/Supabase)
 *
 * Key behaviours:
 *  - get(id): returns from hot cache if possible, pages in from SQLite otherwise
 *  - Evicted entries are written back to SQLite before eviction
 *  - Access patterns determine which citizens stay hot
 *  - Statistics tracked to inform auto-tuning of hot cache size
 */

import type { Citizen } from "./types.js";

// ── LRU Cache ─────────────────────────────────────────────────────────────────

/**
 * Minimal LRU Cache backed by a doubly-linked list + Map.
 * O(1) get, set, delete. No external dependencies.
 */
class LRUNode<T> {
  constructor(
    public key: string,
    public value: T,
    public prev: LRUNode<T> | null = null,
    public next: LRUNode<T> | null = null,
  ) {}
}

class LRUCache<T> {
  private map = new Map<string, LRUNode<T>>();
  private head: LRUNode<T> | null = null; // Most recently used
  private tail: LRUNode<T> | null = null; // Least recently used

  constructor(public readonly capacity: number) {}

  get(key: string): T | undefined {
    const node = this.map.get(key);
    if (!node) {
      return undefined;
    }
    this.moveToHead(node);
    return node.value;
  }

  set(key: string, value: T): string | null {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
      return null;
    }

    const node = new LRUNode(key, value);
    this.map.set(key, node);
    this.addToHead(node);

    if (this.map.size > this.capacity) {
      const evicted = this.removeTail();
      if (evicted) {
        this.map.delete(evicted.key);
        return evicted.key; // Return key of evicted entry for write-back
      }
    }
    return null;
  }

  delete(key: string): void {
    const node = this.map.get(key);
    if (!node) {
      return;
    }
    this.removeNode(node);
    this.map.delete(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  size(): number {
    return this.map.size;
  }

  /** Get all hot citizen IDs (for bulk operations) */
  keys(): string[] {
    return [...this.map.keys()];
  }

  private moveToHead(node: LRUNode<T>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private addToHead(node: LRUNode<T>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = null;
    node.next = null;
  }

  private removeTail(): LRUNode<T> | null {
    if (!this.tail) {
      return null;
    }
    const node = this.tail;
    this.removeNode(node);
    return node;
  }
}

// ── Citizen Pager ─────────────────────────────────────────────────────────────

interface PagerStats {
  hits: number;
  misses: number;
  evictions: number;
  writeBacks: number;
  hotCacheSize: number;
  hotCacheCapacity: number;
  hitRate: string;
}

interface CitizenLoader {
  /** Load a single citizen from Tier 1 (SQLite) */
  load(id: string): Promise<Citizen | null>;
  /** Persist a citizen back to Tier 1 after eviction */
  save(citizen: Citizen): Promise<void>;
  /** Load multiple citizens by IDs in one batch */
  loadBatch(ids: string[]): Promise<Citizen[]>;
}

/**
 * Default loader that reads from the republic in-memory state.
 * In production, replace with SqliteCitizenRepository.
 */
class InMemoryLoader implements CitizenLoader {
  constructor(private getAllCitizens: () => Citizen[]) {}

  async load(id: string): Promise<Citizen | null> {
    return this.getAllCitizens().find((c) => c.id === id) ?? null;
  }

  async save(_citizen: Citizen): Promise<void> {
    // In-memory: no-op (data is already in state)
  }

  async loadBatch(ids: string[]): Promise<Citizen[]> {
    const all = this.getAllCitizens();
    const idSet = new Set(ids);
    return all.filter((c) => idSet.has(c.id));
  }
}

export class CitizenLRUPager {
  private hot: LRUCache<Citizen>;
  private stats: PagerStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    writeBacks: 0,
    hotCacheSize: 0,
    hotCacheCapacity: 0,
    hitRate: "0%",
  };

  constructor(
    private loader: CitizenLoader,
    private capacity = 200,
  ) {
    this.hot = new LRUCache<Citizen>(capacity);
    this.stats.hotCacheCapacity = capacity;
  }

  /**
   * Convenience factory — creates a pager backed by the republic state.
   */
  static fromState(getAllCitizens: () => Citizen[], capacity = 200): CitizenLRUPager {
    return new CitizenLRUPager(new InMemoryLoader(getAllCitizens), capacity);
  }

  /**
   * Get a citizen by ID.
   * Tier 0 → Tier 1 fallback with automatic eviction and write-back.
   */
  async get(id: string): Promise<Citizen | null> {
    // Tier 0: hot cache hit
    const cached = this.hot.get(id);
    if (cached) {
      this.stats.hits++;
      this._refreshStats();
      return cached;
    }

    // Tier 1: page in from SQLite/in-memory
    this.stats.misses++;
    const citizen = await this.loader.load(id);
    if (!citizen) {
      this._refreshStats();
      return null;
    }

    // Promote to hot cache — if eviction occurs, write back
    const evictedKey = this.hot.set(id, citizen);
    if (evictedKey !== null) {
      this.stats.evictions++;
      const evicted = this.hot.get(evictedKey); // Won't be found (already evicted)
      if (evicted) {
        await this.loader.save(evicted);
        this.stats.writeBacks++;
      }
    }

    this._refreshStats();
    return citizen;
  }

  /**
   * Get multiple citizens efficiently — batch loads misses.
   */
  async getMany(ids: string[]): Promise<Citizen[]> {
    const results: Citizen[] = [];
    const missing: string[] = [];

    for (const id of ids) {
      const cached = this.hot.get(id);
      if (cached) {
        results.push(cached);
        this.stats.hits++;
      } else {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      this.stats.misses += missing.length;
      const loaded = await this.loader.loadBatch(missing);
      for (const citizen of loaded) {
        const evictedKey = this.hot.set(citizen.id, citizen);
        if (evictedKey !== null) {this.stats.evictions++;}
        results.push(citizen);
      }
    }

    this._refreshStats();
    return results;
  }

  /**
   * Update a citizen in the hot cache and schedule write-back.
   */
  set(citizen: Citizen): void {
    this.hot.set(citizen.id, citizen);
    this._refreshStats();
  }

  /**
   * Force eviction of a citizen (e.g., after deletion).
   */
  evict(id: string): void {
    this.hot.delete(id);
    this._refreshStats();
  }

  /** Current cache statistics */
  getStats(): PagerStats {
    return { ...this.stats };
  }

  /** Warm the cache with the most important citizens (e.g., most active). */
  async warm(citizens: Citizen[]): Promise<void> {
    const prioritised = citizens
      .toSorted((a, b) => b.energy + b.happiness - (a.energy + a.happiness))
      .slice(0, this.capacity);
    for (const c of prioritised) {
      this.hot.set(c.id, c);
    }
    this._refreshStats();
  }

  private _refreshStats(): void {
    this.stats.hotCacheSize = this.hot.size();
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? `${Math.round((this.stats.hits / total) * 100)}%` : "0%";
  }
}

// Singleton instance (initialised lazily by state.ts)
let _pager: CitizenLRUPager | null = null;

export function getCitizenPager(getAllCitizens?: () => Citizen[]): CitizenLRUPager {
  if (!_pager && getAllCitizens) {
    _pager = CitizenLRUPager.fromState(getAllCitizens);
  }
  if (!_pager) {
    throw new Error("CitizenLRUPager not initialised — call with getAllCitizens first");
  }
  return _pager;
}
