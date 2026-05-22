/**
 * Chat Feature — Constants
 *
 * Static configuration and suggestion lists shared across chat components.
 */

import type { ModelOption } from "./chat.types";

export const SUGGESTIONS = [
  "What can you do?",
  "Create a presentation",
  "Write code for me",
  "Create a web scraper workflow",
  "Summarize the latest world news",
  "Generate an image",
];

export const FOLLOWUP_SUGGESTIONS = [
  "Refine this",
  "Download files",
  "Provision this n8n workflow",
  "Start a new task",
];

// ── Unified tool label map (single source of truth) ─────────────────────────
// Used by StepTracker and ChatRightPanel. Keys use underscores (snake_case).
// The friendlyLabel() helper normalizes both `snake_case` and `space separated`
// keys before lookup, so consumers don't need to pre-process.
export const TOOL_LABELS: Record<string, string> = {
  // Sandbox tools
  sandbox_write_file: "Writing file",
  sandbox_exec: "Executing command",
  sandbox_read_file: "Reading file",
  sandbox_upload: "Uploading file",
  sandbox_list_files: "Listing files",
  // Browser & web
  browser_navigate: "Browsing web",
  browser_screenshot: "Taking screenshot",
  browser_click: "Interacting with page",
  browser_type: "Typing in browser",
  browser_scroll: "Scrolling page",
  playwright_navigate: "Opening web page",
  playwright_screenshot: "Capturing screenshot",
  playwright_click: "Clicking element",
  web_search: "Searching the web",
  web_scrape: "Scraping web content",
  deerflow_research: "Performing deep research",
  // Document & media
  create_document: "Creating document",
  read_document: "Reading document",
  data_viz: "Generating chart",
  comfyui_generate: "Generating media",
  archive_files: "Creating archive",
  // Code & analysis
  code_analysis: "Analyzing code",
  code_review: "Reviewing code",
  git_clone: "Cloning repository",
  git_commit: "Committing changes",
  git_github: "Git operations",
  scaffold_project: "Scaffolding project",
  template_seed: "Seeding from template",
  // System
  file_download: "Preparing download",
  deploy: "Deploying application",
  docker_exec: "Running in container",
  install_packages: "Installing dependencies",
  pip_install: "Installing Python packages",
  npm_install: "Installing Node packages",
  rag_knowledge: "Updating knowledge base",
  agent_memory: "Accessing memory",
  // Native Anthropic tools
  bash: "Running bash command",
  computer: "Using computer desktop",
  str_replace_editor: "Editing file",
  // Meta-steps (agent phases)
  thinking: "Thinking…",
  // Kali Security (auto-dispatch from chat)
  kali_container: "Starting Kali container",
  kali_scan: "Running security scan",
  kali_report: "Generating security report",
  port_scan: "Scanning ports",
  web_scan: "Scanning web application",
  // Deep Research (auto-dispatch from chat)
  research_plan: "Planning research",
  research_planning: "Planning research strategy",
  research_queued: "Research job queued",
  research_searching: "Searching sources",
  research_extracting: "Extracting information",
  research_synthesizing: "Synthesizing findings",
  research_writing: "Writing research report",
};

/**
 * Resolve a tool name (snake_case or space-separated) to a human-friendly label.
 * Falls back to "Using <name>" if no mapping exists.
 */
export function friendlyLabel(toolName: string): string {
  // Normalize: replace spaces with underscores for lookup
  const key = toolName.replace(/\s+/g, "_");
  return TOOL_LABELS[key] ?? `Using ${toolName.replace(/_/g, " ")}`;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "auto",
    label: "Auto (Best Available)",
    provider: "",
    modelId: "",
    icon: "⚡",
    maxTokens: "—",
  },
  // ── Gemini (March 2026) ───────────────────────────────────────────────
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "google",
    modelId: "gemini-3.1-pro-preview",
    icon: "🔵",
    maxTokens: "1M",
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    provider: "google",
    modelId: "gemini-3-flash-preview",
    icon: "⚡",
    maxTokens: "1M",
  },
  {
    id: "google/gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash-Lite",
    provider: "google",
    modelId: "gemini-3.1-flash-lite-preview",
    icon: "💨",
    maxTokens: "1M",
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    modelId: "gemini-2.5-pro",
    icon: "🔵",
    maxTokens: "1M",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    modelId: "gemini-2.5-flash",
    icon: "⚡",
    maxTokens: "1M",
  },
  {
    id: "google/gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    provider: "google",
    modelId: "gemini-1.5-pro",
    icon: "🔵",
    maxTokens: "2M",
  },
  // ── Anthropic (Feb-Mar 2026) ───────────────────────────────────────────
  {
    id: "anthropic/claude-sonnet-4-6-20260217",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6-20260217",
    icon: "🟣",
    maxTokens: "1M",
  },
  {
    id: "anthropic/claude-3-7-sonnet-20250219",
    label: "Claude 3.7 Sonnet",
    provider: "anthropic",
    modelId: "claude-3-7-sonnet-20250219",
    icon: "🟣",
    maxTokens: "200K",
  },
  {
    id: "anthropic/claude-3-5-haiku-20241022",
    label: "Claude 3.5 Haiku",
    provider: "anthropic",
    modelId: "claude-3-5-haiku-20241022",
    icon: "🟣",
    maxTokens: "200K",
  },
  // ── OpenAI (March 2026) ────────────────────────────────────────────────
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    provider: "openai",
    modelId: "gpt-5.4",
    icon: "🟢",
    maxTokens: "1M",
  },
  {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    provider: "openai",
    modelId: "gpt-5.4-mini",
    icon: "🟢",
    maxTokens: "1M",
  },
  {
    id: "openai/o3-mini",
    label: "o3-mini",
    provider: "openai",
    modelId: "o3-mini",
    icon: "🟢",
    maxTokens: "200K",
  },
  // ── DeepSeek ───────────────────────────────────────────────────────────
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek V3.5",
    provider: "deepseek",
    modelId: "deepseek-chat",
    icon: "🔴",
    maxTokens: "128K",
  },
  {
    id: "deepseek/deepseek-reasoner",
    label: "DeepSeek R1",
    provider: "deepseek",
    modelId: "deepseek-reasoner",
    icon: "🔴",
    maxTokens: "128K",
  },
  // ── Groq ───────────────────────────────────────────────────────────────
  {
    id: "groq/llama-3.3-70b-versatile",
    label: "Llama 3.3 70B",
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
    icon: "🦙",
    maxTokens: "128K",
  },
  // ── NVIDIA NIM ─────────────────────────────────────────────────────────
  {
    id: "nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1",
    label: "Nemotron 3 Super",
    provider: "nvidia-nim",
    modelId: "nvidia/llama-3.3-nemotron-super-49b-v1",
    icon: "🟡",
    maxTokens: "128K",
  },
  // ── Local ──────────────────────────────────────────────────────────────
  {
    id: "lmstudio/default",
    label: "LM Studio",
    provider: "lmstudio",
    modelId: "default",
    icon: "🖥️",
    maxTokens: "varies",
  },
  {
    id: "ollama/default",
    label: "Ollama",
    provider: "ollama",
    modelId: "default",
    icon: "🦙",
    maxTokens: "varies",
  },
];
