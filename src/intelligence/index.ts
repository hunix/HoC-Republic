/**
 * OpenClaw Intelligence System
 *
 * Main export file for the intelligence system
 */

export { AutonomousAgent } from "./autonomous-agent.js";
export type { Experience, Goal, Insight, KnowledgeGap, Lesson } from "./autonomous-agent.js";
export { IntelligenceCLI, runIntelligenceCLI } from "./cli.js";
export { installCommand, IntelligenceInstaller } from "./install.js";
export type { InstallConfig } from "./install.js";
export {
    CacheLayer,
    FlashLayer, LongTermMemory, MemorySystem, PermanentMemory, ShortTermMemory
} from "./memory-system.js";
export type {
    Entity, Memory,
    MemoryQuery,
    MemorySearchResult, Relationship
} from "./memory-system.js";
export {
    QuantumEntanglement, QuantumIntelligence, QuantumInterference, QuantumSuperposition, QuantumTunneling
} from "./quantum-intelligence.js";
export type {
    ActionPlan,
    ActionStep, Analogy, Decision,
    EntangledMemories, Hypothesis
} from "./quantum-intelligence.js";

