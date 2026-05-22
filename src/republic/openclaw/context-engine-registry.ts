/**
 * OpenClaw Context Engine Registry — Adapted for HoC Republic
 *
 * Global registry for context engine implementations.
 * Supports:
 *   - Named engine registration with factory functions
 *   - Session-key routing (map session → engine instance)
 *   - Lazy instantiation and caching of engines
 *   - Legacy fallback to default engine
 *
 * Ported from upstream openclaw/src/context-engine/registry.ts
 */

import type { IContextEngine } from "./context-engine.js";
import { uid } from "../utils.js";
import { DefaultContextEngine } from "./context-engine.js";

// ─── Factory Type ────────────────────────────────────────────────

export type ContextEngineFactory = (
  sessionId: string,
  opts?: Record<string, unknown>,
) => IContextEngine | Promise<IContextEngine>;

// ─── Registry Implementation ─────────────────────────────────────

class ContextEngineRegistry {
  /** Named engine factories */
  private readonly factories = new Map<string, ContextEngineFactory>();
  /** Active engine instances by session key */
  private readonly instances = new Map<string, IContextEngine>();
  /** Session → engine name mapping */
  private readonly sessionEngineMap = new Map<string, string>();
  /** Default engine name */
  private defaultEngineName = "default";

  constructor() {
    // Register the built-in default engine
    this.register("default", (sessionId) => {
      const engine = new DefaultContextEngine(`default-${uid()}`);
      // Bootstrap is async but we call it eagerly
      engine.bootstrap(sessionId).catch(() => {});
      return engine;
    });
  }

  /**
   * Register a context engine factory by name.
   */
  register(name: string, factory: ContextEngineFactory): void {
    this.factories.set(name, factory);
  }

  /**
   * Set the default engine name.
   */
  setDefault(name: string): void {
    if (!this.factories.has(name)) {
      throw new Error(`Cannot set default: engine "${name}" not registered`);
    }
    this.defaultEngineName = name;
  }

  /**
   * Resolve a context engine for a session.
   * Creates a new instance if one doesn't exist for this session.
   */
  async resolve(sessionId: string, engineName?: string): Promise<IContextEngine> {
    // Check for cached instance
    const existing = this.instances.get(sessionId);
    if (existing) {
      return existing;
    }

    // Determine which engine to use
    const name = engineName ?? this.sessionEngineMap.get(sessionId) ?? this.defaultEngineName;
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Context engine "${name}" not registered`);
    }

    // Create and cache the instance
    const engine = await Promise.resolve(factory(sessionId));
    this.instances.set(sessionId, engine);
    this.sessionEngineMap.set(sessionId, name);

    return engine;
  }

  /**
   * Get an existing engine instance (no creation).
   */
  getInstance(sessionId: string): IContextEngine | null {
    return this.instances.get(sessionId) ?? null;
  }

  /**
   * Release a session's engine instance.
   */
  release(sessionId: string): void {
    const engine = this.instances.get(sessionId);
    if (engine) {
      engine.destroy();
      this.instances.delete(sessionId);
      this.sessionEngineMap.delete(sessionId);
    }
  }

  /**
   * Release all engine instances.
   */
  releaseAll(): void {
    for (const engine of this.instances.values()) {
      engine.destroy();
    }
    this.instances.clear();
    this.sessionEngineMap.clear();
  }

  /**
   * List registered engine names.
   */
  listEngines(): string[] {
    return [...this.factories.keys()];
  }

  /**
   * Get diagnostics for all active sessions.
   */
  getDiagnostics(): {
    registeredEngines: string[];
    defaultEngine: string;
    activeSessions: number;
    sessions: Array<{
      sessionId: string;
      engineName: string;
      entryCount: number;
      totalTokens: number;
    }>;
  } {
    const sessions: Array<{
      sessionId: string;
      engineName: string;
      entryCount: number;
      totalTokens: number;
    }> = [];

    for (const [sessionId, engine] of this.instances) {
      const diag = engine.getDiagnostics();
      sessions.push({
        sessionId,
        engineName: this.sessionEngineMap.get(sessionId) ?? "unknown",
        entryCount: diag.entryCount,
        totalTokens: diag.totalTokens,
      });
    }

    return {
      registeredEngines: this.listEngines(),
      defaultEngine: this.defaultEngineName,
      activeSessions: this.instances.size,
      sessions,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const contextEngineRegistry = new ContextEngineRegistry();
