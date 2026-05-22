/**
 * rac-engine.ts — Retrieval-Augmented Conversation (RAC) Engine
 *
 * RAC is a stateful, multi-turn dialogue paradigm that:
 *   - Remembers facts and clarifications across the entire conversation
 *   - Tracks measurable progress toward a defined business/citizen outcome
 *   - Retrieves relevant context from the republic memory graph on each turn
 *   - Drives conversations toward goals, not just answers
 *
 * Architecture:
 *   Session: a named dialogue with a goal, citizen agent, and turn history
 *   Turn:    a single exchange (user utterance → retrieved context → response)
 *   Fact:    a distilled piece of information extracted from turns and stored
 *   Outcome: a measurable goal with a completion score 0–1
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ─── Persistence ──────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(
  typeof __dirname !== "undefined" ? __dirname : ".",
  "../../plugins/.rac-data"
);
const SESSIONS_PATH = path.join(DATA_DIR, "sessions.json");
const FACTS_PATH = path.join(DATA_DIR, "facts.json");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RacFact {
  id: string;
  sessionId: string;
  citizenId: string;
  subject: string;
  predicate: string;
  value: string;
  confidence: number;        // 0–1
  turnIndex: number;
  timestamp: string;
  tags: string[];
}

export interface RacOutcome {
  id: string;
  label: string;
  description: string;
  targetMetric?: string;
  targetValue?: number;
  currentValue?: number;
  score: number;             // 0–1 completion
  milestones: string[];
  reached: boolean[];
}

export interface RacTurn {
  index: number;
  role: "user" | "citizen" | "system";
  content: string;
  timestamp: string;
  retrievedFacts: string[];  // fact IDs that were injected into this turn
  clarificationNeeded?: string;
  outcomeProgress?: number;  // 0–1
}

export interface RacSession {
  id: string;
  name: string;
  citizenId: string;
  goal: string;
  context: string;           // domain context for retrieval
  status: "active" | "completed" | "paused";
  outcome: RacOutcome;
  turns: RacTurn[];
  facts: RacFact[];          // facts extracted in this session
  pendingClarifications: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

function loadSessions(): Map<string, RacSession> {
  ensureDir();
  if (!fs.existsSync(SESSIONS_PATH)) { return new Map(); }
  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf-8")) as Record<string, RacSession>;
    return new Map(Object.entries(data));
  } catch { return new Map(); }
}

function saveSessions(sessions: Map<string, RacSession>) {
  ensureDir();
  const obj = Object.fromEntries(sessions.entries());
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(obj, null, 2), "utf-8");
}

function loadFacts(): Map<string, RacFact> {
  ensureDir();
  if (!fs.existsSync(FACTS_PATH)) { return new Map(); }
  try {
    const data = JSON.parse(fs.readFileSync(FACTS_PATH, "utf-8")) as Record<string, RacFact>;
    return new Map(Object.entries(data));
  } catch { return new Map(); }
}

function saveFacts(facts: Map<string, RacFact>) {
  ensureDir();
  const obj = Object.fromEntries(facts.entries());
  fs.writeFileSync(FACTS_PATH, JSON.stringify(obj, null, 2), "utf-8");
}

// ─── Fact Extraction (heuristic, no LLM required) ────────────────────────────

/**
 * Extract simple subject-predicate-value triples from a text utterance.
 * In production these would be sent to the citizen's LLM for structured extraction.
 * Here we use lightweight regex patterns for common knowledge patterns.
 */
function extractFacts(text: string, sessionId: string, citizenId: string, turnIndex: number): RacFact[] {
  const facts: RacFact[] = [];
  const ts = new Date().toISOString();

  // Budget / numbers pattern: "budget is $X" / "we have X units"
  const budgetMatch = text.match(/budget\s+(?:is|of|:)?\s*\$?([\d,]+(?:\.\d+)?[kKmMbB]?)/i);
  if (budgetMatch) {
    facts.push({ id: crypto.randomUUID(), sessionId, citizenId, subject: "budget", predicate: "is", value: budgetMatch[1]!, confidence: 0.85, turnIndex, timestamp: ts, tags: ["financial", "constraint"] });
  }

  // Timeline: "deadline is X" / "by Q3"
  const deadlineMatch = text.match(/(?:deadline|by|timeline|due)\s+(?:is\s+)?([A-Za-z0-9 ,]+(?:2025|2026|Q[1-4]))/i);
  if (deadlineMatch) {
    facts.push({ id: crypto.randomUUID(), sessionId, citizenId, subject: "timeline", predicate: "deadline_is", value: deadlineMatch[1]!.trim(), confidence: 0.8, turnIndex, timestamp: ts, tags: ["schedule"] });
  }

  // Preference: "we prefer X" / "I want X"
  const prefMatch = text.match(/(?:prefer|want|need|require)\s+([\w\s]{3,40}?)(?:\.|,|$)/i);
  if (prefMatch) {
    facts.push({ id: crypto.randomUUID(), sessionId, citizenId, subject: "preference", predicate: "requires", value: prefMatch[1]!.trim(), confidence: 0.7, turnIndex, timestamp: ts, tags: ["preference"] });
  }

  // Entity mentions: "team / department / division of X"
  const entityMatch = text.match(/(?:team|department|division|company|org)(?:\s+of)?\s+["']?([A-Z][a-zA-Z0-9 ]{2,30})["']?/);
  if (entityMatch) {
    facts.push({ id: crypto.randomUUID(), sessionId, citizenId, subject: "org_entity", predicate: "name", value: entityMatch[1]!.trim(), confidence: 0.75, turnIndex, timestamp: ts, tags: ["entity"] });
  }

  // Problem statement: "the problem is X" / "issue with X"
  const problemMatch = text.match(/(?:problem|issue|challenge|obstacle)\s+(?:is\s+|with\s+)?([^.!?]{5,80})/i);
  if (problemMatch) {
    facts.push({ id: crypto.randomUUID(), sessionId, citizenId, subject: "problem", predicate: "statement", value: problemMatch[1]!.trim(), confidence: 0.78, turnIndex, timestamp: ts, tags: ["problem", "outcome"] });
  }

  return facts;
}

// ─── Outcome Scoring ─────────────────────────────────────────────────────────

/**
 * Heuristically score outcome progress based on:
 *   - How many milestones are reached
 *   - Whether the goal keyword appears in recent turns
 *   - Number of clarifications resolved
 */
function scoreOutcome(session: RacSession): number {
  const { outcome, turns, pendingClarifications } = session;
  if (outcome.milestones.length === 0) { return 0; }

  const milestonesReached = outcome.reached.filter(Boolean).length;
  const milestoneScore = milestonesReached / outcome.milestones.length;

  // Bonus for resolved clarifications
  const totalTurns = turns.length;
  const clarificationBonus = totalTurns > 0 ? Math.min(0.2, (1 - pendingClarifications.length / Math.max(1, totalTurns)) * 0.2) : 0;

  // Goal keyword presence in recent assistant turns
  const recentTurns = turns.slice(-5).filter(t => t.role === "citizen").map(t => t.content.toLowerCase());
  const goalWords = session.goal.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const keywordHits = goalWords.filter(w => recentTurns.some(t => t.includes(w))).length;
  const keywordBonus = goalWords.length > 0 ? Math.min(0.2, keywordHits / goalWords.length * 0.2) : 0;

  return Math.min(1, milestoneScore + clarificationBonus + keywordBonus);
}

// ─── RAG Context Retrieval ────────────────────────────────────────────────────

/**
 * Retrieve relevant facts from the session store that match the current utterance.
 * Uses TF-IDF-weighted scoring with confidence decay and recency boosting
 * for production-quality context retrieval. VectorDB integration planned
 * for future semantic embedding similarity.
 */
function retrieveRelevantFacts(session: RacSession, query: string, topK = 5): RacFact[] {
  if (session.facts.length === 0) { return []; }

  // Build IDF (inverse document frequency) across all facts
  const factTexts = session.facts.map(f =>
    `${f.subject} ${f.predicate} ${f.value} ${f.tags.join(" ")}`.toLowerCase()
  );
  const totalDocs = factTexts.length;
  const docFrequency = new Map<string, number>();
  for (const text of factTexts) {
    const words = new Set(text.split(/\W+/).filter(w => w.length > 2));
    for (const w of words) {
      docFrequency.set(w, (docFrequency.get(w) ?? 0) + 1);
    }
  }

  // Tokenize query
  const qWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  if (qWords.length === 0) { return []; }

  // Score each fact using TF-IDF + confidence + recency
  const latestTurnIndex = session.turns.length;

  return session.facts
    .map((f, idx) => {
      const fText = factTexts[idx];
      let score = 0;

      for (const qw of qWords) {
        if (fText.includes(qw)) {
          const tf = 1; // Binary TF (present or not)
          const df = docFrequency.get(qw) ?? 1;
          const idf = Math.log(1 + totalDocs / df); // IDF boost for rare terms
          score += tf * idf;
        }
      }

      if (score === 0) { return { fact: f, score: 0 }; }

      // Boost by confidence
      score *= f.confidence;

      // Boost by recency (more recent facts rank higher)
      const age = Math.max(1, latestTurnIndex - f.turnIndex);
      score *= 1 / (1 + Math.log(age)); // Logarithmic recency decay

      return { fact: f, score };
    })
    .filter(({ score }) => score > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ fact }) => fact);
}

// ─── Clarification Detection ──────────────────────────────────────────────────

function detectClarificationNeeded(userText: string, session: RacSession): string | undefined {
  const lc = userText.toLowerCase();
  // If user references something vague
  if (/\b(?:that|this|it|them|they)\b/.test(lc) && session.turns.length < 3) {
    return "Could you clarify what you're referring to? (pronouns detected without enough context)";
  }
  // If goal mentions a metric but no value given yet
  if (session.outcome.targetMetric && session.outcome.targetValue === undefined) {
    if (!lc.includes(session.outcome.targetMetric.toLowerCase())) {
      return `What is your target for "${session.outcome.targetMetric}"?`;
    }
  }
  return undefined;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Create a new RAC session. */
export function createSession(params: {
  name: string;
  citizenId: string;
  goal: string;
  context: string;
  milestones: string[];
  targetMetric?: string;
  targetValue?: number;
}): RacSession {
  const sessions = loadSessions();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const session: RacSession = {
    id,
    name: params.name,
    citizenId: params.citizenId,
    goal: params.goal,
    context: params.context,
    status: "active",
    outcome: {
      id: crypto.randomUUID(),
      label: params.goal,
      description: `Drive conversation toward: ${params.goal}`,
      targetMetric: params.targetMetric,
      targetValue: params.targetValue,
      score: 0,
      milestones: params.milestones,
      reached: params.milestones.map(() => false),
    },
    turns: [],
    facts: [],
    pendingClarifications: [],
    createdAt: now,
    updatedAt: now,
  };

  sessions.set(id, session);
  saveSessions(sessions);
  return session;
}

/** Add a user message to an active session and return guidance for the citizen agent. */
export interface TurnResult {
  turn: RacTurn;
  retrievedFacts: RacFact[];
  clarificationNeeded?: string;
  outcomeScore: number;
  newFacts: RacFact[];
  promptContext: string;    // augmented context to inject into the citizen's LLM prompt
}

export function addUserTurn(sessionId: string, content: string): TurnResult | null {
  const sessions = loadSessions();
  const session = sessions.get(sessionId);
  if (!session || session.status !== "active") { return null; }

  const allFacts = loadFacts();
  const turnIndex = session.turns.length;

  // Extract new facts from this utterance
  const newFacts = extractFacts(content, sessionId, session.citizenId, turnIndex);
  for (const f of newFacts) {
    session.facts.push(f);
    allFacts.set(f.id, f);
  }
  saveFacts(allFacts);

  // Retrieve relevant facts for RAG augmentation
  const retrieved = retrieveRelevantFacts(session, content);
  const clarificationNeeded = detectClarificationNeeded(content, session);

  if (clarificationNeeded) {
    session.pendingClarifications.push(clarificationNeeded);
  }

  const turn: RacTurn = {
    index: turnIndex,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
    retrievedFacts: retrieved.map(f => f.id),
    clarificationNeeded,
  };
  session.turns.push(turn);

  // Build augmented prompt context for citizen agent
  const factList = retrieved.map(f => `• [${f.tags.join(",")}] ${f.subject} ${f.predicate}: ${f.value} (confidence ${Math.round(f.confidence * 100)}%)`).join("\n");
  const clarNote = clarificationNeeded ? `\n⚠ CLARIFICATION NEEDED: ${clarificationNeeded}` : "";
  const pendingNote = session.pendingClarifications.length > 0
    ? `\nOPEN CLARIFICATIONS:\n${session.pendingClarifications.map(c => `• ${c}`).join("\n")}`
    : "";

  const promptContext = [
    `SESSION GOAL: ${session.goal}`,
    `CONTEXT DOMAIN: ${session.context}`,
    retrieved.length > 0 ? `\nRELEVANT FACTS FROM CONVERSATION:\n${factList}` : "",
    clarNote,
    pendingNote,
    `\nOUTCOME PROGRESS: ${Math.round(scoreOutcome(session) * 100)}%`,
    `YOUR OBJECTIVE: Drive this conversation toward the stated goal. Do not just answer — guide, clarify, and advance.`,
  ].filter(Boolean).join("\n");

  const outcomeScore = scoreOutcome(session);
  session.outcome.score = outcomeScore;
  session.updatedAt = new Date().toISOString();

  if (outcomeScore >= 0.95) {
    session.status = "completed";
    session.completedAt = new Date().toISOString();
  }

  sessions.set(sessionId, session);
  saveSessions(sessions);

  return { turn, retrievedFacts: retrieved, clarificationNeeded, outcomeScore, newFacts, promptContext };
}

/** Add a citizen agent response turn to the session. */
export function addCitizenTurn(sessionId: string, content: string, outcomeProgress?: number): RacTurn | null {
  const sessions = loadSessions();
  const session = sessions.get(sessionId);
  if (!session) { return null; }

  const turn: RacTurn = {
    index: session.turns.length,
    role: "citizen",
    content,
    timestamp: new Date().toISOString(),
    retrievedFacts: [],
    outcomeProgress,
  };
  session.turns.push(turn);

  // Check if a pending clarification was resolved
  if (session.pendingClarifications.length > 0 && content.length > 20) {
    session.pendingClarifications.shift();  // assume first open clarification addressed
  }

  session.updatedAt = new Date().toISOString();
  sessions.set(sessionId, session);
  saveSessions(sessions);
  return turn;
}

/** Mark a milestone as reached. */
export function reachMilestone(sessionId: string, milestoneIndex: number): boolean {
  const sessions = loadSessions();
  const session = sessions.get(sessionId);
  if (!session || milestoneIndex >= session.outcome.milestones.length) { return false; }
  session.outcome.reached[milestoneIndex] = true;
  session.outcome.score = scoreOutcome(session);
  session.updatedAt = new Date().toISOString();
  sessions.set(sessionId, session);
  saveSessions(sessions);
  return true;
}

/** Get a session by ID. */
export function getSession(id: string): RacSession | null {
  return loadSessions().get(id) ?? null;
}

/** List all sessions (optionally filter by citizenId or status). */
export function listSessions(filter?: { citizenId?: string; status?: string; limit?: number }): RacSession[] {
  const sessions = [...loadSessions().values()];
  let result = sessions;
  if (filter?.citizenId) { result = result.filter(s => s.citizenId === filter.citizenId); }
  if (filter?.status) { result = result.filter(s => s.status === filter.status); }
  result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return result.slice(0, filter?.limit ?? 100);
}

/** Delete a session. */
export function deleteSession(id: string): boolean {
  const sessions = loadSessions();
  const had = sessions.has(id);
  sessions.delete(id);
  saveSessions(sessions);
  return had;
}

/** Get all facts across sessions, or for one session. */
export function getFacts(sessionId?: string): RacFact[] {
  const facts = [...loadFacts().values()];
  if (sessionId) { return facts.filter(f => f.sessionId === sessionId); }
  return facts;
}

/** Get RAC system stats. */
export function getRacStats() {
  const sessions = [...loadSessions().values()];
  const facts = [...loadFacts().values()];
  return {
    totalSessions: sessions.length,
    activeSessions: sessions.filter(s => s.status === "active").length,
    completedSessions: sessions.filter(s => s.status === "completed").length,
    totalFacts: facts.length,
    totalTurns: sessions.reduce((sum, s) => sum + s.turns.length, 0),
    avgOutcomeScore: sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.outcome.score, 0) / sessions.length
      : 0,
  };
}
