/**
 * Republic Platform - Workflow Templates
 *
 * Template data for common workflow patterns.
 * Extracted from orchestrator.ts for maintainability.
 */

import type { Specialization } from "./types.js";

interface WorkflowTemplate {
  phases: Array<{
    name: string;
    preferredSpecializations: Specialization[];
    steps: Array<{ title: string; description: string; toolName?: string }>;
    dependsOnPhaseIndices: number[];
  }>;
}

/**
 * Heuristic workflow templates for common high-level requests.
 * In production, an LLM (Tier 3) would decompose dynamically.
 */
const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  "full-stack-product": {
    phases: [
      {
        name: "Architecture & Planning",
        preferredSpecializations: ["Architect", "Planner", "Strategist"],
        steps: [
          {
            title: "Design system architecture",
            description: "Define tech stack, database schema, API structure",
            toolName: "scaffold_project",
          },
          {
            title: "Create project scaffold",
            description: "Initialize project with chosen framework",
            toolName: "scaffold_project",
          },
          {
            title: "Define API contracts",
            description: "Document all API endpoints and data models",
            toolName: "write_code",
          },
        ],
        dependsOnPhaseIndices: [],
      },
      {
        name: "Backend Development",
        preferredSpecializations: ["Developer", "Engineer"],
        steps: [
          {
            title: "Implement database models",
            description: "Create database schemas and migrations",
            toolName: "write_schema",
          },
          {
            title: "Build API endpoints",
            description: "Implement all REST/GraphQL endpoints",
            toolName: "write_code",
          },
          {
            title: "Add authentication",
            description: "Implement auth flows and middleware",
            toolName: "write_code",
          },
          {
            title: "Write backend tests",
            description: "Unit and integration tests for API",
            toolName: "write_test",
          },
        ],
        dependsOnPhaseIndices: [0],
      },
      {
        name: "Frontend Development",
        preferredSpecializations: ["Developer", "Artist"],
        steps: [
          {
            title: "Build UI components",
            description: "Create reusable component library",
            toolName: "write_code",
          },
          {
            title: "Implement pages",
            description: "Build all application pages",
            toolName: "write_code",
          },
          {
            title: "Add state management",
            description: "Wire up data flow and API integration",
            toolName: "write_code",
          },
          {
            title: "Style and polish",
            description: "Apply design system, responsive layouts",
            toolName: "write_code",
          },
        ],
        dependsOnPhaseIndices: [0],
      },
      {
        name: "Testing & QA",
        preferredSpecializations: ["Developer", "Analyst"],
        steps: [
          {
            title: "Run full test suite",
            description: "Execute all unit, integration, and e2e tests",
            toolName: "run_tests",
          },
          {
            title: "Code review",
            description: "Review all code for quality and security",
            toolName: "code_review",
          },
          {
            title: "Bug fixes",
            description: "Fix any issues found during testing",
            toolName: "debug_code",
          },
          {
            title: "Lint and format",
            description: "Ensure code quality standards",
            toolName: "lint_code",
          },
        ],
        dependsOnPhaseIndices: [1, 2],
      },
      {
        name: "Documentation",
        preferredSpecializations: ["Writer", "Librarian"],
        steps: [
          {
            title: "Take screenshots",
            description: "Capture screenshots of all pages and features",
          },
          {
            title: "Write user manual",
            description: "Create comprehensive user guide with screenshots",
          },
          { title: "Write API docs", description: "Document all API endpoints for developers" },
        ],
        dependsOnPhaseIndices: [3],
      },
      {
        name: "Design & Assets",
        preferredSpecializations: ["Artist", "Musician"],
        steps: [
          {
            title: "Create logo and branding",
            description: "Design logo, color scheme, typography",
            toolName: "create_art",
          },
          {
            title: "Design marketing graphics",
            description: "Create social media graphics, banners",
            toolName: "create_art",
          },
          {
            title: "Create promotional images",
            description: "Product screenshots, feature highlights",
            toolName: "create_art",
          },
        ],
        dependsOnPhaseIndices: [3],
      },
      {
        name: "Marketing & Launch",
        preferredSpecializations: ["Strategist", "Ambassador", "Writer"],
        steps: [
          {
            title: "Create marketing plan",
            description: "Define target audience, channels, messaging",
          },
          {
            title: "Write marketing copy",
            description: "Landing page, email campaigns, social posts",
          },
          { title: "Create promotional video", description: "Product demo or explainer video" },
          { title: "Prepare launch materials", description: "Press kit, blog post, changelog" },
        ],
        dependsOnPhaseIndices: [5],
      },
      {
        name: "Deployment & Distribution",
        preferredSpecializations: ["Engineer", "Developer"],
        steps: [
          {
            title: "Deploy to production",
            description: "Set up hosting, CI/CD, deploy",
            toolName: "deploy_app",
          },
          {
            title: "Publish to channels",
            description: "Distribute via social media, YouTube, etc.",
          },
          { title: "Monitor launch", description: "Watch for errors, performance issues" },
        ],
        dependsOnPhaseIndices: [4, 6],
      },
    ],
  },
  documentation: {
    phases: [
      {
        name: "Content Gathering",
        preferredSpecializations: ["Researcher", "Analyst"],
        steps: [
          { title: "Audit existing features", description: "Catalog all features and pages" },
          { title: "Take screenshots", description: "Capture all UI states" },
          { title: "Interview stakeholders", description: "Gather requirements and context" },
        ],
        dependsOnPhaseIndices: [],
      },
      {
        name: "Writing",
        preferredSpecializations: ["Writer", "Librarian"],
        steps: [
          { title: "Write user guide", description: "Step-by-step instructions for all features" },
          { title: "Write admin guide", description: "System administration documentation" },
          { title: "Write API reference", description: "Technical API documentation" },
        ],
        dependsOnPhaseIndices: [0],
      },
      {
        name: "Review & Publish",
        preferredSpecializations: ["Writer", "Analyst"],
        steps: [
          { title: "Technical review", description: "Verify accuracy of all documentation" },
          { title: "Edit and polish", description: "Proofread and improve readability" },
          { title: "Publish", description: "Deploy documentation site" },
        ],
        dependsOnPhaseIndices: [1],
      },
    ],
  },
  "marketing-campaign": {
    phases: [
      {
        name: "Strategy",
        preferredSpecializations: ["Strategist", "Planner"],
        steps: [
          { title: "Define target audience", description: "Research demographics, personas" },
          { title: "Choose channels", description: "Select social media, email, ads platforms" },
          { title: "Set KPIs", description: "Define success metrics and goals" },
        ],
        dependsOnPhaseIndices: [],
      },
      {
        name: "Content Creation",
        preferredSpecializations: ["Artist", "Writer", "Musician"],
        steps: [
          {
            title: "Create visual assets",
            description: "Graphics, photos, infographics",
            toolName: "create_art",
          },
          { title: "Write copy", description: "Ad copy, social posts, email content" },
          { title: "Produce video", description: "Promotional or explainer video" },
        ],
        dependsOnPhaseIndices: [0],
      },
      {
        name: "Distribution",
        preferredSpecializations: ["Ambassador", "Diplomat"],
        steps: [
          { title: "Publish content", description: "Post to all selected channels" },
          { title: "Engage audience", description: "Respond to comments, manage community" },
          { title: "Track performance", description: "Monitor KPIs and adjust strategy" },
        ],
        dependsOnPhaseIndices: [1],
      },
    ],
  },

  // ─── Phase 41: Infrastructure Workflow Templates ──────────────

  "model-deployment": {
    phases: [
      {
        name: "System Resource Audit",
        preferredSpecializations: ["Engineer", "Analyst"],
        steps: [
          { title: "Probe system resources", description: "Check CPU, RAM, VRAM, GPU, disk" },
          { title: "Discover runtimes", description: "Find Ollama, LM Studio, BitNet, Docker" },
          {
            title: "Assess hardware eligibility",
            description: "Compare resources to model requirements",
          },
        ],
        dependsOnPhaseIndices: [],
      },
      {
        name: "Model Selection",
        preferredSpecializations: ["Engineer", "Researcher"],
        steps: [
          { title: "Search model registry", description: "Browse curated GGUF model catalog" },
          {
            title: "Evaluate model options",
            description: "Compare capabilities, size, quantizations",
          },
          { title: "Select optimal model", description: "Pick best model for system resources" },
        ],
        dependsOnPhaseIndices: [0],
      },
      {
        name: "Download & Verify",
        preferredSpecializations: ["Engineer", "Developer"],
        steps: [
          { title: "Download GGUF model", description: "Fetch model from HuggingFace with resume" },
          { title: "Verify integrity", description: "Check SHA256 hash of downloaded file" },
          { title: "Confirm disk usage", description: "Verify model size matches expectations" },
        ],
        dependsOnPhaseIndices: [1],
      },
      {
        name: "Load into Runtime",
        preferredSpecializations: ["Engineer"],
        steps: [
          {
            title: "Ensure runtime is running",
            description: "Start Ollama or LM Studio if needed",
          },
          { title: "Load model", description: "Import GGUF model into the selected runtime" },
          {
            title: "Confirm model availability",
            description: "Verify model appears in runtime list",
          },
        ],
        dependsOnPhaseIndices: [2],
      },
      {
        name: "Validation",
        preferredSpecializations: ["Engineer", "Analyst"],
        steps: [
          { title: "Run inference test", description: "Send a test prompt and verify response" },
          { title: "Benchmark performance", description: "Measure tokens/sec and latency" },
          { title: "Report results", description: "Log deployment status and metrics" },
        ],
        dependsOnPhaseIndices: [3],
      },
    ],
  },

  "docker-service-stack": {
    phases: [
      {
        name: "Docker Health Check",
        preferredSpecializations: ["Engineer"],
        steps: [
          { title: "Verify Docker availability", description: "Check Docker CLI and daemon" },
          { title: "Check resource budget", description: "Verify CPU, memory, container limits" },
          { title: "List existing containers", description: "Identify running services" },
        ],
        dependsOnPhaseIndices: [],
      },
      {
        name: "Network Setup",
        preferredSpecializations: ["Engineer"],
        steps: [
          { title: "Create Docker network", description: "Set up isolated network for services" },
          { title: "Configure DNS", description: "Set up service name resolution" },
        ],
        dependsOnPhaseIndices: [0],
      },
      {
        name: "Service Deployment",
        preferredSpecializations: ["Engineer", "Developer"],
        steps: [
          { title: "Pull images", description: "Download required Docker images" },
          { title: "Launch services", description: "Start containers with resource limits" },
          { title: "Verify connectivity", description: "Check services are reachable" },
        ],
        dependsOnPhaseIndices: [1],
      },
      {
        name: "Monitoring",
        preferredSpecializations: ["Analyst", "Engineer"],
        steps: [
          { title: "Inspect containers", description: "Verify container health and ports" },
          { title: "Check resource usage", description: "Monitor CPU and memory consumption" },
          { title: "Report status", description: "Log deployed stack summary" },
        ],
        dependsOnPhaseIndices: [2],
      },
    ],
  },

  "infra-provisioning": {
    phases: [
      {
        name: "Hardware Audit",
        preferredSpecializations: ["Engineer", "Analyst"],
        steps: [
          { title: "Probe system resources", description: "Full CPU, RAM, GPU, disk audit" },
          { title: "Assess compute capacity", description: "Determine available compute budget" },
        ],
        dependsOnPhaseIndices: [],
      },
      {
        name: "Runtime Discovery",
        preferredSpecializations: ["Engineer"],
        steps: [
          { title: "Discover all runtimes", description: "Find Ollama, LM Studio, Docker, BitNet" },
          { title: "Check runtime health", description: "Verify each runtime's health status" },
        ],
        dependsOnPhaseIndices: [0],
      },
      {
        name: "Runtime Activation",
        preferredSpecializations: ["Engineer"],
        steps: [
          {
            title: "Start missing runtimes",
            description: "Launch any available but stopped runtimes",
          },
          { title: "Verify endpoints", description: "Confirm runtime API endpoints respond" },
        ],
        dependsOnPhaseIndices: [1],
      },
      {
        name: "Model Provisioning",
        preferredSpecializations: ["Engineer", "Researcher"],
        steps: [
          { title: "Select model", description: "Choose optimal model for hardware" },
          { title: "Download & load model", description: "Fetch GGUF and import into runtime" },
          { title: "Test inference", description: "Verify model responds correctly" },
        ],
        dependsOnPhaseIndices: [2],
      },
      {
        name: "Docker Services",
        preferredSpecializations: ["Engineer", "Developer"],
        steps: [
          { title: "Launch PostgreSQL", description: "Start Postgres for data persistence" },
          { title: "Launch Redis", description: "Start Redis for caching and queues" },
          { title: "Launch ChromaDB", description: "Start vector DB for embeddings" },
        ],
        dependsOnPhaseIndices: [0],
      },
      {
        name: "Health Verification",
        preferredSpecializations: ["Analyst", "Engineer"],
        steps: [
          { title: "Run health check", description: "Full infrastructure health assessment" },
          { title: "Generate report", description: "Compile provisioning results and status" },
        ],
        dependsOnPhaseIndices: [3, 4],
      },
    ],
  },
};

export { WORKFLOW_TEMPLATES, type WorkflowTemplate };

