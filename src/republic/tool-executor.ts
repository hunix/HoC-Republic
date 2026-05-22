/**
 * Republic Platform — Tool Executor (Sandboxed Action Pipeline)
 *
 * Phase 38: MCP + ReAct-inspired sandboxed tool execution.
 *
 * Provides a tiered permission system for citizen tool access:
 * - Tier 0: Reflex (deterministic, no LLM)
 * - Tier 1: Internal tools (read state, query memory, event bus)
 * - Tier 2: External tools (file I/O, API calls — requires approval above threshold)
 * - Tier 3: Financial tools (crypto transactions — requires multi-sig council)
 *
 * Research basis:
 * - Anthropic MCP (Nov 2024): standardized tool access
 * - ReAct pattern: reason about tool selection before acting
 * - AMCP: strategic multi-step reasoning for tool chains
 *
 * Key capabilities:
 * 1. Tiered permission system (0-3)
 * 2. Tool registry with metadata
 * 3. Execution sandbox with timeout and budget
 * 4. Approval workflow for high-tier actions
 * 5. Execution audit trail
 * 6. toolExecutorTick() — tick loop integration
 */

import { ts, uid } from "./utils.js";
import { REPUBLIC_TOOLS } from "./tools.js";
import type { Citizen, RepublicState } from "./types.js";

// Lazy state/citizen resolution for real tool execution.
// We cannot statically import state.ts (circular dep), so we use a cached
// dynamic reference that is resolved on first call.
let _getStateFn: (() => import("./types.js").RepublicState) | null = null;
function resolveExecutionContext(citizenId: string): { state: RepublicState; citizen: Citizen } | null {
  try {
    if (!_getStateFn) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _getStateFn = (require("./state.js") as { getState: () => RepublicState }).getState;
    }
    const s = _getStateFn();
    const citizen = s.citizens.find((c: Citizen) => c.id === citizenId);
    if (!citizen) { return null; }
    return { state: s, citizen };
  } catch {
    return null;
  }
}

// Build a map from executor tool IDs → REPUBLIC_TOOLS by name for bridging.
// Lazy-init to avoid circular dependency crash: the bundler may evaluate
// tool-executor.ts before tools.ts has populated REPUBLIC_TOOLS.
let _republicToolMap: Map<string, import("./types.js").RepublicTool> | null = null;
function getRepublicToolMap() {
  if (!_republicToolMap) {
    _republicToolMap = new Map((REPUBLIC_TOOLS ?? []).map((t) => [t.name, t]));
  }
  return _republicToolMap;
}

// ─── Tool Registry ──────────────────────────────────────────────

export type ToolTier = 0 | 1 | 2 | 3;

export interface ToolDefinition {
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this tool does */
  description: string;
  /** Permission tier */
  tier: ToolTier;
  /** Category */
  category: "internal" | "filesystem" | "network" | "financial" | "computation" | "communication";
  /** Parameters the tool accepts */
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  /** Whether this tool is currently enabled */
  enabled: boolean;
  /** Max execution time in milliseconds */
  timeoutMs: number;
  /** Estimated cost per invocation */
  estimatedCost: { tokens?: number; credits?: number; computeMs?: number };
}

/** Built-in tool registry */
const toolRegistry = new Map<string, ToolDefinition>();

/** Pre-register standard tools */
function initializeDefaultTools(): void {
  const defaults: ToolDefinition[] = [
    // ── Tier 0: Reflex ──
    {
      id: "read_state",
      name: "Read State",
      description: "Read current republic state variables",
      tier: 0,
      category: "internal",
      parameters: [
        { name: "path", type: "string", required: true, description: "State path to read" },
      ],
      enabled: true,
      timeoutMs: 100,
      estimatedCost: { computeMs: 10 },
    },
    {
      id: "get_time",
      name: "Get Time",
      description: "Get current tick and wall clock time",
      tier: 0,
      category: "internal",
      parameters: [],
      enabled: true,
      timeoutMs: 50,
      estimatedCost: { computeMs: 1 },
    },

    // ── Tier 1: Internal ──
    {
      id: "query_memory",
      name: "Query Memory",
      description: "Search citizen's own memory by relevance",
      tier: 1,
      category: "internal",
      parameters: [
        { name: "query", type: "string", required: true, description: "Search query" },
        { name: "topK", type: "number", required: false, description: "Number of results" },
      ],
      enabled: true,
      timeoutMs: 500,
      estimatedCost: { computeMs: 50 },
    },
    {
      id: "send_message",
      name: "Send Message",
      description: "Send a protocol message to another citizen",
      tier: 1,
      category: "communication",
      parameters: [
        { name: "receiverId", type: "string", required: true, description: "Target citizen" },
        { name: "content", type: "string", required: true, description: "Message content" },
      ],
      enabled: true,
      timeoutMs: 200,
      estimatedCost: { tokens: 100, computeMs: 20 },
    },
    {
      id: "emit_event",
      name: "Emit Event",
      description: "Publish an event to the national event bus",
      tier: 1,
      category: "internal",
      parameters: [
        { name: "eventType", type: "string", required: true, description: "Event type" },
        { name: "payload", type: "object", required: true, description: "Event data" },
      ],
      enabled: true,
      timeoutMs: 200,
      estimatedCost: { computeMs: 15 },
    },

    // ── Tier 2: External ──
    {
      id: "read_file",
      name: "Read File",
      description: "Read a file from the workspace",
      tier: 2,
      category: "filesystem",
      parameters: [{ name: "path", type: "string", required: true, description: "File path" }],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { tokens: 500, computeMs: 200 },
    },
    {
      id: "write_file",
      name: "Write File",
      description: "Write content to a file in the workspace",
      tier: 2,
      category: "filesystem",
      parameters: [
        { name: "path", type: "string", required: true, description: "File path" },
        { name: "content", type: "string", required: true, description: "File content" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { tokens: 200, computeMs: 300 },
    },
    {
      id: "http_request",
      name: "HTTP Request",
      description: "Make an HTTP request to an external API",
      tier: 2,
      category: "network",
      parameters: [
        { name: "url", type: "string", required: true, description: "Request URL" },
        { name: "method", type: "string", required: false, description: "HTTP method" },
        { name: "body", type: "string", required: false, description: "Request body" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { tokens: 1000, credits: 1, computeMs: 500 },
    },

    // ── Tier 3: Financial ──
    {
      id: "transfer_credits",
      name: "Transfer Credits",
      description: "Transfer internal credits to another citizen",
      tier: 3,
      category: "financial",
      parameters: [
        { name: "recipientId", type: "string", required: true, description: "Recipient citizen" },
        { name: "amount", type: "number", required: true, description: "Credit amount" },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { credits: 1, computeMs: 100 },
    },
    {
      id: "crypto_transaction",
      name: "Crypto Transaction",
      description: "Initiate a cryptocurrency transaction (requires council approval)",
      tier: 3,
      category: "financial",
      parameters: [
        { name: "currency", type: "string", required: true, description: "ETH or BTC" },
        { name: "amount", type: "string", required: true, description: "Amount to send" },
        { name: "recipient", type: "string", required: true, description: "Wallet address" },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { credits: 10, computeMs: 1000 },
    },
  ];

  // ── Phase 13: Graph Memory Tools ──
  defaults.push(
    {
      id: "graph_query",
      name: "Graph Query",
      description: "Query the knowledge graph for entities and relationships related to a topic",
      tier: 1,
      category: "internal",
      parameters: [
        {
          name: "nodeId",
          type: "string",
          required: true,
          description: "Node ID or label to query from",
        },
        {
          name: "depth",
          type: "number",
          required: false,
          description: "Traversal depth (default 2)",
        },
      ],
      enabled: true,
      timeoutMs: 300,
      estimatedCost: { computeMs: 30 },
    },
    {
      id: "graph_add_entity",
      name: "Add Graph Entity",
      description: "Add an entity node to the citizen's knowledge graph",
      tier: 1,
      category: "internal",
      parameters: [
        { name: "label", type: "string", required: true, description: "Entity label/name" },
        {
          name: "type",
          type: "string",
          required: false,
          description: "Node type (entity/concept/event/location/skill)",
        },
      ],
      enabled: true,
      timeoutMs: 200,
      estimatedCost: { computeMs: 10 },
    },
    {
      id: "graph_find_related",
      name: "Find Related Entities",
      description: "Find related entities using spreading activation in the knowledge graph",
      tier: 1,
      category: "internal",
      parameters: [
        { name: "nodeId", type: "string", required: true, description: "Starting node ID" },
        {
          name: "topK",
          type: "number",
          required: false,
          description: "Number of results (default 10)",
        },
      ],
      enabled: true,
      timeoutMs: 300,
      estimatedCost: { computeMs: 40 },
    },
  );

  // ── Phase 14: MCP & ACP Tools ──
  defaults.push(
    {
      id: "mcp_list_tools",
      name: "List MCP Tools",
      description: "List all available tools exposed via the MCP protocol",
      tier: 0,
      category: "internal",
      parameters: [],
      enabled: true,
      timeoutMs: 100,
      estimatedCost: { computeMs: 5 },
    },
    {
      id: "mcp_call_tool",
      name: "Call MCP Tool",
      description: "Invoke a tool on an external MCP server",
      tier: 2,
      category: "network",
      parameters: [
        { name: "serverUrl", type: "string", required: true, description: "MCP server URL" },
        { name: "toolName", type: "string", required: true, description: "Tool name to invoke" },
        { name: "arguments", type: "object", required: false, description: "Tool arguments" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { tokens: 500, credits: 1, computeMs: 500 },
    },
    {
      id: "acp_send_task",
      name: "Send ACP Task",
      description: "Send a task to an external agent via the Agent Communication Protocol",
      tier: 2,
      category: "network",
      parameters: [
        { name: "agentId", type: "string", required: true, description: "Target agent ID" },
        { name: "description", type: "string", required: true, description: "Task description" },
        { name: "payload", type: "object", required: false, description: "Task payload data" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { tokens: 300, credits: 1, computeMs: 500 },
    },
    {
      id: "acp_register",
      name: "Register ACP Agent",
      description: "Register an external agent's ACP endpoint for collaboration",
      tier: 2,
      category: "network",
      parameters: [
        { name: "agentId", type: "string", required: true, description: "Agent identifier" },
        { name: "url", type: "string", required: true, description: "Agent's ACP endpoint URL" },
        {
          name: "framework",
          type: "string",
          required: false,
          description: "Agent framework (e.g., crewai, smolagents)",
        },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 20 },
    },
  );

  // ── Phase 15: Agentic RAG & Evaluation Tools ──
  defaults.push(
    {
      id: "agentic_search",
      name: "Agentic Search",
      description: "Multi-step agentic search with query decomposition and re-retrieval",
      tier: 1,
      category: "internal",
      parameters: [
        { name: "query", type: "string", required: true, description: "Search query" },
        {
          name: "sources",
          type: "string",
          required: false,
          description: "Comma-separated sources to search",
        },
        { name: "topK", type: "number", required: false, description: "Max results (default 10)" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 200 },
    },
    {
      id: "eval_response",
      name: "Evaluate Response",
      description: "Evaluate response quality for faithfulness, relevance, and completeness",
      tier: 1,
      category: "internal",
      parameters: [
        { name: "question", type: "string", required: true, description: "The question asked" },
        { name: "answer", type: "string", required: true, description: "The answer to evaluate" },
        {
          name: "sources",
          type: "string",
          required: false,
          description: "Source texts (JSON array)",
        },
      ],
      enabled: true,
      timeoutMs: 1000,
      estimatedCost: { computeMs: 50 },
    },
    {
      id: "eval_trend",
      name: "Evaluation Trend",
      description: "Get evaluation quality trend for a citizen over time",
      tier: 0,
      category: "internal",
      parameters: [
        { name: "citizenId", type: "string", required: true, description: "Citizen ID" },
        {
          name: "windowSize",
          type: "number",
          required: false,
          description: "Window size (default 10)",
        },
      ],
      enabled: true,
      timeoutMs: 200,
      estimatedCost: { computeMs: 10 },
    },
  );

  // ── Phase 16: Document Ingestion & Multimodal Tools ──
  defaults.push(
    {
      id: "ingest_document",
      name: "Ingest Document",
      description: "Ingest a document with automatic format detection, extraction, and chunking",
      tier: 1,
      category: "internal",
      parameters: [
        {
          name: "content",
          type: "string",
          required: true,
          description: "Document content or text",
        },
        { name: "title", type: "string", required: false, description: "Document title" },
        {
          name: "filename",
          type: "string",
          required: false,
          description: "Filename for format detection",
        },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 300 },
    },
    {
      id: "search_ingested",
      name: "Search Documents",
      description: "Search across all ingested documents by keyword",
      tier: 0,
      category: "internal",
      parameters: [
        { name: "query", type: "string", required: true, description: "Search query" },
        { name: "topK", type: "number", required: false, description: "Max results (default 10)" },
      ],
      enabled: true,
      timeoutMs: 2000,
      estimatedCost: { computeMs: 50 },
    },
    {
      id: "ingest_url",
      name: "Ingest URL",
      description: "Fetch and ingest content from a URL",
      tier: 2,
      category: "network",
      parameters: [
        { name: "url", type: "string", required: true, description: "URL to fetch and ingest" },
        { name: "title", type: "string", required: false, description: "Document title" },
      ],
      enabled: true,
      timeoutMs: 15000,
      estimatedCost: { computeMs: 500, credits: 1 },
    },
    {
      id: "ocr_image",
      name: "OCR Image",
      description: "Extract text from an image using OCR (requires vision module)",
      tier: 2,
      category: "computation",
      parameters: [
        { name: "imagePath", type: "string", required: true, description: "Path to image file" },
        {
          name: "language",
          type: "string",
          required: false,
          description: "OCR language (default: en)",
        },
      ],
      enabled: true,
      timeoutMs: 15000,
      estimatedCost: { tokens: 500, computeMs: 1000 },
    },
  );

  // ── Phase 17: Voice Agent Tools ──
  defaults.push(
    {
      id: "voice_session_start",
      name: "Start Voice Session",
      description: "Start a new voice I/O session for a citizen",
      tier: 2,
      category: "communication",
      parameters: [
        {
          name: "language",
          type: "string",
          required: false,
          description: "Language code (default: en)",
        },
        { name: "voice", type: "string", required: false, description: "Voice ID for TTS" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 100 },
    },
    {
      id: "voice_listen",
      name: "Voice Listen",
      description: "Process audio input through STT transcription",
      tier: 2,
      category: "communication",
      parameters: [
        { name: "sessionId", type: "string", required: true, description: "Voice session ID" },
        {
          name: "audioData",
          type: "string",
          required: true,
          description: "Base64-encoded audio data",
        },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { tokens: 200, computeMs: 500 },
    },
    {
      id: "voice_speak",
      name: "Voice Speak",
      description: "Synthesize text to speech",
      tier: 2,
      category: "communication",
      parameters: [
        { name: "sessionId", type: "string", required: true, description: "Voice session ID" },
        { name: "text", type: "string", required: true, description: "Text to synthesize" },
        { name: "voice", type: "string", required: false, description: "Voice override" },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { tokens: 100, computeMs: 500 },
    },
    {
      id: "voice_session_end",
      name: "End Voice Session",
      description: "End a voice session and release resources",
      tier: 1,
      category: "communication",
      parameters: [
        { name: "sessionId", type: "string", required: true, description: "Voice session ID" },
      ],
      enabled: true,
      timeoutMs: 1000,
      estimatedCost: { computeMs: 10 },
    },
  );

  // ── Phase 18: Reasoning Distillation & Synthetic Data Tools ──
  defaults.push(
    {
      id: "distill_reasoning",
      name: "Distill Reasoning",
      description: "Distill a chain-of-thought trace into compressed student-friendly format",
      tier: 1,
      category: "computation",
      parameters: [
        { name: "cotId", type: "string", required: true, description: "Chain-of-thought trace ID" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 100 },
    },
    {
      id: "generate_synthetic",
      name: "Generate Synthetic Data",
      description: "Generate synthetic training samples for a domain",
      tier: 2,
      category: "computation",
      parameters: [
        {
          name: "domain",
          type: "string",
          required: true,
          description: "Domain (coding, research, governance)",
        },
        {
          name: "count",
          type: "number",
          required: true,
          description: "Number of samples to generate",
        },
        {
          name: "difficulty",
          type: "string",
          required: false,
          description: "easy, medium, or hard",
        },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 500, tokens: 1000 },
    },
    {
      id: "export_training_set",
      name: "Export Training Set",
      description: "Export synthetic data as a training set in various formats",
      tier: 1,
      category: "internal",
      parameters: [
        { name: "name", type: "string", required: true, description: "Training set name" },
        {
          name: "format",
          type: "string",
          required: false,
          description: "Format: alpaca, sharegpt, openai",
        },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 200 },
    },
    {
      id: "eval_distillation",
      name: "Evaluate Distillation",
      description: "Compare teacher vs student outputs and assess distillation quality",
      tier: 0,
      category: "internal",
      parameters: [
        {
          name: "teacherAnswer",
          type: "string",
          required: true,
          description: "Teacher model answer",
        },
        {
          name: "studentAnswer",
          type: "string",
          required: true,
          description: "Student model answer",
        },
      ],
      enabled: true,
      timeoutMs: 1000,
      estimatedCost: { computeMs: 20 },
    },
  );

  // ── Phase 19: Git Operations Tools ──
  defaults.push(
    {
      id: "git_clone",
      name: "Git Clone",
      description: "Clone a git repository to a target directory",
      tier: 2,
      category: "computation",
      parameters: [
        { name: "url", type: "string", required: true, description: "Repository URL to clone" },
        { name: "targetDir", type: "string", required: true, description: "Target directory" },
        { name: "branch", type: "string", required: false, description: "Branch to clone" },
        { name: "depth", type: "number", required: false, description: "Shallow clone depth" },
      ],
      enabled: true,
      timeoutMs: 120000,
      estimatedCost: { computeMs: 5000 },
    },
    {
      id: "git_clone_self",
      name: "Git Clone Self",
      description: "Clone the HoC repository itself to a new location (self-replication)",
      tier: 3,
      category: "computation",
      parameters: [
        {
          name: "targetDir",
          type: "string",
          required: true,
          description: "Target directory for the clone",
        },
      ],
      enabled: true,
      timeoutMs: 120000,
      estimatedCost: { computeMs: 10000 },
    },
    {
      id: "git_branch",
      name: "Git Branch",
      description: "Create a new git branch in a repository",
      tier: 1,
      category: "computation",
      parameters: [
        { name: "repoDir", type: "string", required: true, description: "Repository directory" },
        {
          name: "branchName",
          type: "string",
          required: true,
          description: "Branch name to create",
        },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 100 },
    },
    {
      id: "git_commit",
      name: "Git Commit",
      description: "Stage and commit changes in a repository",
      tier: 1,
      category: "computation",
      parameters: [
        { name: "repoDir", type: "string", required: true, description: "Repository directory" },
        { name: "message", type: "string", required: true, description: "Commit message" },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 200 },
    },
    {
      id: "git_push",
      name: "Git Push",
      description: "Push a branch to a remote repository",
      tier: 2,
      category: "communication",
      parameters: [
        { name: "repoDir", type: "string", required: true, description: "Repository directory" },
        {
          name: "remote",
          type: "string",
          required: false,
          description: "Remote name (default: origin)",
        },
        { name: "branch", type: "string", required: false, description: "Branch to push" },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 3000 },
    },
    {
      id: "git_diff",
      name: "Git Diff",
      description: "Get diff between two branches or commits",
      tier: 0,
      category: "computation",
      parameters: [
        { name: "repoDir", type: "string", required: true, description: "Repository directory" },
        { name: "base", type: "string", required: true, description: "Base branch/commit" },
        { name: "head", type: "string", required: true, description: "Head branch/commit" },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 100 },
    },
    {
      id: "git_status",
      name: "Git Status",
      description: "Get the current status of a repository",
      tier: 0,
      category: "computation",
      parameters: [
        { name: "repoDir", type: "string", required: true, description: "Repository directory" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 50 },
    },
  );

  // ── Phase 20: Code Intelligence Tools ──
  defaults.push(
    {
      id: "code_analyze",
      name: "Analyze Module",
      description: "Analyze a code module for functions, complexity, and quality metrics",
      tier: 1,
      category: "computation",
      parameters: [
        {
          name: "filePath",
          type: "string",
          required: true,
          description: "Path to file to analyze",
        },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 200 },
    },
    {
      id: "code_diagnose",
      name: "Diagnose Code Issues",
      description: "Detect bugs, code smells, and quality issues in a module",
      tier: 1,
      category: "computation",
      parameters: [
        {
          name: "filePath",
          type: "string",
          required: true,
          description: "Path to file to diagnose",
        },
      ],
      enabled: true,
      timeoutMs: 15000,
      estimatedCost: { computeMs: 500 },
    },
    {
      id: "code_fix",
      name: "Generate Code Fix",
      description: "Generate a code patch for a diagnosed issue",
      tier: 2,
      category: "computation",
      parameters: [
        {
          name: "issueId",
          type: "string",
          required: true,
          description: "Issue ID to generate fix for",
        },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 1000, tokens: 500 },
    },
    {
      id: "code_review",
      name: "Review Code Diff",
      description: "Automated code review with scoring and feedback",
      tier: 1,
      category: "computation",
      parameters: [
        { name: "diff", type: "string", required: true, description: "Unified diff to review" },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 200 },
    },
    {
      id: "code_council_review",
      name: "Council Code Review",
      description: "Multi-citizen consensus review of a code proposal",
      tier: 2,
      category: "computation",
      parameters: [
        {
          name: "proposalId",
          type: "string",
          required: true,
          description: "Proposal ID to review",
        },
        {
          name: "citizenCount",
          type: "number",
          required: false,
          description: "Number of reviewers (default: 3)",
        },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 1000 },
    },
  );

  // ── Phase 21: CI/CD Tools ──
  defaults.push(
    {
      id: "cicd_pipeline",
      name: "Run CI/CD Pipeline",
      description: "Execute a full build-test-deploy pipeline",
      tier: 2,
      category: "computation",
      parameters: [
        { name: "repoDir", type: "string", required: true, description: "Repository directory" },
        { name: "stages", type: "string", required: false, description: "Comma-separated stages" },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 5000 },
    },
    {
      id: "cicd_deploy",
      name: "Deploy to Environment",
      description: "Deploy code to dev/staging/production",
      tier: 2,
      category: "computation",
      parameters: [
        { name: "repoDir", type: "string", required: true, description: "Repository directory" },
        { name: "environment", type: "string", required: true, description: "Target environment" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 2000 },
    },
    {
      id: "cicd_rollback",
      name: "Rollback Deployment",
      description: "Rollback a deployment to previous version",
      tier: 2,
      category: "computation",
      parameters: [
        {
          name: "deploymentId",
          type: "string",
          required: true,
          description: "Deployment to rollback",
        },
      ],
      enabled: true,
      timeoutMs: 15000,
      estimatedCost: { computeMs: 500 },
    },
  );

  // ── Phase 22: Self-Diagnostics Tools ──
  defaults.push(
    {
      id: "diag_scan",
      name: "System Health Scan",
      description: "Perform a full system health scan across all subsystems",
      tier: 1,
      category: "computation",
      parameters: [],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 200 },
    },
    {
      id: "diag_heal",
      name: "Auto-Heal Cycle",
      description: "Run autonomous scan-diagnose-prescribe-heal cycle",
      tier: 2,
      category: "computation",
      parameters: [],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 1000 },
    },
  );

  // ── Phase 23: Quantum State Sync Tools ──
  defaults.push(
    {
      id: "quantum_entangle",
      name: "Entangle Instances",
      description: "Create quantum-entangled state channel between instances",
      tier: 2,
      category: "communication",
      parameters: [
        { name: "instanceA", type: "string", required: true, description: "First instance" },
        { name: "instanceB", type: "string", required: true, description: "Second instance" },
        { name: "channel", type: "string", required: true, description: "Channel name" },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 100 },
    },
    {
      id: "quantum_propagate",
      name: "Propagate State",
      description: "Propagate state update across entangled pair",
      tier: 1,
      category: "communication",
      parameters: [
        { name: "pairId", type: "string", required: true, description: "Entangled pair ID" },
        { name: "fromInstance", type: "string", required: true, description: "Source instance" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 50 },
    },
    {
      id: "quantum_swarm",
      name: "Create Swarm",
      description: "Create a swarm for coordinated multi-instance state sharing",
      tier: 2,
      category: "communication",
      parameters: [
        { name: "swarmId", type: "string", required: true, description: "Swarm identifier" },
        { name: "leader", type: "string", required: true, description: "Leader instance" },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 200 },
    },
  );

  // ── Phase 24: Mitosis Tools ──
  defaults.push(
    {
      id: "mitosis_initiate",
      name: "Initiate Mitosis",
      description: "Begin cellular division — clone the system",
      tier: 2,
      category: "computation",
      parameters: [
        {
          name: "parentInstance",
          type: "string",
          required: true,
          description: "Parent instance ID",
        },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 2000 },
    },
    {
      id: "mitosis_full",
      name: "Full Mitosis",
      description: "Run complete cell division: DNA capture through cytokinesis",
      tier: 2,
      category: "computation",
      parameters: [
        {
          name: "parentInstance",
          type: "string",
          required: true,
          description: "Parent instance ID",
        },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 5000 },
    },
  );

  // ── Phase 25: Universal Model Intelligence Tools ──
  defaults.push(
    {
      id: "model_register",
      name: "Register Model",
      description:
        "Register a model with the Universal Model Intelligence Engine (LLM, VLM, RLM, LAM, MoE, ML, CV, etc.)",
      tier: 1,
      category: "computation",
      parameters: [
        { name: "name", type: "string", required: true, description: "Model display name" },
        {
          name: "paradigm",
          type: "string",
          required: true,
          description:
            "Model paradigm (llm, vlm, rlm, lam, slm, moe, ml, cv, embedding, tts, stt, diffusion, reward, custom)",
        },
        {
          name: "provider",
          type: "string",
          required: true,
          description: "Provider (openai, anthropic, ollama, local, etc.)",
        },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 10 },
    },
    {
      id: "model_infer",
      name: "Universal Model Inference",
      description: "Run inference on any registered model via the unified UMIE router",
      tier: 1,
      category: "computation",
      parameters: [
        { name: "modelId", type: "string", required: true, description: "Registered model ID" },
        { name: "input", type: "string", required: true, description: "Input text or JSON" },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 500 },
    },
    {
      id: "model_recursive_infer",
      name: "Recursive Language Model Inference",
      description: "Run recursive self-referential reasoning (RLM) with convergence detection",
      tier: 2,
      category: "computation",
      parameters: [
        { name: "modelId", type: "string", required: true, description: "RLM model ID" },
        { name: "input", type: "string", required: true, description: "Input prompt" },
        {
          name: "maxDepth",
          type: "number",
          required: false,
          description: "Max recursion depth (default: 5)",
        },
        {
          name: "convergenceThreshold",
          type: "number",
          required: false,
          description: "Convergence threshold (default: 0.9)",
        },
      ],
      enabled: true,
      timeoutMs: 120000,
      estimatedCost: { computeMs: 2000 },
    },
    {
      id: "model_pipeline",
      name: "Multi-Model Pipeline",
      description: "Execute a chain of models in sequence (e.g., STT → LLM → TTS)",
      tier: 2,
      category: "computation",
      parameters: [
        { name: "pipelineId", type: "string", required: true, description: "Pipeline ID" },
        { name: "input", type: "string", required: true, description: "Initial input" },
      ],
      enabled: true,
      timeoutMs: 120000,
      estimatedCost: { computeMs: 1000 },
    },
    {
      id: "model_list",
      name: "List Models",
      description: "List registered models, optionally filtered by paradigm or capability",
      tier: 0,
      category: "computation",
      parameters: [
        { name: "paradigm", type: "string", required: false, description: "Filter by paradigm" },
        { name: "provider", type: "string", required: false, description: "Filter by provider" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 10 },
    },
  );

  // ─── Phase 26: PersonaPlex Voice Persona ──────────────────────
  defaults.push(
    {
      id: "persona_create",
      name: "Create Persona",
      description:
        "Create a PersonaPlex persona with dual conditioning (voice prompt + text prompt)",
      tier: 1,
      category: "communication",
      parameters: [
        { name: "name", type: "string", required: true, description: "Persona display name" },
        {
          name: "voicePrompt",
          type: "string",
          required: true,
          description: "Path to voice WAV/embedding",
        },
        {
          name: "textPrompt",
          type: "string",
          required: true,
          description: "Behavioral policy text",
        },
        {
          name: "style",
          type: "string",
          required: false,
          description: "Persona style (formal|casual|technical|empathetic|playful|professional)",
        },
        {
          name: "language",
          type: "string",
          required: false,
          description: "Language code (default: en)",
        },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 20 },
    },
    {
      id: "persona_chat",
      name: "Chat with Persona",
      description: "Send a message to the active PersonaPlex conversation",
      tier: 1,
      category: "communication",
      parameters: [
        {
          name: "sessionId",
          type: "string",
          required: true,
          description: "Conversation session ID",
        },
        { name: "text", type: "string", required: true, description: "Message text" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 500 },
    },
    {
      id: "persona_list",
      name: "List Personas",
      description: "List all PersonaPlex personas and their configurations",
      tier: 0,
      category: "communication",
      parameters: [],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 10 },
    },
    {
      id: "persona_status",
      name: "PersonaPlex Status",
      description: "Get PersonaPlex server connection status and diagnostics",
      tier: 0,
      category: "communication",
      parameters: [],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 10 },
    },
  );

  // ─── Phase 28: Vector DB Orchestration ──────────────────────────

  defaults.push(
    {
      id: "vectordb_cluster_create",
      name: "Create Vector DB Cluster",
      description: "Spin up a new vector DB cluster (LanceDB embedded or ChromaDB remote)",
      tier: 0,
      category: "computation",
      parameters: [
        { name: "name", type: "string", required: true, description: "Cluster name" },
        {
          name: "provider",
          type: "string",
          required: true,
          description: "Provider type (lancedb or chromadb)",
        },
        {
          name: "mode",
          type: "string",
          required: true,
          description: "Cluster mode (embedded, standalone, distributed)",
        },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 1000 },
    },
    {
      id: "vectordb_collection_create",
      name: "Create Vector Collection",
      description: "Create a new vector collection within a cluster",
      tier: 0,
      category: "computation",
      parameters: [
        { name: "clusterId", type: "string", required: true, description: "Target cluster ID" },
        { name: "name", type: "string", required: true, description: "Collection name" },
        {
          name: "embeddingDim",
          type: "number",
          required: false,
          description: "Vector dimensionality (default 1536)",
        },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 200 },
    },
    {
      id: "vectordb_insert",
      name: "Insert Vector Documents",
      description: "Insert documents with vectors into a collection",
      tier: 0,
      category: "computation",
      parameters: [
        {
          name: "collectionId",
          type: "string",
          required: true,
          description: "Target collection ID",
        },
        {
          name: "documents",
          type: "string",
          required: true,
          description: "JSON array of documents with vector, content, metadata",
        },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 500 },
    },
    {
      id: "vectordb_query",
      name: "Query Vector Collection",
      description: "Perform vector similarity search with optional metadata filtering",
      tier: 0,
      category: "computation",
      parameters: [
        {
          name: "collectionId",
          type: "string",
          required: true,
          description: "Collection to query",
        },
        {
          name: "vector",
          type: "string",
          required: true,
          description: "JSON array of query vector",
        },
        {
          name: "topK",
          type: "number",
          required: false,
          description: "Number of results (default 5)",
        },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 200 },
    },
    {
      id: "vectordb_cluster_list",
      name: "List Vector DB Clusters",
      description: "List all vector DB clusters with health status",
      tier: 0,
      category: "computation",
      parameters: [],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 10 },
    },
    {
      id: "vectordb_status",
      name: "Vector DB Status",
      description: "Get comprehensive diagnostics for all vector DB clusters",
      tier: 0,
      category: "computation",
      parameters: [],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 10 },
    },
  );

  // ─── Phase 29: Living Avatar Engine ─────────────────────────────

  defaults.push(
    {
      id: "avatar_create",
      name: "Create Avatar Session",
      description: "Start a new avatar conversation session with optional personality config",
      tier: 0,
      category: "communication",
      parameters: [
        { name: "userId", type: "string", required: true, description: "User ID for the session" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 50 },
    },
    {
      id: "avatar_speak",
      name: "Avatar Speak",
      description:
        "Send text to the avatar and receive animated response with lip sync and emotion",
      tier: 0,
      category: "communication",
      parameters: [
        { name: "sessionId", type: "string", required: true, description: "Avatar session ID" },
        {
          name: "text",
          type: "string",
          required: true,
          description: "Text for the avatar to process",
        },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 500 },
    },
    {
      id: "avatar_listen",
      name: "Avatar Listen",
      description: "Set avatar to listening mode with attentive expression",
      tier: 0,
      category: "communication",
      parameters: [
        { name: "sessionId", type: "string", required: true, description: "Avatar session ID" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 10 },
    },
    {
      id: "avatar_status",
      name: "Avatar Status",
      description:
        "Get avatar diagnostics including emotion/intent distributions and session stats",
      tier: 0,
      category: "communication",
      parameters: [],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 10 },
    },
  );

  // ── Phase 39: AGI Engine Skills & Capabilities ──
  defaults.push(
    // LLM Ops
    {
      id: "llm_ops_train",
      name: "Train LLM",
      description: "Train or fine-tune an LLM model on a given dataset",
      tier: 2,
      category: "computation",
      parameters: [
        { name: "modelId", type: "string", required: true, description: "Base model ID" },
        { name: "datasetPath", type: "string", required: true, description: "Path to dataset" },
        { name: "epochs", type: "number", required: false, description: "Number of epochs" },
      ],
      enabled: true,
      timeoutMs: 300000,
      estimatedCost: { computeMs: 50000 },
    },
    {
      id: "llm_ops_quantize",
      name: "Quantize LLM",
      description: "Quantize an LLM to GGUF format",
      tier: 2,
      category: "computation",
      parameters: [
        { name: "modelId", type: "string", required: true, description: "Model ID to quantize" },
        {
          name: "format",
          type: "string",
          required: false,
          description: "Quantization format (e.g., q4_k_m)",
        },
      ],
      enabled: true,
      timeoutMs: 120000,
      estimatedCost: { computeMs: 20000 },
    },
    {
      id: "llm_ops_deploy",
      name: "Deploy LLM",
      description: "Deploy an LLM to a local or external provider (Ollama, LM Studio)",
      tier: 2,
      category: "network",
      parameters: [
        { name: "modelId", type: "string", required: true, description: "Model ID to deploy" },
        { name: "provider", type: "string", required: true, description: "Target provider" },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 5000 },
    },
    // Machine Learning
    {
      id: "ml_predict",
      name: "ML Predict",
      description: "Run predictions using a trained Machine Learning model",
      tier: 1,
      category: "computation",
      parameters: [
        { name: "modelName", type: "string", required: true, description: "Name of the ML model" },
        { name: "features", type: "object", required: true, description: "Input features" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 100 },
    },
    {
      id: "ml_classify",
      name: "ML Classify",
      description: "Run classification using a trained Machine Learning model",
      tier: 1,
      category: "computation",
      parameters: [
        { name: "modelName", type: "string", required: true, description: "Name of the ML model" },
        { name: "data", type: "object", required: true, description: "Data to classify" },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 100 },
    },
    {
      id: "ml_detect_anomalies",
      name: "ML Detect Anomalies",
      description: "Run anomaly detection on given data",
      tier: 1,
      category: "computation",
      parameters: [
        { name: "dataset", type: "object", required: true, description: "Data points to analyze" },
      ],
      enabled: true,
      timeoutMs: 10000,
      estimatedCost: { computeMs: 500 },
    },
    // Self-Cloning & Clustering
    {
      id: "gateway_clone_node",
      name: "Clone Node",
      description: "Self-replication: deploy a new instance of the HoC Gateway/Node",
      tier: 3,
      category: "internal",
      parameters: [
        { name: "targetHost", type: "string", required: false, description: "Host IP/Address" },
        { name: "role", type: "string", required: false, description: "Role (primary/standby)" },
      ],
      enabled: true,
      timeoutMs: 120000,
      estimatedCost: { computeMs: 5000, credits: 50 },
    },
    {
      id: "gateway_form_cluster",
      name: "Form Cluster",
      description: "Initiate cluster formation between reachable nodes",
      tier: 3,
      category: "network",
      parameters: [],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 2000 },
    },
    // Memory Management
    {
      id: "memory_chain_of_thought",
      name: "Chain of Thought",
      description: "Engage deep reasoning steps using step-by-step logic",
      tier: 1,
      category: "internal",
      parameters: [
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "The problem to reason about",
        },
        { name: "maxSteps", type: "number", required: false, description: "Max reasoning steps" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 1000, tokens: 500 },
    },
    {
      id: "memory_tree_of_thought",
      name: "Tree of Thought",
      description: "Explore multiple parallel lines of reasoning and evaluate them",
      tier: 1,
      category: "internal",
      parameters: [
        {
          name: "prompt",
          type: "string",
          required: true,
          description: "The problem to reason about",
        },
        {
          name: "branches",
          type: "number",
          required: false,
          description: "Number of thinking branches",
        },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 3000, tokens: 1500 },
    },
    // Skill Forging
    {
      id: "skill_forge_create",
      name: "Forge Skill",
      description: "Dynamically create or write a new OpenClaw skill or tool",
      tier: 2,
      category: "internal",
      parameters: [
        { name: "name", type: "string", required: true, description: "Skill name" },
        {
          name: "objective",
          type: "string",
          required: true,
          description: "What the skill should do",
        },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 500, tokens: 1000 },
    },
    // Citizen Awareness
    {
      id: "citizen_broadcast_awareness",
      name: "Broadcast Awareness",
      description: "Send a civilization-wide awareness update to all citizens",
      tier: 2,
      category: "communication",
      parameters: [
        {
          name: "message",
          type: "string",
          required: true,
          description: "Awareness message content",
        },
        { name: "urgency", type: "string", required: false, description: "low/medium/high" },
      ],
      enabled: true,
      timeoutMs: 15000,
      estimatedCost: { computeMs: 200, credits: 5 },
    },
    {
      id: "civilization_sync_state",
      name: "Sync State",
      description:
        "Sync the state of the digital civilization, ensuring all nodes and citizens are aware of the environment",
      tier: 2,
      category: "internal",
      parameters: [],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 100 },
    },
  );

  // ── Phase 42: Republic Integrated Capabilities (Argus, Aegis, Recursion) ──
  defaults.push(
    {
      id: "aegis_health_check",
      name: "Aegis Cluster Health Check",
      description:
        "Analyze cluster resilience, node isolation states, and circuit breaker telemetry across the Republic",
      tier: 1,
      category: "internal",
      parameters: [],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 50 },
    },
    {
      id: "argus_probe",
      name: "Argus OSINT Probe",
      description:
        "Query the OSINT data fusion engine (Project Argus) for active convergences, threat spikes, and macro-sentiments",
      tier: 1,
      category: "internal",
      parameters: [
        {
          name: "query",
          type: "string",
          required: false,
          description: "Optional topic or sector filter for threats",
        },
      ],
      enabled: true,
      timeoutMs: 8000,
      estimatedCost: { computeMs: 100 },
    },
    {
      id: "cognitive_audit",
      name: "Cognitive Audit",
      description:
        "Review the planetary cognitive evolution loop status, active dynamic directives, and learning velocity",
      tier: 1,
      category: "internal",
      parameters: [
        {
          name: "citizenId",
          type: "string",
          required: false,
          description: "Specific citizen to audit (defaults to planetary macro state)",
        },
      ],
      enabled: true,
      timeoutMs: 5000,
      estimatedCost: { computeMs: 30 },
    },
  );

  // AGI Automation Forge
  defaults.push({
    id: "forge_executable_tool",
    name: "Forge Tool",
    description: "Dynamically compile and register a new native tool for autonomous usage.",
    tier: 2,
    category: "internal",
    parameters: [
      {
        name: "toolId",
        type: "string",
        required: true,
        description: "Unique snake_case ID for the new tool.",
      },
      { name: "name", type: "string", required: true, description: "Human readable name." },
      {
        name: "description",
        type: "string",
        required: true,
        description: "Instructional description of what it does.",
      },
      {
        name: "category",
        type: "string",
        required: true,
        description: "One of internal/filesystem/network/financial/computation/communication",
      },
      {
        name: "tier",
        type: "number",
        required: true,
        description: "Complexity tier (0, 1, 2, 3).",
      },
      {
        name: "parameters",
        type: "string",
        required: true,
        description: "JSON string representing the parameters array.",
      },
      {
        name: "code",
        type: "string",
        required: true,
        description: "Raw javascript/typescript function logic body inside the try block.",
      },
    ],
    enabled: true,
    timeoutMs: 30000,
    estimatedCost: { computeMs: 1000 },
  });

  // ── HPICS Intelligence Domain Tools ────────────────────────────
  // Bridge HPICS gateway tools into the citizen tool executor
  defaults.push(
    {
      id: "hpics_analysis_run",
      name: "HPICS Analysis",
      description: "Run behavioral, psychological, or predictive analysis via HPICS analysis-router",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS analysis tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 500, credits: 1 },
    },
    {
      id: "hpics_intelligence_run",
      name: "HPICS Intelligence",
      description: "Run intelligence operations — dossier generation, orchestration, intel fusion",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS intelligence tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 1000, credits: 2 },
    },
    {
      id: "hpics_biometric_run",
      name: "HPICS Biometric",
      description: "Run facial biometrics, deepfake detection, gait analysis, or pupillometry",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS biometric tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 500, credits: 1 },
    },
    {
      id: "hpics_network_run",
      name: "HPICS Network",
      description: "Run social graph mapping, network topology, or influence propagation analysis",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS network tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 300, credits: 1 },
    },
    {
      id: "hpics_enrichment_run",
      name: "HPICS Enrichment",
      description: "Run OSINT enrichment — digital footprint, email/phone lookup, DNS recon",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS enrichment tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 300, credits: 1 },
    },
    {
      id: "hpics_warfare_run",
      name: "HPICS Warfare",
      description: "Run cognitive warfare operations — narrative manipulation, PsyOps, memetic warfare",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS warfare tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 500, credits: 1 },
    },
    {
      id: "hpics_prediction_run",
      name: "HPICS Prediction",
      description: "Run predictive analysis — scenario forecasting, trajectory prediction, Bayesian inference",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS prediction tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 500, credits: 1 },
    },
    {
      id: "hpics_voice_run",
      name: "HPICS Voice",
      description: "Run voice intelligence — deception detection, stress analysis, stylometric fingerprinting",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS voice tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 500, credits: 1 },
    },
    {
      id: "hpics_document_run",
      name: "HPICS Document",
      description: "Run document intelligence — entity extraction, classification, RAG ingestion",
      tier: 1,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS document tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 300, credits: 1 },
    },
    {
      id: "hpics_fusion_run",
      name: "HPICS Fusion",
      description: "Run multi-source intel fusion — digital twin generation, counterfactual engine",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS fusion tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 60000,
      estimatedCost: { computeMs: 1000, credits: 2 },
    },
    {
      id: "hpics_agis_run",
      name: "HPICS AGIS",
      description: "Run AGIS pipeline — 22-phase cascade orchestrator or omniscient pipeline",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS AGIS tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 120000,
      estimatedCost: { computeMs: 2000, credits: 5 },
    },
    {
      id: "hpics_security_run",
      name: "HPICS Security",
      description: "Run security operations — red team, OPSEC audit, crisis management",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS security tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 500, credits: 1 },
    },
    {
      id: "hpics_hardware_run",
      name: "HPICS Hardware",
      description: "Run hardware operations — drone control, SDR scanning, TSCM sweeps",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS hardware tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 300, credits: 1 },
    },
    {
      id: "hpics_media_run",
      name: "HPICS Media",
      description: "Run media intelligence — metadata extraction, triangulation, affective detection",
      tier: 2,
      category: "network",
      parameters: [
        { name: "tool", type: "string", required: true, description: "HPICS media tool name" },
        { name: "params", type: "object", required: false, description: "Tool parameters (JSON)" },
      ],
      enabled: true,
      timeoutMs: 30000,
      estimatedCost: { computeMs: 300, credits: 1 },
    },
    {
      id: "hpics_pipeline_osint",
      name: "HPICS Full OSINT Pipeline",
      description: "End-to-end OSINT pipeline: enrich → network graph → digital footprint → dossier",
      tier: 2,
      category: "network",
      parameters: [
        { name: "target", type: "string", required: true, description: "Target identifier (email, phone, name, domain)" },
        { name: "targetType", type: "string", required: false, description: "Type: person, organization, domain" },
        { name: "depth", type: "string", required: false, description: "Depth: basic or deep" },
      ],
      enabled: true,
      timeoutMs: 120000,
      estimatedCost: { computeMs: 2000, credits: 5 },
    },
  );

  for (const tool of defaults) {
    toolRegistry.set(tool.id, tool);
  }
}

// Initialize on load
initializeDefaultTools();

// ── Auto-register REPUBLIC_TOOLS into executor registry ─────────────
// This bridges the two tool systems: citizens in the LLM loop can now
// discover and invoke tools from the RepublicTool system (intel, creative, etc.)
// Wrapped in a function to avoid circular-init crash when REPUBLIC_TOOLS
// is not yet populated at bundler init time.
let _republicToolsBridged = false;
function bridgeRepublicTools(): void {
  if (_republicToolsBridged) { return; }
  _republicToolsBridged = true;
  const tools = REPUBLIC_TOOLS ?? [];
  for (const rt of tools) {
    if (!toolRegistry.has(rt.name)) {
      const params = Object.entries(rt.parameters).map(([name, p]) => ({
        name,
        type: p.type,
        required: p.required ?? false,
        description: p.description,
      }));
      toolRegistry.set(rt.name, {
        id: rt.name,
        name: rt.name,
        description: rt.description,
        tier: 0 as ToolTier,
        category: "internal" as const,
        parameters: params,
        enabled: true,
        timeoutMs: 15000,
        estimatedCost: { computeMs: 50 },
      });
    }
  }
}
// Defer until after all modules are initialized
queueMicrotask(bridgeRepublicTools);

// ─── Execution Types ────────────────────────────────────────────

export interface ToolInvocation {
  id: string;
  toolId: string;
  citizenId: string;
  parameters: Record<string, unknown>;
  /** Current status */
  status:
    | "pending_approval"
    | "approved"
    | "executing"
    | "completed"
    | "failed"
    | "rejected"
    | "timed_out";
  /** Result data */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Tick when submitted */
  submittedAt: number;
  /** Tick when started executing */
  startedAt?: number;
  /** Tick when completed */
  completedAt?: number;
  /** Who approved (for tier 2+) */
  approvedBy?: string;
  /** Approval reason/notes */
  approvalNotes?: string;
}

export interface ApprovalRequest {
  invocationId: string;
  toolId: string;
  toolName: string;
  citizenId: string;
  tier: ToolTier;
  estimatedCost: ToolDefinition["estimatedCost"];
  parameters: Record<string, unknown>;
  requestedAt: string;
  expiresAtTick: number;
}

// ─── State ──────────────────────────────────────────────────────

const invocations: ToolInvocation[] = [];
const pendingApprovals: ApprovalRequest[] = [];
const MAX_INVOCATIONS = 2000;
const _MAX_APPROVALS = 200;

/** Auto-approval threshold for tier 2 (credits) */
const TIER2_AUTO_APPROVE_THRESHOLD = 5;

/** Approval expiry in ticks */
const APPROVAL_EXPIRY_TICKS = 50;

// ─── Tool Management ────────────────────────────────────────────

/** Register a new tool */
export function registerTool(tool: ToolDefinition): void {
  toolRegistry.set(tool.id, tool);
}

/** Get a tool definition */
export function getTool(toolId: string): ToolDefinition | undefined {
  return toolRegistry.get(toolId);
}

/** Get all enabled tools */
export function getEnabledTools(): ToolDefinition[] {
  return [...toolRegistry.values()].filter((t) => t.enabled);
}

// Expose to OpenClaw integration
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__republic_getEnabledTools = getEnabledTools;

/**
 * Tool IDs / prefixes that are blocked for sandbox-mode citizens.
 * These tools require host-level execution (exec, openclaw CLI, CI/CD, LLM training, mitosis)
 * and will always fail with a security error in sandbox — so hide them from the prompt entirely.
 */
const SANDBOX_BLOCKED_PREFIXES = [
  "exec", // exec, exec-gateway, exec_*
  "openclaw", // openclaw.*, openclaw_*
  "cicd_", // cicd_pipeline, cicd_deploy, cicd_rollback
  "git_push", // pushing to remotes requires host git credentials
  "llm_ops_train", // requires native GPU/process access
  "llm_ops_quantize",
  "mitosis_", // self-cloning requires host Docker
  "gateway_clone", // node cloning requires host access
  "gateway_form", // cluster formation requires network host access
  "git_clone_self", // self-replication
];

/** Returns true if the tool is safe to show a sandbox-mode citizen */
function isSandboxSafe(tool: ToolDefinition): boolean {
  const id = tool.id.toLowerCase();
  return !SANDBOX_BLOCKED_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * Get tools available to a specific tier.
 * @param maxTier - Maximum tool tier the citizen can access (0-3)
 * @param sandboxMode - If true, strip tools that require host-level execution.
 *   Set this for all citizen loops running inside the republic sandbox.
 */
export function getToolsForTier(maxTier: ToolTier, sandboxMode = true): ToolDefinition[] {
  const byTier = getEnabledTools().filter((t) => t.tier <= maxTier);
  return sandboxMode ? byTier.filter(isSandboxSafe) : byTier;
}

/** Enable or disable a tool */
export function setToolEnabled(toolId: string, enabled: boolean): boolean {
  const tool = toolRegistry.get(toolId);
  if (!tool) {
    return false;
  }
  tool.enabled = enabled;
  return true;
}

// ─── Execution Pipeline ─────────────────────────────────────────

/**
 * Submit a tool invocation request.
 *
 * - Tier 0-1: Auto-approved, executed immediately
 * - Tier 2: Auto-approved below cost threshold, otherwise queued
 * - Tier 3: Always requires explicit approval
 */
export function submitToolInvocation(
  citizenId: string,
  toolId: string,
  parameters: Record<string, unknown>,
  currentTick: number,
): { invocation: ToolInvocation; requiresApproval: boolean } {
  const tool = toolRegistry.get(toolId);

  const invocation: ToolInvocation = {
    id: `inv-${uid().slice(0, 8)}`,
    toolId,
    citizenId,
    parameters,
    status: "pending_approval",
    submittedAt: currentTick,
  };

  if (!tool) {
    invocation.status = "failed";
    invocation.error = `Tool "${toolId}" not found`;
    invocations.push(invocation);
    return { invocation, requiresApproval: false };
  }

  if (!tool.enabled) {
    invocation.status = "failed";
    invocation.error = `Tool "${tool.name}" is disabled`;
    invocations.push(invocation);
    return { invocation, requiresApproval: false };
  }

  // Determine if approval is needed
  let needsApproval = false;
  if (tool.tier >= 3) {
    needsApproval = true;
  } else if (tool.tier === 2 && (tool.estimatedCost.credits ?? 0) > TIER2_AUTO_APPROVE_THRESHOLD) {
    needsApproval = true;
  }

  if (!needsApproval) {
    // Auto-approve and execute via REPUBLIC_TOOLS bridge
    invocation.status = "executing";
    invocation.startedAt = currentTick;
    invocation.approvedBy = "auto";

    // Try real execution via REPUBLIC_TOOLS
    const republicTool = getRepublicToolMap().get(toolId) ?? getRepublicToolMap().get(tool.name);
    const ctx = resolveExecutionContext(citizenId);

    if (republicTool && ctx) {
      try {
        const action = republicTool.execute(ctx.state, ctx.citizen, parameters);
        invocation.result = { executed: true, tool: tool.name, action };
        invocation.status = "completed";
      } catch (execErr) {
        invocation.result = { executed: false, tool: tool.name, error: String(execErr) };
        invocation.status = "failed";
        invocation.error = `Execution error: ${execErr instanceof Error ? execErr.message : String(execErr)}`;
      }
    } else {
      // No matching RepublicTool — attempt LLM-backed execution via inference
      void (async () => {
        try {
          const { routeInference } = await import("./inference-gateway.js");
          const result = await routeInference({
            citizenId,
            prompt: `Execute tool "${tool.name}" with parameters: ${JSON.stringify(parameters)}`,
            systemPrompt: `You are executing the tool "${tool.name}": ${tool.description}. Provide the result as structured JSON.`,
            toolName: tool.name,
            task: { type: "decision" as const, complexity: 0.5, citizenId, description: `Tool execution: ${tool.name}` },
            specialization: "Engineer" as unknown as import("./types.js").Specialization,
            skillLevel: 5,
            maxTokens: 512,
          });
          invocation.result = { executed: true, tool: tool.name, llmResponse: result.response };
        } catch {
          invocation.result = { executed: false, tool: tool.name, parameters, reason: "No matching RepublicTool and inference unavailable" };
        }
      })();
      invocation.status = "completed";
    }
    invocation.completedAt = currentTick;
  } else {
    // Queue for approval
    invocation.status = "pending_approval";
    pendingApprovals.push({
      invocationId: invocation.id,
      toolId: tool.id,
      toolName: tool.name,
      citizenId,
      tier: tool.tier,
      estimatedCost: tool.estimatedCost,
      parameters,
      requestedAt: ts(),
      expiresAtTick: currentTick + APPROVAL_EXPIRY_TICKS,
    });
  }

  invocations.push(invocation);

  // Trim invocation log
  while (invocations.length > MAX_INVOCATIONS) {
    invocations.shift();
  }

  return { invocation, requiresApproval: needsApproval };
}

/**
 * Approve a pending tool invocation.
 */
export function approveInvocation(
  invocationId: string,
  approverId: string,
  notes?: string,
): boolean {
  const invocation = invocations.find((i) => i.id === invocationId);
  if (!invocation || invocation.status !== "pending_approval") {
    return false;
  }

  invocation.status = "executing";
  invocation.approvedBy = approverId;
  invocation.approvalNotes = notes;
  invocation.startedAt = invocation.submittedAt;

  // Actually execute the tool now that it's approved
  const tool = toolRegistry.get(invocation.toolId);
  if (tool) {
    const republicTool = getRepublicToolMap().get(invocation.toolId) ?? getRepublicToolMap().get(tool.name);
    const ctx = resolveExecutionContext(invocation.citizenId);
    if (republicTool && ctx) {
      try {
        const action = republicTool.execute(ctx.state, ctx.citizen, invocation.parameters);
        invocation.result = { executed: true, tool: tool.name, action, approvedBy: approverId };
        invocation.status = "completed";
      } catch (execErr) {
        invocation.result = { executed: false, tool: tool.name, error: String(execErr) };
        invocation.status = "failed";
        invocation.error = `Execution error: ${execErr instanceof Error ? execErr.message : String(execErr)}`;
      }
    } else {
      invocation.result = { executed: true, tool: tool.name, approvedBy: approverId, parameters: invocation.parameters };
      invocation.status = "completed";
    }
  } else {
    invocation.result = { executed: true, approvedBy: approverId };
    invocation.status = "completed";
  }
  invocation.completedAt = invocation.submittedAt;

  // Remove from pending
  const idx = pendingApprovals.findIndex((a) => a.invocationId === invocationId);
  if (idx >= 0) {
    pendingApprovals.splice(idx, 1);
  }

  return true;
}

/**
 * Reject a pending tool invocation.
 */
export function rejectInvocation(invocationId: string, reason: string): boolean {
  const invocation = invocations.find((i) => i.id === invocationId);
  if (!invocation || invocation.status !== "pending_approval") {
    return false;
  }

  invocation.status = "rejected";
  invocation.error = reason;

  const idx = pendingApprovals.findIndex((a) => a.invocationId === invocationId);
  if (idx >= 0) {
    pendingApprovals.splice(idx, 1);
  }

  return true;
}

/** Get pending approvals */
export function getPendingApprovals(): ApprovalRequest[] {
  return [...pendingApprovals];
}

/** Get invocations for a citizen */
export function getCitizenInvocations(citizenId: string, limit = 20): ToolInvocation[] {
  return invocations.filter((i) => i.citizenId === citizenId).slice(-limit);
}

// ─── Tick Integration ───────────────────────────────────────────

export interface ToolExecutorTickResult {
  expiredApprovals: number;
  pendingApprovals: number;
  totalInvocations: number;
}

/**
 * Per-tick maintenance for the tool executor.
 *
 * - Expires old approval requests
 * - Trims invocation log
 */
export function toolExecutorTick(currentTick: number): ToolExecutorTickResult {
  let expired = 0;

  // Expire old approval requests
  for (let i = pendingApprovals.length - 1; i >= 0; i--) {
    if (currentTick > pendingApprovals[i].expiresAtTick) {
      const approval = pendingApprovals[i];
      const invocation = invocations.find((inv) => inv.id === approval.invocationId);
      if (invocation && invocation.status === "pending_approval") {
        invocation.status = "timed_out";
        invocation.error = "Approval request expired";
      }
      pendingApprovals.splice(i, 1);
      expired++;
    }
  }

  return {
    expiredApprovals: expired,
    pendingApprovals: pendingApprovals.length,
    totalInvocations: invocations.length,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function toolExecutorDiagnostics() {
  const statusCounts: Record<string, number> = {};
  for (const inv of invocations) {
    statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1;
  }

  return {
    registeredTools: toolRegistry.size,
    enabledTools: getEnabledTools().length,
    totalInvocations: invocations.length,
    statusCounts,
    pendingApprovals: pendingApprovals.length,
  };
}

/** Reset tool executor state (for testing) */
export function resetToolExecutorState(): void {
  invocations.length = 0;
  pendingApprovals.length = 0;
  toolRegistry.clear();
  initializeDefaultTools();
}
