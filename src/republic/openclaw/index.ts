/**
 * OpenClaw Systems — Barrel Index
 *
 * Re-exports all OpenClaw subsystem singletons and types for
 * convenient consumption by the gateway and other modules.
 */

// ─── Task Flow Orchestration ─────────────────────────────────────
export { taskRegistry } from "./task-registry.js";
export type {
  TaskRecord,
  TaskState,
  CreateTaskOptions,
  TaskEvent,
  DeliveryPolicy,
} from "./task-registry.js";

export { taskExecutor } from "./task-executor.js";
export type { TaskExecutorConfig } from "./task-executor.js";

export { taskFlowRegistry } from "./task-flow-registry.js";
export type { TaskFlow, FlowState, CreateFlowOptions } from "./task-flow-registry.js";

// ─── Context Engine ─────────────────────────────────────────────
export { DefaultContextEngine } from "./context-engine.js";
export type {
  IContextEngine,
  ContextEntry,
  ContextWindow,
  ContextRole,
  CompactionResult,
} from "./context-engine.js";

export { contextEngineRegistry } from "./context-engine-registry.js";
export type { ContextEngineFactory } from "./context-engine-registry.js";

// ─── Memory Dreaming ────────────────────────────────────────────
export { dreamMemoryStore } from "./memory-dreaming.js";
export type { DreamMemory, DreamingResult, DreamingConfig } from "./memory-dreaming.js";

// ─── Media Generation Provider Registry ─────────────────────────
export { mediaProviderRegistry } from "./media-provider-registry.js";
export type {
  MediaType,
  MediaProvider,
  ImageProvider,
  VideoProvider,
  MusicProvider,
  ImageCapabilities,
  VideoCapabilities,
  MusicCapabilities,
  ImageGenerationRequest,
  VideoGenerationRequest,
  MusicGenerationRequest,
  ImageGenerationResult,
  VideoGenerationResult,
  MusicGenerationResult,
  ProviderHealth,
  ProviderStatus,
} from "./media-provider-registry.js";

// ─── Concrete Media Provider Adapters ───────────────────────────
export {
  wan2gpVideoProvider,
  comfyuiVideoProvider,
  comfyuiImageProvider,
  registerBuiltinMediaProviders,
} from "./media-providers.js";

// ─── MCP Channel Bridge ────────────────────────────────────────
export { mcpChannelBridge } from "./mcp-channel-bridge.js";
export type {
  MCPConversation,
  MCPMessage,
  MCPEvent,
  MCPToolCallRequest,
  MCPApprovalRequest,
  MCPServerConfig,
} from "./mcp-channel-bridge.js";

// ─── Realtime Voice ─────────────────────────────────────────────
export { realtimeVoiceBridge } from "./realtime-voice-bridge.js";
export type {
  VoiceSession,
  VoiceSessionState,
  TranscriptSegment,
  VoiceToolCall,
  VoiceProviderCapabilities,
  IVoiceProvider,
} from "./realtime-voice-bridge.js";

// ─── Realtime Transcription ─────────────────────────────────────
export { realtimeTranscription } from "./realtime-transcription.js";
export type {
  TranscriptionSession,
  TranscriptionResult,
  TranscriptionWord,
  TranscriptionProviderCapabilities,
  ITranscriptionProvider,
} from "./realtime-transcription.js";

// ─── Model Fallback Chain ───────────────────────────────────────
export {
  runWithFallback,
  getFallbackDiagnostics,
  clearAllCooldowns,
  isFallbackExhaustedError,
  FallbackExhaustedError,
} from "./model-fallback-chain.js";
export type {
  ModelCandidate,
  FallbackAttempt,
  FailoverReason,
  FallbackRunResult,
} from "./model-fallback-chain.js";

// ─── Tool Loop Detection ────────────────────────────────────────
export {
  createToolLoopSession,
  detectToolCallLoop,
  recordToolCall,
  recordToolCallOutcome,
  getToolCallStats,
  hashToolCall,
} from "./tool-loop-detection.js";
export type {
  ToolLoopSession,
  ToolLoopDetectionConfig,
  LoopDetectorKind,
  LoopDetectionResult,
} from "./tool-loop-detection.js";

// ─── Skills Hub (ClawHub Marketplace) ───────────────────────────
export { skillsHub } from "./skills-hub.js";
export type {
  SkillCatalogEntry,
  SkillCategory,
  SkillRating,
  SkillInstallRecord,
  SkillSearchParams,
  SkillSearchResult,
  SkillMatch,
} from "./skills-hub.js";

// ─── Bootstrap Budget ───────────────────────────────────────────
export { bootstrapBudget } from "./bootstrap-budget.js";
export type {
  BudgetConfig,
  BudgetSession,
  BudgetCheckResult,
  BudgetWarning,
  BudgetExceededReason,
} from "./bootstrap-budget.js";

// ─── Auth Profile Rotation ──────────────────────────────────────
export { authProfileRotation } from "./auth-profile-rotation.js";
export type {
  AuthProfile,
  KeyHealth,
  CooldownReason,
  RotationResult,
} from "./auth-profile-rotation.js";
