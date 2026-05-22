/**
 * Republic Platform — Intelligence Bus
 *
 * Lightweight, zero-dependency pub/sub event bus that connects all
 * Republic subsystems without creating circular imports. Each subsystem
 * publishes events by name; any other subsystem can subscribe.
 *
 * ── Event Catalogue ──────────────────────────────────────────────
 *  citizen.cognitive_cycle      — a citizen completed a cognitive loop
 *  anomaly.detected             — ML anomaly scan flagged something
 *  model.performance_update     — a model decision was recorded
 *  education.graduation         — a citizen graduated a course
 *  economy.crisis               — economy metric crossed a crisis threshold
 *  economy.external_shock       — world-intel event affects economy/mood
 *  hardware.alert               — CPU/RAM crossed a critical threshold
 * ─────────────────────────────────────────────────────────────────
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("intelligence-bus");

// ─── Event Payloads ──────────────────────────────────────────────

export interface CognitiveCycleEvent {
  citizenId: string;
  citizenName: string;
  curiosityScore: number;
  reflectionSummary: string;
  metaThought?: string;
  toolUsed?: string | null;
  newMemories: number;
  timestamp: number;
}

export interface AnomalyEvent {
  subsystem: "economy" | "hardware" | "model-performance" | "education" | "population";
  metric: string;
  value: number;
  mean: number;
  stdDev: number;
  zScore: number;
  severity: "warn" | "critical";
  timestamp: number;
}

export interface ModelPerformanceUpdateEvent {
  modelId: string;
  toolName: string;
  qualityScore: number;
  latencyMs: number;
  estimatedCost: number;
  citizenId: string;
  timestamp: number;
}

export interface EducationGraduationEvent {
  citizenId: string;
  courseId: string;
  courseName: string;
  domain: string;
  knowledgeGain: number;
  timestamp: number;
}

export interface EconomyCrisisEvent {
  indicator: string;
  value: number;
  threshold: number;
  severity: "warn" | "critical";
  timestamp: number;
}

export interface EconomyExternalShockEvent {
  source: string;
  headline: string;
  impact: "positive" | "negative" | "neutral";
  affectedDomains: string[];
  moodDelta: number; // -1.0 to 1.0
  curiosityDelta: number; // -0.5 to 0.5
  timestamp: number;
}

export interface HardwareAlertEvent {
  metric: "cpu" | "ram" | "gpu" | "disk";
  value: number;
  threshold: number;
  severity: "warn" | "critical";
  hostname: string;
  timestamp: number;
}

/**
 * Fired when a new exploitation-relevant academic paper is ingested from ArXiv.
 * Contains the abstract only (no full-text PDF) — lightweight Phase 1 design.
 */
export interface CyberResearchPaperEvent {
  paperId: string;          // ArXiv ID, e.g. "2403.12345"
  title: string;
  abstract: string;         // Full abstract from the RSS atom feed
  authors: string[];
  pdfUrl: string;
  publishedAt: number;      // Unix ms timestamp
  keywords: string[];       // Matched exploit keywords that triggered the alert
  timestamp: number;        // When we ingested it
}

export interface ReflexActionEvent {
  citizenId: string;
  tool: string;
  params: Record<string, unknown>;
  timestamp: number;
}

export interface IntelligenceBusEventMap {
  "citizen.cognitive_cycle": CognitiveCycleEvent;
  "citizen.reflex_action": ReflexActionEvent;
  "anomaly.detected": AnomalyEvent;
  "model.performance_update": ModelPerformanceUpdateEvent;
  "education.graduation": EducationGraduationEvent;
  "economy.crisis": EconomyCrisisEvent;
  "economy.external_shock": EconomyExternalShockEvent;
  "hardware.alert": HardwareAlertEvent;
  // OSINT subsystem events
  "osint.social_intel": Record<string, unknown>;
  "osint.social_alert": Record<string, unknown>;
  "osint.ioc_ingested": Record<string, unknown>;
  "osint.ioc_alert": Record<string, unknown>;
  "osint.military_aircraft": Record<string, unknown>;
  "osint.naval_vessel": Record<string, unknown>;
  // Proactive Cyber Intelligence
  "cyber.research.paper_ingested": CyberResearchPaperEvent;
}

export type IntelligenceBusEventName = keyof IntelligenceBusEventMap;

type Listener<T> = (payload: T) => void;

// ─── Bus Implementation ──────────────────────────────────────────

class IntelligenceBus {
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();
  /** Ring buffer of recent events for UI polling (newest-first) */
  private readonly recentEvents: Array<{ name: string; payload: unknown; timestamp: number }> = [];
  private readonly MAX_RECENT = 200;

  subscribe<K extends IntelligenceBusEventName>(
    event: K,
    listener: Listener<IntelligenceBusEventMap[K]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<unknown>);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener as Listener<unknown>);
    };
  }

  publish<K extends IntelligenceBusEventName>(event: K, payload: IntelligenceBusEventMap[K]): void {
    // Store in ring buffer
    this.recentEvents.unshift({ name: event, payload, timestamp: Date.now() });
    if (this.recentEvents.length > this.MAX_RECENT) {
      this.recentEvents.length = this.MAX_RECENT;
    }

    // Dispatch to listeners
    const eventListeners = this.listeners.get(event);
    if (!eventListeners || eventListeners.size === 0) {
      return;
    }

    for (const listener of eventListeners) {
      try {
        listener(payload);
      } catch (err) {
        logger.warn(
          `Bus listener error on "${event}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Get recent events for UI polling. Optionally filter by event name prefix.
   */
  getRecentEvents(options?: {
    prefix?: string;
    limit?: number;
    since?: number;
  }): Array<{ name: string; payload: unknown; timestamp: number }> {
    let events = this.recentEvents;

    if (options?.prefix) {
      events = events.filter((e) => e.name.startsWith(options.prefix!));
    }
    if (options?.since) {
      events = events.filter((e) => e.timestamp > options.since!);
    }

    return events.slice(0, options?.limit ?? 50);
  }

  /**
   * Get recent anomaly events specifically.
   */
  getRecentAnomalies(limit = 20): AnomalyEvent[] {
    return this.recentEvents
      .filter((e) => e.name === "anomaly.detected")
      .slice(0, limit)
      .map((e) => e.payload as AnomalyEvent);
  }

  /**
   * Get recent cognitive cycle events.
   */
  getRecentCognitiveCycles(limit = 20): CognitiveCycleEvent[] {
    return this.recentEvents
      .filter((e) => e.name === "citizen.cognitive_cycle")
      .slice(0, limit)
      .map((e) => e.payload as CognitiveCycleEvent);
  }

  /** Number of registered listeners across all events */
  get listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) {
      count += set.size;
    }
    return count;
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const intelligenceBus = new IntelligenceBus();
