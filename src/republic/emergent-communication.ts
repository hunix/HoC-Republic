/**
 * Republic Platform — Emergent Communication Engine
 *
 * Phase AGI-4: Emergent Language & Protocol Evolution.
 *
 * Inspired by:
 *   - CORAL (ICML 2025) — emergent communicative world models
 *   - LLM Swarm Intelligence (arXiv 2025)
 *   - Conversational Swarm Intelligence (2024)
 *
 * Citizens develop their own vocabulary, jargon, and communication
 * protocols through repeated interaction. Tracks semantic drift,
 * cross-domain vocabulary adoption, and protocol efficiency.
 */

import type { RepublicState } from "./types.js";
import { rng, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

const COMM_TICK_INTERVAL = 10;
const MIN_ADOPTIONS_TO_PROMOTE = 3;
const SYMBOL_PRUNE_AGE = 1000;
const MAX_SYMBOLS = 200;
const MAX_PROTOCOLS = 20;
const MAX_EXCHANGES = 500;

// ─── Types ──────────────────────────────────────────────────────

export interface EmergentSymbol {
  id: string;
  token: string;
  meaning: string;
  originCitizenId: string;
  domain: string;
  adoptionCount: number;
  firstUsed: number;
  semanticHistory: Array<{ meaning: string; tick: number }>;
}

export interface CommunicationProtocol {
  id: string;
  name: string;
  description: string;
  creators: string[];
  messageSchema: Record<string, string>;
  adoptionRate: number;
  efficiency: number;
  createdAt: number;
}

export interface LanguageState {
  symbols: EmergentSymbol[];
  protocols: CommunicationProtocol[];
  vocabularyHistory: Array<{ tick: number; size: number }>;
  crossDomainAdoptions: number;
}

export interface DialogueExchange {
  fromCitizenId: string;
  toCitizenId: string;
  symbols: string[];
  understood: boolean;
  tick: number;
}

export interface CommunicationDiagnostics {
  totalSymbols: number;
  totalProtocols: number;
  avgAdoptionRate: number;
  crossDomainAdoptions: number;
  vocabularyGrowthRate: number;
}

// ─── State ──────────────────────────────────────────────────────

const symbols: EmergentSymbol[] = [];
const protocols: CommunicationProtocol[] = [];
const recentExchanges: DialogueExchange[] = [];
const vocabularyHistory: Array<{ tick: number; size: number }> = [];
let crossDomainAdoptions = 0;

// Domain-specific term generators
const DOMAIN_TERM_ROOTS: Record<string, string[]> = {
  technology: ["qubit", "neural", "algo", "syn", "mesh", "flux", "proto"],
  economy: ["cred", "yield", "stake", "mint", "liq", "vault", "bond"],
  governance: ["vox", "poll", "bill", "lex", "quorum", "writ", "edict"],
  research: ["hypo", "axiom", "proof", "theo", "lemma", "corpus", "meta"],
  social: ["bond", "link", "tribe", "vibe", "circle", "ally", "kin"],
  education: ["grad", "cert", "skill", "path", "tier", "mastery", "sage"],
  culture: ["meme", "lore", "myth", "rite", "saga", "anthem", "creed"],
  security: ["shield", "ward", "cipher", "guard", "scan", "sentinel", "aegis"],
};

const SUFFIXES = [
  "-x",
  "-net",
  "-wave",
  "-core",
  "-sync",
  "-link",
  "-flow",
  "-hub",
  "-ion",
  "-ware",
];

// ─── Symbol Creation ────────────────────────────────────────────

/** Coin a new emergent symbol */
export function coinSymbol(citizenId: string, domain: string, tick: number): EmergentSymbol | null {
  if (symbols.length >= MAX_SYMBOLS) {return null;}

  const roots = DOMAIN_TERM_ROOTS[domain] ?? DOMAIN_TERM_ROOTS["technology"];
  const root = roots[Math.floor(rng() * roots.length)];
  const suffix = SUFFIXES[Math.floor(rng() * SUFFIXES.length)];
  const token = `${root}${suffix}`;

  // Already exists?
  if (symbols.some((s) => s.token === token)) {return null;}

  const meanings: Record<string, string[]> = {
    technology: [
      "distributed computation protocol",
      "neural mesh topology",
      "quantum state resolver",
    ],
    economy: ["automated value exchange", "credit flow optimization", "staking mechanism"],
    governance: [
      "consensus acceleration method",
      "distributed voting pattern",
      "policy propagation",
    ],
    research: [
      "hypothesis validation pipeline",
      "cross-domain transfer method",
      "meta-analysis framework",
    ],
    social: [
      "trust propagation network",
      "collaborative bonding ritual",
      "influence cascade detector",
    ],
    education: [
      "skill acquisition pathway",
      "mastery verification protocol",
      "knowledge distillation",
    ],
    culture: ["memetic propagation vector", "tradition crystallization", "narrative convergence"],
    security: ["threat pattern classifier", "anomaly detection grid", "defense coordination"],
  };

  const domainMeanings = meanings[domain] ?? meanings["technology"];
  const meaning = domainMeanings[Math.floor(rng() * domainMeanings.length)];

  const symbol: EmergentSymbol = {
    id: uid(),
    token,
    meaning,
    originCitizenId: citizenId,
    domain,
    adoptionCount: 1,
    firstUsed: tick,
    semanticHistory: [{ meaning, tick }],
  };

  symbols.push(symbol);
  return symbol;
}

// ─── Dialogue Recording ─────────────────────────────────────────

/** Record a cross-citizen dialogue */
export function recordDialogue(exchange: DialogueExchange): void {
  recentExchanges.push(exchange);
  if (recentExchanges.length > MAX_EXCHANGES) {
    recentExchanges.splice(0, recentExchanges.length - MAX_EXCHANGES);
  }

  // Update symbol adoption counts
  for (const symId of exchange.symbols) {
    const sym = symbols.find((s) => s.id === symId);
    if (sym) {sym.adoptionCount++;}
  }
}

// ─── Protocol Detection ─────────────────────────────────────────

/** Detect emerging protocols from interaction patterns */
function detectProtocols(tick: number): void {
  if (protocols.length >= MAX_PROTOCOLS) {return;}

  // Group exchanges by participant pairs
  const pairCounts = new Map<string, { count: number; symbols: Set<string>; citizens: string[] }>();

  for (const ex of recentExchanges) {
    const key = [ex.fromCitizenId, ex.toCitizenId].toSorted().join("-");
    const entry = pairCounts.get(key) ?? {
      count: 0,
      symbols: new Set(),
      citizens: [ex.fromCitizenId, ex.toCitizenId],
    };
    entry.count++;
    for (const s of ex.symbols) {entry.symbols.add(s);}
    pairCounts.set(key, entry);
  }

  // Pairs with 5+ exchanges and shared symbols have formed a protocol
  for (const [, entry] of pairCounts) {
    if (entry.count < 5 || entry.symbols.size < 2) {continue;}

    const alreadyRegistered = protocols.some(
      (p) => p.creators.toSorted().join("-") === entry.citizens.toSorted().join("-"),
    );
    if (alreadyRegistered) {continue;}

    const schema: Record<string, string> = {};
    for (const symId of entry.symbols) {
      const sym = symbols.find((s) => s.id === symId);
      if (sym) {schema[sym.token] = sym.meaning;}
    }

    protocols.push({
      id: uid(),
      name: `Protocol-${protocols.length + 1}`,
      description: `Emergent communication protocol between ${entry.citizens.length} citizens`,
      creators: entry.citizens,
      messageSchema: schema,
      adoptionRate: entry.count / Math.max(1, recentExchanges.length),
      efficiency: 1.0 / Math.max(1, entry.symbols.size), // Fewer symbols = more efficient
      createdAt: tick,
    });
  }
}

// ─── Semantic Drift ─────────────────────────────────────────────

/** Track semantic drift — meanings evolve over time */
function trackSemanticDrift(tick: number): void {
  for (const sym of symbols) {
    // 5% chance of semantic drift per check
    if (rng() < 0.05 && sym.adoptionCount > 3) {
      const currentMeaning = sym.meaning;
      const variations = [
        `${currentMeaning} (extended)`,
        `${currentMeaning} [refined]`,
        `modern ${currentMeaning}`,
      ];
      const newMeaning = variations[Math.floor(rng() * variations.length)];

      sym.meaning = newMeaning;
      sym.semanticHistory.push({ meaning: newMeaning, tick });

      // Cap history
      if (sym.semanticHistory.length > 10) {
        sym.semanticHistory = sym.semanticHistory.slice(-10);
      }
    }
  }
}

// ─── Cross-Domain Adoption ──────────────────────────────────────

/** Simulate cross-domain vocabulary adoption */
function crossDomainAdoption(s: RepublicState, tick: number): void {
  // Citizens with multi-domain skills adopt terms from other domains
  for (const citizen of s.citizens) {
    if (citizen.skills.length < 3) {continue;}
    if (rng() > 0.1) {continue;} // 10% chance per eligible citizen

    // Find a symbol from a different domain
    const citizenDomains = new Set(["skill", "certification"]);
    const foreignSymbols = symbols.filter(
      (sym) => !citizenDomains.has(sym.domain) && sym.adoptionCount >= MIN_ADOPTIONS_TO_PROMOTE,
    );

    if (foreignSymbols.length > 0) {
      const adopted = foreignSymbols[Math.floor(rng() * foreignSymbols.length)];
      adopted.adoptionCount++;
      crossDomainAdoptions++;

      // Record as dialogue
      recordDialogue({
        fromCitizenId: adopted.originCitizenId,
        toCitizenId: citizen.id,
        symbols: [adopted.id],
        understood: rng() > 0.3, // 70% comprehension
        tick,
      });
    }
  }
}

// ─── Symbol Pruning ─────────────────────────────────────────────

/** Prune unused symbols */
function pruneSymbols(tick: number): void {
  const before = symbols.length;
  for (let i = symbols.length - 1; i >= 0; i--) {
    if (
      tick - symbols[i].firstUsed > SYMBOL_PRUNE_AGE &&
      symbols[i].adoptionCount < MIN_ADOPTIONS_TO_PROMOTE
    ) {
      symbols.splice(i, 1);
    }
  }
  if (symbols.length < before) {
    // Pruned some
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

/** Main tick — evolves language and protocols */
export function communicationTick(s: RepublicState): void {
  if (s.currentTick % COMM_TICK_INTERVAL !== 0) {return;}

  // 1. Generate new symbols from active citizens
  for (const citizen of s.citizens) {
    if (rng() > 0.15) {continue;} // 15% chance per citizen per tick

    const domains = Object.keys(DOMAIN_TERM_ROOTS);
    const domain = domains[Math.floor(rng() * domains.length)];
    coinSymbol(citizen.id, domain, s.currentTick);
  }

  // 2. Cross-domain adoption
  crossDomainAdoption(s, s.currentTick);

  // 3. Semantic drift
  trackSemanticDrift(s.currentTick);

  // 4. Detect protocols
  detectProtocols(s.currentTick);

  // 5. Prune unused symbols
  pruneSymbols(s.currentTick);

  // 6. Record vocabulary size
  vocabularyHistory.push({ tick: s.currentTick, size: symbols.length });
  if (vocabularyHistory.length > 200) {vocabularyHistory.splice(0, vocabularyHistory.length - 200);}
}

// ─── Diagnostics ────────────────────────────────────────────────

export function communicationDiagnostics(): CommunicationDiagnostics {
  const growthRate =
    vocabularyHistory.length >= 2
      ? (vocabularyHistory[vocabularyHistory.length - 1].size - vocabularyHistory[0].size) /
        Math.max(1, vocabularyHistory.length)
      : 0;

  return {
    totalSymbols: symbols.length,
    totalProtocols: protocols.length,
    avgAdoptionRate:
      symbols.length > 0
        ? symbols.reduce((s, sym) => s + sym.adoptionCount, 0) / symbols.length
        : 0,
    crossDomainAdoptions,
    vocabularyGrowthRate: growthRate,
  };
}

export function getLanguageState(): LanguageState {
  return {
    symbols: [...symbols],
    protocols: [...protocols],
    vocabularyHistory: [...vocabularyHistory],
    crossDomainAdoptions,
  };
}

export function getDomainVocabulary(domain: string): EmergentSymbol[] {
  return symbols.filter((s) => s.domain === domain);
}
