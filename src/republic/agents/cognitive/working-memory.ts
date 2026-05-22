/**
 * working-memory.ts — Baddeley Working Memory Model
 *
 * Based on Baddeley & Hitch (1974) and subsequent revisions:
 * Working memory has a capacity limit (Miller's 7±2 Law) and
 * consists of specialized sub-systems:
 *   - Phonological Loop: verbal/linguistic content (plans, declarations)
 *   - Visuospatial Sketchpad: structural/spatial/relational content
 *   - Episodic Buffer: integration with long-term memory
 *   - Central Executive: coordinates all three (implicit in LLM reasoning)
 *
 * Slots decay over time (unless rehearsed / re-accessed).
 * Low-activation slots are demoted to episodic long-term memory.
 *
 * This replaces the naive "last N events" approach with a cognitively
 * grounded short-term memory that mirrors human attention.
 *
 * References:
 *   - Baddeley, A. (2000). The episodic buffer: A new component of WM
 *   - ACL 2025: WM capacity optimization in LLM agents
 *   - getzep.com: Structured memory services for LLM agents
 */

import type { Citizen } from "../../types.js";

// ─── Working Memory Slot ──────────────────────────────────────────────────────

export type WMSlotType =
  | "percept"       // immediate observation ("The sacred tree was desecrated")
  | "goal"          // active intention ("Complete the algorithm by tick 150")
  | "plan"          // current procedural plan ("Step 1: gather data. Step 2: synthesize")
  | "social"        // social/relational note ("Aria is upset with me")
  | "emotional"     // affective state note ("I feel exhilarated from the festival")
  | "tool_result"   // recent tool output ("simulation_run returned divergence at epoch 3")
  | "insight";      // a reflection insight that's been promoted to active WM

export type WMSubSystem = "phonological" | "visuospatial" | "episodic";

export interface WorkingMemorySlot {
  id: string;
  type: WMSlotType;
  subSystem: WMSubSystem;
  content: string;              // compressed, max 120 chars
  activationLevel: number;      // 0–1: decays each tick
  enteredAtTick: number;
  lastAccessedTick: number;
  decayRate: number;            // per-tick activation loss
  associatedEntities: string[]; // citizen IDs / tool IDs / event IDs
  rehearsalCount: number;       // increases each time this slot is re-accessed
}

// ─── Working Memory Store ─────────────────────────────────────────────────────

/** Miller's Law: 7 ± 2 slots. We use 7 as the base capacity. */
const WM_CAPACITY = 7;
const WM_DECAY_THRESHOLD = 0.15;  // slots below this are demoted

const _workingMemories = new Map<string, WorkingMemorySlot[]>();

export function getWorkingMemory(citizenId: string): WorkingMemorySlot[] {
  return _workingMemories.get(citizenId) ?? [];
}

function nextSlotId(): string {
  return `wm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Sub-system classification ────────────────────────────────────────────────

function classifySubSystem(type: WMSlotType): WMSubSystem {
  if (type === "percept" || type === "social" || type === "emotional") { return "episodic"; }
  if (type === "plan" || type === "goal") { return "phonological"; }
  return "visuospatial";
}

function decayRateForType(type: WMSlotType): number {
  // Goals and plans decay slowly; percepts and tool results decay quickly
  const rates: Record<WMSlotType, number> = {
    goal: 0.03, plan: 0.04, insight: 0.02,
    social: 0.06, emotional: 0.08, percept: 0.12, tool_result: 0.15,
  };
  return rates[type];
}

// ─── Core WM Operations ───────────────────────────────────────────────────────

/**
 * Add a new item to working memory.
 * If at capacity, the slot with the lowest activation is evicted.
 */
export function wmEncode(
  citizenId: string,
  type: WMSlotType,
  content: string,
  currentTick: number,
  associatedEntities: string[] = [],
): WorkingMemorySlot {
  const slots = _workingMemories.get(citizenId) ?? [];

  const slot: WorkingMemorySlot = {
    id: nextSlotId(),
    type,
    subSystem: classifySubSystem(type),
    content: content.slice(0, 140),  // hard truncate
    activationLevel: 1.0,
    enteredAtTick: currentTick,
    lastAccessedTick: currentTick,
    decayRate: decayRateForType(type),
    associatedEntities,
    rehearsalCount: 0,
  };

  // Eviction: if at capacity, remove the least-activated slot
  if (slots.length >= WM_CAPACITY) {
    const minIdx = slots.reduce(
      (minI, s, i) => s.activationLevel < slots[minI]!.activationLevel ? i : minI,
      0,
    );
    slots.splice(minIdx, 1);
  }

  slots.push(slot);
  _workingMemories.set(citizenId, slots);
  return slot;
}

/**
 * Rehearse (re-access) a slot — boosts its activation and resets decay.
 * Mirrors how rehearsal maintains items in human WM.
 */
export function wmRehears(citizenId: string, slotId: string, currentTick: number): void {
  const slots = _workingMemories.get(citizenId) ?? [];
  const slot = slots.find(s => s.id === slotId);
  if (slot) {
    slot.activationLevel = Math.min(1.0, slot.activationLevel + 0.3);
    slot.lastAccessedTick = currentTick;
    slot.rehearsalCount++;
  }
}

/**
 * Per-tick decay pass. Demotes expired slots (activation → 0).
 * Returns slots that have been demoted (for episodic memory consolidation).
 */
export function wmDecayTick(citizenId: string, currentTick: number): WorkingMemorySlot[] {
  const slots = _workingMemories.get(citizenId) ?? [];
  const demoted: WorkingMemorySlot[] = [];

  const active = slots.filter(slot => {
    // Decay proportional to time since last access
    const ticksSinceAccess = currentTick - slot.lastAccessedTick;
    slot.activationLevel = Math.max(0, slot.activationLevel - slot.decayRate * ticksSinceAccess);

    if (slot.activationLevel < WM_DECAY_THRESHOLD) {
      demoted.push(slot);
      return false;
    }
    return true;
  });

  _workingMemories.set(citizenId, active);
  return demoted;
}

/**
 * Load working memory from persisted state (on citizen page-in from LRU cache).
 */
export function wmLoad(citizenId: string, slots: WorkingMemorySlot[]): void {
  _workingMemories.set(citizenId, [...slots]);
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

/**
 * Assembles the working memory section for the citizen's LLM prompt.
 * Shows the 7 active slots, organized by sub-system, ordered by activation.
 */
export function assembleWorkingMemorySection(
  citizen: Citizen,
  currentTick: number,
): string {
  wmDecayTick(citizen.id, currentTick);
  const slots = getWorkingMemory(citizen.id)
    .toSorted((a, b) => b.activationLevel - a.activationLevel);

  if (slots.length === 0) {
    return "Working memory: empty. Form new intentions.";
  }

  const lines: string[] = [];
  for (const slot of slots) {
    const activStr = slot.activationLevel > 0.7 ? "ACTIVE" :
                     slot.activationLevel > 0.35 ? "FADING" : "WEAK";
    const icon: Record<WMSlotType, string> = {
      goal: "🎯", plan: "📋", insight: "💡",
      social: "👥", emotional: "💗", percept: "👁", tool_result: "⚙️",
    };
    lines.push(`${activStr} ${icon[slot.type]} [${slot.type}]: ${slot.content}`);
  }

  const freeSlots = WM_CAPACITY - slots.length;
  if (freeSlots > 0) {
    lines.push(`(${freeSlots} slot${freeSlots > 1 ? "s" : ""} free — encode new information here)`);
  }

  return lines.join("\n");
}
