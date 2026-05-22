/**
 * Republic Platform — Module Index
 *
 * Barrel export for all republic modules.
 */

// Phase AGI-11: A2A Protocol (Google A2A)
export {
    a2aDiagnostics, a2aProtocolTick, discoverCapabilities, getReputation, HttpA2ATransport, isRemoteCitizen, registerRemoteNode, requestService as a2aRequestService, sendMessage as a2aSendMessage, unregisterRemoteNode, type A2ADiagnostics, type A2AMessage, type A2ATransport,
    type AgentCapability, type ServiceRequest as A2AServiceRequest
} from "./a2a-protocol.js";
// Phase 14: ACP Bridge
export {
    acpBridgeDiagnostics, getACPAgent, getACPTask, handleACPIncoming, listACPAgents, listACPTasks, registerACPEndpoint, resetACPState, sendACPTask, setIncomingTaskHandler, unregisterACPEndpoint, type ACPAgentInfo, type ACPBridgeDiagnostics, type ACPRequest,
    type ACPResponse, type ACPTask
} from "./acp-bridge.js";
// Phase 38: Agent Society Gap Analysis modules
// agent-protocol: explicit re-exports to avoid collisions with citizen-conversation.ts
export {
    consumePendingMessages, findAgentsByCapability,
    findAgentsByDomain, getActiveConversations as getActiveProtocolConversations, getAgentCard, getCitizenConversations as getProtocolConversations, getConversationById, getPendingMessages, initiateNegotiation, protocolDiagnostics, protocolTick, registerAgentCard, resetProtocolState, respondToNegotiation, sendProtocolMessage, type AgentCard, type Conversation as ProtocolConversation, type ConversationState, type NegotiationState, type Performative,
    type ProtocolMessage, type ProtocolTickResult
} from "./agent-protocol.js";
export * from "./agent-runtime.js";
// Phase 15: Agentic RAG & Evaluation
export {
    agenticSearch, decomposeQuery,
    evaluateResponseQuality, getEvalTrend, gradeRetrieval, ragDiagnostics, registerSearchProvider, resetRAGState, trackEvalMetrics, type AgenticSearchResult, type RAGDiagnostics, type ResponseEvaluation, type RetrievalGrade, type SearchResult, type SearchSource
} from "./agentic-rag.js";
// Phase 20: AI Fusion Engine
export {
    aiFusionTick, cascadeInference, createInferenceTask, executeEnsembleInference, executeInference, getAIFusionDiagnostics, getConsciousness, getModelRegistry, getModelsByCapability, getModelsByProvider, routeTask as routeAITask, setModelAvailability, updateConsciousness, type AIFusionDiagnostics, type ConsciousnessState, type InferenceResult, type InferenceTask, type ModalCapability,
    type ModelProfile, type ModelProvider, type TaskComplexity, type ValidationCriteria
} from "./ai-fusion.js";
export * from "./audio-studio.js";
// Phase 21: Autonomous CI/CD
export {
    autoApprove, buildProject, canaryDeploy, cicdDiagnostics, createPipeline, deploymentHistory, deployToEnvironment, monitorDeployment, resetCICDState, rollback, runTests, type BuildResult, type CanaryConfig,
    type CICDDiagnostics, type Deployment,
    type Pipeline,
    type PipelineStageResult, type TestResult
} from "./autonomous-cicd.js";
// autonomous-economy: explicit re-exports to avoid collisions with types.ts (ServiceListing) and treasury-manager.ts (RevenueRecord)
export {
    acceptBid, addToTreasury, createServiceListing as createEconomyListing, createTaskOffer, createTreasuryProposal, distributeRevenue, economyAgencyDiagnostics, economyAgencyTick, getTreasuryBalance, purchaseService,
    rateService, resetEconomyAgencyState, searchListings, submitBid, voteOnTreasuryProposal, type EconomyAgencyTickResult, type RevenueRecord as EconomyRevenueRecord, type ServiceListing as EconomyServiceListing,
    type ServicePurchase, type TaskBid, type TaskOffer, type TreasuryProposal
} from "./autonomous-economy.js";
export * from "./autonomous-learning.js";
// ─── Phase 29: Living Avatar Engine ────────────────────────────
export {
    avatarDiagnostics, avatarListen,
    avatarStartListening, createAvatarSession, detectEmotion, emotionToBlendshapes, endAvatarSession, getAvatarHistory, getAvatarSession, getAvatarState, getPersonality, listAvatarSessions, parseCommand, resetAvatar, setPersonality, textToVisemes, type AvatarDiagnostics, type AvatarEmotion,
    type AvatarGaze, type AvatarSession, type AvatarState, type CommandIntent, type CommandParseResult, type ConversationTurn as AvatarConversationTurn, type FaceBlendshapes, type PersonalityTraits, type SessionState, type Viseme
} from "./avatar-engine.js";
// Phase 19: Citizen Agency & Economic Autonomy
export {
    acceptServiceRequest, advanceGoal, agencyTick, applyForJob, autoMatchServices, completeServiceRequest, createQualifiedJob, generateGoals, getAgencyDiagnostics, getCitizenGoals, getOpenJobs, isQualified, requestService, type AgencyDiagnostics, type AutonomousGoal, type GoalMilestone as AgencyGoalMilestone, type GoalRequirement, type GoalTrigger, type GoalType, type QualifiedJob, type ServiceRequest
} from "./citizen-agency.js";
// citizen-conversation: explicit re-exports to avoid collision with social-life.ts (getConversation)
export {
    buildConversationPrompt, closeConversation, getActiveConversations, getCitizenConversations, getConversation as getCitizenConversation, getConversationDiagnostics, getConversationHistory, parseConversationResponse, recordCitizenResponse, sendUserMessage, startConversation
} from "./citizen-conversation.js";
export type { ConversationDiagnostics } from "./citizen-conversation.js";
// Phase 17: Citizen Culture & Cultural Evolution
export * from "./citizen-culture.js";
// Phase 27: Citizen Identity & Avatar System
export {
    applyHabitModifiers, generateAppearance, generateAvatarSVG, generateHabits,
    generateIdentityCard, generateVoiceProfile, inheritAppearance,
    type CitizenAppearance, type CitizenHabits,
    type CitizenIdentityCard, type VoiceProfile
} from "./citizen-identity.js";
export * from "./citizen-prompt.js";
export * from "./cloud-inference.js";
// Phase 20: Code Intelligence
export {
    analyzeDirectory, analyzeModule, codeIntelligenceDiagnostics, councilReview,
    createImprovementPlan, diagnoseCodeIssues,
    generateCodeFix, getGeneratedPatches, getRegisteredIssues, resetCodeIntelligenceState, reviewCodeDiff, validatePatch, type CodeIntelligenceDiagnostics, type CodeIssue,
    type CodePatch, type ComplexityMetrics, type CouncilReviewResult, type CouncilVote, type FunctionInfo, type ImprovementPlan,
    type ImprovementStep, type ModuleAnalysis, type ReviewResult
} from "./code-intelligence.js";
// Phase AGI-5: Cognitive Architecture (ACT-R, SOAR hybrid)
export * from "./cognitive-architecture.js";
// Phase AGI-7: Collective Intelligence (MARL, Quadratic Voting)
export * from "./collective-intelligence.js";
export * from "./compute-router.js";
// Phase 36: Dynamic Compute Scaling
export {
    getAllUsageRecords, getScalerDiagnostics, getUsageForCitizen, processQueue, recordUsage, requestCompute, type ComputeGrant, type ComputeRequest, type UsageRecord
} from "./compute-scaler.js";
export * from "./computer-use.js";
export * from "./constitution.js";
export * from "./content-studio.js";
export * from "./creative-studio.js";
// Phase ACE: Autonomous Cognition Engine
export * from "./curiosity-engine.js";
export * from "./delegation.js";
// dev-orchestration: explicit re-exports excluding names that collide with
// project-intake.ts (ProjectType), delegation.ts (TeamMember),
// autonomous-cicd.ts (Deployment), tool-forge.ts (QAResult),
// universal-model-engine.ts (createPipeline).
// Consumers needing the dev-orchestration versions should import directly.
export {
    advancePipeline, allDatabaseIds, allLanguageIds, autoFixIssues, clearActivePipelines, createBlankProject,
    createProjectFromTemplate, devPipelineTick, DEV_DATABASES,
    DEV_FRAMEWORKS, DEV_LANGUAGES, generateFileContent, generateProjectName, getDatabase,
    getFramework, getLanguage, PROJECT_TEMPLATES, proposeInnovation, runQAValidation, type AutoFixResult, type DatabaseSpec, type DevProject, type FrameworkSpec, type Innovation, type LanguageSpec, type ProjectFile, type ProjectStack, type ProjectStatus, type ProjectTemplate, type QAIssue, type TeamRole, type TestSuite, type WorkflowPipeline, type WorkflowStage, type WorkflowStageStatus
} from "./dev-orchestration.js";
// Phase 23: Inter-Module Diplomacy & Event Bus
export * from "./diplomacy.js";
// Phase 29: Distributed Computing
export {
    applyDelta, computeDelta, DistributedScheduler, GCounter,
    LWWRegister,
    ORSet, VectorClock
} from "./distributed-consensus.js";
// Phase 35: Docker Orchestration Engine
export {
    checkBudget, connectToNetwork,
    CONTAINER_PRESETS, createContainer, createNetwork, ensureDocker, execInContainer, getContainerLogs, getDockerDiagnostics, imageExists, initResourceBudget, inspectContainer, launchPreset, listContainers, listImages, listNetworks, pruneImages, pruneStoppedContainers, pullImage, reconcileManagedContainers, removeContainer, removeImage, removeNetwork, restartContainer, scheduleDockerReaper, startContainer,
    stopContainer, type ContainerConfig,
    type ContainerInfo, type DockerNetwork, type DockerReaperHandle, type DockerReaperOptions, type ImageInfo, type ResourceBudget
} from "./docker-orchestrator.js";

export * from "./document-generator.js";
// Phase 16: Document Ingestion & Multimodal
export {
    chunkText, deleteIngestedDocument,
    detectFormat, getIngestedDocument, ingestDocument, ingestionDiagnostics, ingestURL, listIngestedDocuments, registerExtractor, resetIngestionState, searchIngested, type DocumentChunk, type DocumentFormat, type IngestedDocument, type IngestionDiagnostics, type IngestionResult,
    type IngestionSearchResult
} from "./document-ingestion.js";
export * from "./economy-engine.js";
export * from "./economy.js";
export * from "./education.js";
export * from "./emergence-detector.js";
// Phase AGI-4: Emergent Communication (CORAL, LLM Swarm)
export * from "./emergent-communication.js";
// Phase AGI-9: Emergent Economics (DigEcoTwins)
export * from "./emergent-economics.js";
// Phase 31: Event Sourcing & National Coherence
export {
    emitNationalEvent, getNationalMetrics, nationalEventBus, sagaCoordinator, type NationalEvent,
    type NationalEventCategory
} from "./event-sourcing.js";
export * from "./evolution.js";
// Phase 18: Executive Authority & Governance Power
export * from "./executive-authority.js";
export * from "./external-comms.js";
export * from "./financial-gateway.js";
// Phase 25: Foreign Relations
export * from "./foreign-relations.js";
export * from "./genetics.js";
export * from "./genome-viz.js";
// Phase 19: Git Operations
export {
    addRemote, applyPatch, checkoutBranch, cloneRepo, cloneSelf, commitChanges, createBranch, createTag, diffBranches,
    diffUncommitted, forkRepo, getCommitLog, gitOperationsDiagnostics, listBranches, listRemotes, listTags, pullLatest, pushBranch, readRepoFile, repoStatus, resetGitOperations, writeRepoFile, type BranchInfo, type CloneOptions, type CommitLogEntry, type CommitOptions, type DiffFile, type DiffResult, type GitOperation,
    type GitOperationsDiagnostics, type PushOptions,
    type RepoStatus
} from "./git-operations.js";
export * from "./government.js";
export * from "./grid.js";
export * from "./hardware-iot.js";
// Phase 33: Infrastructure Control Plane
export {
    checkEligibility, checkInfraHealth, discoverRuntimes, getInfraDiagnostics, getInfraHealth, getRuntimeStatus, lookupModelRequirements, probeSystemResources, restartRuntime, startInfraMonitor, startRuntime, stopInfraMonitor, stopRuntime, type EligibilityResult,
    type InfraHealth, type ModelRequirements, type RuntimeName,
    type RuntimeStatus, type SystemResources
} from "./infra-control-plane.js";
// Phase 24: Judicial System
export {
    enactLaw, fileCase, getCases as getCourtCases, getJudicialDiagnostics, getLaws, getPrecedents, getViolations, renderVerdict, repealLaw, reportViolation, submitArgument, type CaseArgument, type CourtCase as JudicialCourtCase, type JudicialDiagnostics, type Law, type LawCategory, type LegalPrecedent, type Penalty, type VerdictType, type Violation, type ViolationSeverity
} from "./judicial-system.js";
// Phase 36: Local Compute Discovery
export * from "./local-compute.js";
export * from "./marketplace.js";
// Phase 14: MCP Server
export {
    clientConnected as mcpClientConnected,
    clientDisconnected as mcpClientDisconnected, createMCPServer, getServerInfo as getMCPServerInfo, handleMCPRequest, listMCPPrompts, listMCPResources, listMCPTools, mcpDiagnostics, processRawMessage, registerPrompt as registerMCPPrompt, registerResourceProvider,
    registerToolHandler, resetMCPState, startMCPTransport, type JSONRPCRequest,
    type JSONRPCResponse, type MCPDiagnostics, type MCPPrompt, type MCPResource, type MCPServer,
    type MCPTool
} from "./mcp-server.js";
// Phase 26: Media & Broadcasting
export * from "./media-broadcasting.js";
// Phase 13: Memory Knowledge Graph
export {
    addEdge as graphAddEdge, addNode as graphAddNode, buildGraphFromMemories, classifyEntity,
    decayEdges as graphDecayEdges, extractEntities, findNodeByLabel as graphFindNodeByLabel, findRelated as graphFindRelated, getCitizenNodes as graphGetCitizenNodes, getNode as graphGetNode, memoryGraphDiagnostics, memoryGraphTick, mergeNodes as graphMergeNodes, querySubgraph as graphQuerySubgraph, removeNode as graphRemoveNode, resetMemoryGraph, searchNodes as graphSearchNodes, type MemoryEdge, type MemoryGraphDiagnostics, type MemoryNode, type MemoryNodeType, type MemorySubgraph
} from "./memory-graph.js";
export * from "./memory-reflection.js";
export * from "./memory.js";
// Phase AGI-3: Meta-Learning (Gödel Agent, AlphaEvolve)
export * from "./meta-learning-engine.js";
// Phase 24: Mitosis Controller
export {
    anaphase, captureDNA, cytokinesis, decommissionInstance, fullMitosis, getDNA, getInstanceInfo, getLineage, initiateMitosis, listInstances, metaphase, mitosisDiagnostics, promoteInstance, prophase, resetMitosisState, telophase, type InstanceInfo,
    type MitosisDiagnostics, type MitosisProcess, type SystemDNA, type ValidationResult
} from "./mitosis-controller.js";
export * from "./model-council.js";
// Phase 34: HuggingFace Model Provisioner
export {
    autoSelectModel, downloadGGUF,
    getDownloadProgress, getHFRepoInfo, getInstalledModels, getProvisionerDiagnostics, GGUF_MODEL_REGISTRY, listRepoGGUFs, loadIntoLMStudio, loadIntoOllama, provisionModel, searchHuggingFaceModels, selectQuantization, type DownloadProgress, type GGUFModelEntry, type ProvisioningResult
} from "./model-provisioner.js";
export {
    approveTreasuryOperation, assessCitizenThreat, checkRateLimit, getDefenseDiagnostics, isQuarantined, quarantineCitizen,
    releaseCitizen, requestTreasuryApproval, requiresApproval, runSecurityScan
} from "./national-defense.js";
export * from "./observability.js";
export * from "./orchestrator.js";
// Phase 28: Performance Optimization
export {
    AdaptiveTickController, createEventLoopMonitor, deepFreeze,
    hiResTimer,
    shouldRunModule, streamJSON, WeakCache, WorkerPool
} from "./perf-utils.js";
// Phase 37: Database Persistence Layer
export {
    BatchWriter, createSystemSnapshot, DomainStore, flushAllStores, getDomainStore, getPersistenceDiagnostics, listSystemSnapshots, PersistentLog, PersistentMap, SnapshotManager
} from "./persistence-layer.js";
// Phase 26: PersonaPlex Voice Persona Engine
export {
    configurePersonaPlex, connect as personaplexConnect, createPersona, createPersonaPlexSTTHandler,
    createPersonaPlexTTSHandler, deletePersona, disconnect as personaplexDisconnect, endConversation as endPersonaConversation, getActivePersona, getConnectionState as personaplexConnectionState, getConversation as getPersonaConversation, getPersona, getPersonaPlexConfig, getServerStatus as personaplexServerStatus, getTranscript as getPersonaTranscript, healthCheck as personaplexHealthCheck, listConversations as listPersonaConversations, listPersonas, pauseConversation as pausePersonaConversation, personaplexDiagnostics, resumeConversation as resumePersonaConversation, sendAudioChunk,
    sendTextMessage as sendPersonaTextMessage, setActivePersona, startConversation as startPersonaConversation, updatePersona, type AudioChunk, type ConnectionState, type ConversationResponse, type ConversationSession as PersonaConversationSession, type ConversationStatus as PersonaConversationStatus,
    type ConversationTurn, type PersonaPlexConfig, type PersonaPlexDiagnostics, type PersonaPlexStatus, type PersonaProfile, type PersonaStyle
} from "./personaplex-engine.js";
export * from "./policy-evolution.js";
export * from "./population.js";
// Phase 32: Superhuman Capabilities
export {
    collectiveAnalysis, detectAnomalies,
    optimizeResourceAllocation, predictPolicyOutcome
} from "./predictive-governance.js";
export * from "./process-manager.js";
// Phase 16: Professional Civilization Engine
export * from "./professional-domains.js";
export * from "./professional-practice.js";
export * from "./progress-reporter.js";
export * from "./project-intake.js";
// Phase 23: Quantum-Entangled State Replication
export {
    collapseState, createSwarm, decohere, entangle, getPairState,
    listEntangledPairs, propagateState, quantumSyncDiagnostics,
    resetQuantumSyncState, swarmBroadcast, teleportState, type CollapseResult, type EntangledPair, type PropagationResult, type QuantumState, type QuantumSyncDiagnostics, type SwarmCoordination, type SwarmNode, type TeleportResult
} from "./quantum-state-sync.js";
export * from "./real-execution.js";
// Phase 18: Reasoning Distillation & Synthetic Data
export {
    captureCoT, createTrainingSet, distillationDiagnostics, distillReasoning, evaluateDistillation, exportTrainingSet, generateSyntheticData, getCoT, getDistilled, getTrainingSet, resetDistillationState,
    type ChainOfThought, type DistillationMetrics, type DistilledTrace, type ReasoningStep, type SyntheticSample,
    type TrainingSet
} from "./reasoning-distillation.js";
// Phase AGI-2: Neuro-Symbolic Reasoning (GNN-RAG, LogiCity)
export * from "./reasoning-engine.js";
export * from "./republic-config.js";
export * from "./republic-db.js";
export * from "./republic-store.js";
export {
    conductResearch, getActiveResearch, getKnowledgeBaseStats, getResearchJournal, initResearchFromState, researchDiagnostics, searchKnowledgeBase, syncResearchToState, type KnowledgeArticle, type PeerReview, type ResearchDiagnostics, type ResearchFinding, type ResearchPhase,
    type ResearchSession
} from "./research-engine.js";
// Phase 30: Resilience & Self-Healing
export {
    checkSystemHealth, CircuitBreaker, createSystemProbes, getAllCircuitBreakerDiagnostics, getCircuitBreaker, getSelfHealingDiagnostics, registerHealthProbe, startSelfHealingLoop,
    stopSelfHealingLoop, WatchdogTimer
} from "./resilience.js";
// Phase 22: Self-Diagnostics & Healing
export {
    autoHealCycle, diagnoseAnomalies, executeHealing, fullSystemScan, prescribeHealing, resetSelfDiagnosticsState, selfDiagnosticsSummary, type Anomaly,
    type Diagnosis, type HealingResult, type Prescription, type SelfDiagnosticsSummary, type SubsystemHealth, type SystemSnapshot
} from "./self-diagnostics.js";
// self-learning: explicit re-exports to avoid collisions with memory.ts and republic-db.ts
export {
    abandonGoal, completeGoal as completeLearningGoal, completeMilestone, decayBehavior, evaluateGoalProgress, generateCurriculum, getActionRewardAverage, getCitizenLevel, getCitizenSkills as getCitizenSkillTree, getCurriculum, getGoals, getSelfLearningDiagnostics, getSkillTree, getTopActions, learnSkill, reflectOnActions, reinforceBehavior, setGoal as setLearningGoal, shareKnowledge
} from "./self-learning.js";
export type { SelfLearningDiagnostics } from "./self-learning.js";
// Phase 21: Self-Replication & Infrastructure Evolution
export {
    adjustParameter, applySchemaExtension, autoTune, deployProposal, evaluateHealth, executeReplication, getActiveChaosExperiments, getActiveReplicas, getInfrastructureHealth, getProposals, getSchemaExtensions, getSelfReplicationDiagnostics, getTuningParameters, openProposalForReview, proposeSchemaExtension, revertSchemaExtension, selfReplicationTick, startChaosExperiment, submitProposal, terminateReplica, voteOnProposal, type ChaosExperiment, type CodeProposal, type InfrastructureHealth, type ProposalCategory, type ProposalStatus, type SchemaExtension, type SelfReplicationDiagnostics, type TuningParameter
} from "./self-replication.js";
export * from "./social-life.js";
export * from "./spatial-world.js";
export * from "./state.js";
export * from "./swarm-intelligence.js";
// ─── Phase 30: System Pulse ────────────────────────────────────
export {
    getLatestPulse, getPulseHistory,
    getUnresolvedAlerts as getPulseAlerts, isPulseRunning, listCollectors as listPulseCollectors, pulseDiagnostics, registerCollector as registerPulseCollector, registerDefaultCollectors, resetPulse, resolveAlert as resolvePulseAlert, startPulse,
    stopPulse, takePulse, unregisterCollector as unregisterPulseCollector, type PulseAlert,
    type PulseHistory, type PulseSignal,
    type PulseSnapshot, type PulseStatus,
    type SignalSource, type SystemPulseDiagnostics
} from "./system-pulse.js";
export * from "./technology.js";
// Phase 22: Temporal Simulation Engine
export {
    advanceTick, cancelScheduledEvent, getClock, getEraInfo, getHistory, getScheduledEvents, getTemporalDiagnostics, onEraTransition, pauseSimulation, recordHistory, resumeSimulation, scheduleEvent, setSimulationSpeed, temporalDecay,
    temporalGrowth, transitionEra, type Era, type HistoricalRecord, type ScheduledEvent as TemporalScheduledEvent, type SimulationClock, type TemporalDiagnostics
} from "./temporal-engine.js";
// tool-executor: explicit re-exports to avoid collisions with tools.ts (getTool) and financial-gateway.ts (getPendingApprovals)
export {
    approveInvocation, getCitizenInvocations, getEnabledTools, getPendingApprovals as getToolPendingApprovals, getTool as getExecutorTool, getToolsForTier, registerTool as registerExecutorTool, rejectInvocation, setToolEnabled,
    submitToolInvocation, toolExecutorDiagnostics, toolExecutorTick, type ApprovalRequest as ToolApprovalRequest, type ToolDefinition, type ToolExecutorTickResult, type ToolInvocation, type ToolTier
} from "./tool-executor.js";
export {
    evolveToolByCritique, forgeDiagnostics, getActiveForgings, getToolLibrary, identifyToolGap, initForgeFromState, recordToolUsage, syncForgeToState, synthesizeTool, type ForgeDiagnostics, type ForgedTool, type ForgePhase, type ForgingSession,
    type QAResult, type ToolProposal
} from "./tool-forge.js";
export * from "./tools.js";
export * from "./treasury-manager.js";
export * from "./trust-reputation.js";
export * from "./types.js";
// Phase 25: Universal Model Intelligence Engine
export {
    createPipeline as createModelPipeline, deregisterModel, executePipeline as executeModelPipeline, getModel, getPipeline as getModelPipeline, infer, listModels, listPipelines as listModelPipelines, modelExists, recursiveInfer, registerModel, umieDiagnostics, type ActionLog, type InferenceInput,
    type InferenceParams, type InferenceRequest as UMIEInferenceRequest, type InferenceResult as UMIEInferenceResult, type LatencyProfile, type Modality,
    type ModelCapability, type ModelDescriptor, type ModelParadigm, type ModelStatus, type MoEConfig, type PipelineDescriptor as ModelPipelineDescriptor,
    type PipelineResult as ModelPipelineResult, type PipelineStep as ModelPipelineStep, type RecursionConfig, type RecursionTrace, type TokenUsage, type ToolConfig as UMIEToolConfig, type ToolDefinition as UMIEToolDefinition, type UMIEDiagnostics
} from "./universal-model-engine.js";
export * from "./utils.js";
// ─── Phase 28: Vector DB Orchestration ─────────────────────────
export {
    createCluster as createVectorCluster, createCollection as createVectorCollection, deleteCluster as deleteVectorCluster, deleteDocument, describeCollection, dropCollection, findCollectionByName, getCluster as getVectorCluster, getCollection as getVectorCollection, getDocumentCount, healthCheckCluster, insertDocuments, isProviderRegistered as isVectorProviderRegistered, listClusters as listVectorClusters,
    listClustersByProvider, listCollections as listVectorCollections, listProviders as listVectorProviders, queryCollection, registerProvider as registerVectorProvider, resetVectorDB, routeQuery, startCluster as startVectorCluster, stopCluster as stopVectorCluster, unregisterProvider as unregisterVectorProvider, upsertDocuments, vectordbDiagnostics, type ClusterHealth, type ClusterMode,
    type ClusterStatus, type DistanceMetric,
    type IndexType, type QueryResponse, type QueryResult, type VectorCluster, type VectorCollection, type VectorDBDiagnostics, type VectorDBProviderConfig, type VectorDBProviderType, type VectorDocument,
    type VectorQuery
} from "./vectordb-engine.js";
export * from "./vision.js";
// Phase 17: Voice I/O
export {
    endVoiceSession, getActiveSessions, getSessionTranscript, getVoiceSession, listCitizenSessions, pauseVoiceSession, processAudioChunk, registerSTTProvider,
    registerTTSProvider, resetVoiceState, resumeVoiceSession, startVoiceSession, synthesizeSpeech, voiceDiagnostics, type SynthesisEntry, type TranscriptionEntry, type VoiceConfig, type VoiceDiagnostics, type VoiceProvider,
    type VoiceSession
} from "./voice-io.js";
export * from "./web-research.js";
// Worker Pool (republic-level, aliased to avoid collision with perf-utils WorkerPool)
export {
    CPU_BOUND_TICKS, getWorkerPool, IO_BOUND_TICKS, shutdownWorkerPool, WorkerPool as RepublicWorkerPool, type WorkerResult, type WorkerTask
} from "./worker-pool.js";
export * from "./workspace-manager.js";
// ─── AGI Engine Suite ───────────────────────────────────────────
// Phase AGI-1: World Model Engine (Active Inference, JEPA)
export * from "./world-model-engine.js";
// ─── Innovation Roadmap: Civilizational Engines ─────────────────
export * from "./civilizational-engines.js";
// ─── ComfyUI Manager ────────────────────────────────────────────
export * from "./comfyui-manager.js";



