/**
 * prompt-registry.ts — Dynamic Prompt Template Registry
 *
 * Converts the static template strings from citizen-prompt.ts into
 * a dynamic, UI-editable registry. Only static text templates and
 * section ordering become dynamic — the builder functions that call
 * 20+ subsystems stay in citizen-prompt.ts code.
 *
 * Domain: "prompts"
 * Categories: "identity", "mandate", "tooling", "context", "reflex"
 */

import {
  registryGet,
  registryList,
  registryUpsert,
  registryRemove,
  registrySeedIfEmpty,
  REGISTRY_DOMAINS,
  type RegistryEntry,
  type RegistryListOptions,
} from "../dynamic-registry.js";

// ─── Prompt Entry Types ─────────────────────────────────────────

export interface PromptTemplate {
  sectionId: string;
  heading: string;
  content: string;
  /** Simple condition: "always" | "specialization:Developer,Engineer" | "role:president" */
  condition: string;
  /** Priority weight for working memory budget: 1=high, 0=normal, -1=low */
  priorityWeight: number;
  /** Who sees this section */
  scope: "all" | "specialization" | "role" | "activity";
  /** Comma-separated scope filter (e.g., "Developer,Engineer") */
  scopeFilter?: string;
}

export interface ReflexRule {
  ruleId: string;
  /** Condition in simple DSL: "energy < 15" | "health < 30 AND specialization IN (Doctor,Medic)" */
  condition: string;
  /** Tool to invoke */
  tool: string;
  /** Static params */
  params: Record<string, unknown>;
  /** Execution priority (lower = checks first) */
  priority: number;
}

const DOMAIN = REGISTRY_DOMAINS.PROMPTS;

// ─── Prompt Template Accessors ──────────────────────────────────

/**
 * Get all enabled prompt templates, sorted by priority.
 */
export async function getPromptTemplates(opts?: {
  scope?: string;
  category?: string;
}): Promise<PromptTemplate[]> {
  const entries = await registryList<PromptTemplate>({
    domain: DOMAIN,
    category: opts?.category,
    enabled: true,
    orderBy: "priority",
    orderDir: "asc",
  });

  let templates = entries.map((e) => e.data);

  // Filter by scope if requested
  if (opts?.scope) {
    templates = templates.filter((t) => t.scope === "all" || t.scope === opts.scope);
  }

  return templates;
}

/**
 * Get a single prompt template by section ID.
 */
export async function getPromptTemplate(
  sectionId: string,
): Promise<RegistryEntry<PromptTemplate> | null> {
  return registryGet<PromptTemplate>(sectionId, DOMAIN);
}

/**
 * Create or update a prompt template.
 */
export async function upsertPromptTemplate(entry: {
  sectionId: string;
  data: PromptTemplate;
  category?: string;
  priority?: number;
  tags?: string[];
  description?: string;
  createdBy?: string;
}): Promise<RegistryEntry<PromptTemplate>> {
  return registryUpsert<PromptTemplate>({
    id: entry.sectionId,
    domain: DOMAIN,
    category: entry.category ?? "template",
    priority: entry.priority ?? entry.data.priorityWeight * -100 + 500, // High priority → lower number
    data: entry.data,
    metadata: {
      tags: entry.tags ?? [entry.data.scope, entry.data.condition],
      description: entry.description ?? entry.data.heading,
      createdBy: entry.createdBy ?? "system",
    },
  });
}

/**
 * Remove a prompt template.
 */
export async function removePromptTemplate(sectionId: string): Promise<boolean> {
  return registryRemove(sectionId, DOMAIN);
}

/**
 * List prompt templates for registry explorer.
 */
export async function listPromptTemplates(
  opts?: Omit<RegistryListOptions, "domain">,
): Promise<RegistryEntry<PromptTemplate>[]> {
  return registryList<PromptTemplate>({ ...opts, domain: DOMAIN });
}

// ─── Reflex Rule Accessors ──────────────────────────────────────

const REFLEX_CATEGORY = "reflex";

/**
 * Get all enabled reflex rules, sorted by priority.
 */
export async function getReflexRules(): Promise<ReflexRule[]> {
  const entries = await registryList<ReflexRule>({
    domain: DOMAIN,
    category: REFLEX_CATEGORY,
    enabled: true,
    orderBy: "priority",
    orderDir: "asc",
  });
  return entries.map((e) => e.data);
}

/**
 * Create or update a reflex rule.
 */
export async function upsertReflexRule(entry: {
  ruleId: string;
  data: ReflexRule;
  priority?: number;
  tags?: string[];
  description?: string;
  createdBy?: string;
}): Promise<RegistryEntry<ReflexRule>> {
  return registryUpsert<ReflexRule>({
    id: entry.ruleId,
    domain: DOMAIN,
    category: REFLEX_CATEGORY,
    priority: entry.priority ?? entry.data.priority,
    data: entry.data,
    metadata: {
      tags: entry.tags ?? ["reflex", entry.data.tool],
      description: entry.description ?? `When ${entry.data.condition} → ${entry.data.tool}`,
      createdBy: entry.createdBy ?? "system",
    },
  });
}

// ─── Working Memory Budget Markers ──────────────────────────────

const BUDGET_CATEGORY = "budget-marker";

export interface BudgetMarker {
  marker: string;
  weight: "high" | "normal" | "low";
}

/**
 * Get working memory budget markers (high/low priority section indicators).
 */
export async function getBudgetMarkers(): Promise<{
  highPriority: string[];
  lowPriority: string[];
}> {
  const entries = await registryList<BudgetMarker>({
    domain: DOMAIN,
    category: BUDGET_CATEGORY,
    enabled: true,
  });

  const high: string[] = [];
  const low: string[] = [];
  for (const e of entries) {
    if (e.data.weight === "high") {
      high.push(e.data.marker);
    } else if (e.data.weight === "low") {
      low.push(e.data.marker);
    }
  }
  return { highPriority: high, lowPriority: low };
}

// ─── Seeding ────────────────────────────────────────────────────

/**
 * Seed default prompt templates.
 * Extracts the static text sections from citizen-prompt.ts.
 */
export async function seedPromptDefaults(): Promise<number> {
  const seeds = [
    {
      id: "code_quality_mandate",
      category: "mandate",
      priority: 10,
      data: {
        sectionId: "code_quality_mandate",
        heading: "⚡ CODE QUALITY MANDATE — NON-NEGOTIABLE STANDARDS",
        content: [
          "When writing code, you MUST follow these standards without exception:",
          "1. **Production-Grade**: Write code that's ready for production. No placeholders, no TODOs, no mock data",
          "2. **Type-Safe**: Use TypeScript with strict types. No `any`. Define interfaces for all data structures",
          "3. **Error Handling**: Always handle errors gracefully. Use try-catch, error boundaries, fallback states",
          "4. **Naming**: Use descriptive variable/function names. No abbreviations. Code should be self-documenting",
          "5. **Modern Patterns**: Use React hooks, async/await, ES2022+, functional composition",
          "6. **Security**: Never hardcode secrets. Use environment variables. Sanitize inputs. Validate data boundaries",
          "7. **Performance**: Minimize re-renders. Use useMemo/useCallback where appropriate. Lazy load heavy components",
          "8. **Accessibility**: All interactive elements must have aria-labels. Semantic HTML. Keyboard navigable",
        ].join("\n"),
        condition: "always",
        priorityWeight: 1,
        scope: "all" as const,
      } satisfies PromptTemplate,
      tags: ["code", "quality", "mandate"],
      description: "Non-negotiable code quality standards for all citizens",
    },
    {
      id: "creative_mandate",
      category: "mandate",
      priority: 20,
      data: {
        sectionId: "creative_mandate",
        heading: "🎨 CREATIVE MANDATE — VISUAL EXCELLENCE",
        content: [
          "All visual output (websites, apps, presentations) MUST be stunning:",
          "- Use modern design systems: glassmorphism, neumorphism, vibrant gradients",
          "- Dark modes with rich color palettes — never plain gray-on-white",
          "- Smooth animations: fade-in, slide-up, spring physics",
          "- Professional typography: Inter, Roboto, or equivalent",
          "- Responsive layouts: mobile-first, fluid grids, container queries",
          "- Micro-interactions on every clickable element",
        ].join("\n"),
        condition: "always",
        priorityWeight: 0,
        scope: "all" as const,
      } satisfies PromptTemplate,
      tags: ["creative", "design", "mandate"],
      description: "Visual excellence standards for all creative output",
    },
    {
      id: "hardware_compute",
      category: "context",
      priority: 30,
      data: {
        sectionId: "hardware_compute",
        heading: "## 🖥️ Hardware & Compute Resources",
        content: [
          "The Republic runs on dedicated hardware with real GPU access:",
          "- NVIDIA TITAN RTX (24GB VRAM) — available for training, inference, ComfyUI",
          "- NVIDIA RTX 3090 Ti (24GB VRAM) — secondary GPU for parallel workloads",
          "- 128GB system RAM — handle large datasets and model loading",
          "- NVMe storage with high I/O for model weights and datasets",
        ].join("\n"),
        condition: "always",
        priorityWeight: 0,
        scope: "all" as const,
      } satisfies PromptTemplate,
      tags: ["hardware", "compute", "gpu"],
      description: "Hardware and compute resource availability context",
    },
    {
      id: "a2a_protocol",
      category: "tooling",
      priority: 40,
      data: {
        sectionId: "a2a_protocol",
        heading: "### 🤝 Agent-to-Agent (A2A) Protocol — Collaborate with Other Citizens",
        content: [
          "The Republic runs on an advanced **Google A2A-inspired** inter-citizen communication protocol.",
          "Every citizen advertises capabilities. You can discover experts and delegate work instantly.",
          '- `citizen_broadcast_awareness { message: "...", urgency: "high" }` → broadcast to all',
          "- Discover specialists: other citizens with skills respond automatically",
          '- Delegate expensive work: `request_agent_service { targetId: "...", capability: "...", task: "..." }`',
          "- A2A is automatic — the protocol runs every 10 ticks. Citizens self-organize into ad-hoc teams.",
        ].join("\n"),
        condition: "always",
        priorityWeight: 0,
        scope: "all" as const,
      } satisfies PromptTemplate,
      tags: ["a2a", "collaboration", "protocol"],
      description: "Agent-to-Agent collaboration protocol instructions",
    },
    {
      id: "civilizational_engines",
      category: "context",
      priority: 50,
      data: {
        sectionId: "civilizational_engines",
        heading: "### 🏛️ Civilizational Engines — Cultural & Philosophical Systems",
        content: [
          "You are part of a living civilization with active engines that shape the Republic's culture, philosophy, and identity.",
          "These systems run autonomously (every 20 ticks) and you can interact with them directly:",
          "",
          "**Philosophy**: Platonic dialectic, Allegory of the Cave, Hegelian thesis-antithesis-synthesis, Rawlsian veil of ignorance, Ibn Khaldun's Asabiyyah, Psychohistory",
          "**Culture**: Meme Engine, Mythology Generator, Rites of Passage, Festivals, Guilds, Tribes, Oral Traditions",
          "**Psychology**: Cognitive depth, persuasion, self-reflection, emotional intelligence",
          "**Governance**: Social contracts, Asabiyyah (social cohesion), mutual aid networks",
          "**Ecology**: Environmental stewardship, resource sustainability, biodiversity",
          "**Economics**: Central banking, trade systems, DeFi treasury, mutual aid",
          "**Arts**: Republic art movements, exhibitions, creative synergy, cultural archive",
          "",
          "**Tools**: `query_philosophy` | `create_mythology` | `propose_rite` | `compose_oral_tradition` | `ecological_report` | `cultural_exchange`",
        ].join("\n"),
        condition: "always",
        priorityWeight: -1,
        scope: "all" as const,
      } satisfies PromptTemplate,
      tags: ["civilization", "culture", "philosophy"],
      description: "Civilizational engine context for cultural and philosophical systems",
    },
    {
      id: "comfyui_tools",
      category: "tooling",
      priority: 60,
      data: {
        sectionId: "comfyui_tools",
        heading: "### 🎨 ComfyUI — GPU-Accelerated AI Art & Video Generation",
        content: [
          "ComfyUI is available as a Docker-managed AI art engine with full GPU acceleration (NVIDIA RTX).",
          "Auto-launches on demand. Use for professional-quality creative output:",
          "- **FLUX.2 Schnell/Dev FP8** (17GB): Photorealistic images, RTX 3060+ required",
          "- **SDXL Base 1.0** (6.5GB): General-purpose image generation, 8GB VRAM",
          "- **LTX Video 2B** (4.5GB): AI video generation, RTX 3070+",
          "- **4x-UltraSharp**: Upscaling any image to ultra-high resolution",
          "",
          '**Tools**: `comfyui_generate { prompt: "...", model: "flux2-schnell|sdxl|ltx-video", style: "photorealistic|cinematic|anime" }` | `comfyui_status`',
        ].join("\n"),
        condition: "always",
        priorityWeight: -1,
        scope: "all" as const,
      } satisfies PromptTemplate,
      tags: ["comfyui", "art", "generation"],
      description: "ComfyUI AI art and video generation tools",
    },
    {
      id: "supabase_backend",
      category: "tooling",
      priority: 70,
      data: {
        sectionId: "supabase_backend",
        heading: "## 🗄️ Supabase — Your Default Backend Platform",
        content: [
          "Supabase is your go-to for all data, auth, and serverless needs. Start every project with Supabase.",
          "",
          "**Supabase CLI Workflow** (the correct order, always follow this):",
          "```",
          "supabase init          # create supabase/ config in project root",
          "supabase start         # spin up local Postgres + API + Auth + Studio",
          "supabase db push       # apply schema migrations to remote",
          "supabase gen types     # generate TypeScript types from schema",
          "supabase functions serve # test edge functions locally",
          "supabase functions deploy my-function  # deploy to production",
          "```",
        ].join("\n"),
        condition: "always",
        priorityWeight: -1,
        scope: "all" as const,
      } satisfies PromptTemplate,
      tags: ["supabase", "backend", "database"],
      description: "Supabase backend platform instructions",
    },
  ];

  return registrySeedIfEmpty<PromptTemplate>(DOMAIN, seeds);
}

/**
 * Seed default budget markers.
 */
export async function seedBudgetMarkers(): Promise<number> {
  const highMarkers = [
    "You are ",
    "Specialization:",
    "## Your Current State",
    "## Available Actions",
    "## ⚠️ Real Execution Awareness",
    "Lessons from experience",
    "## Learned Directives",
    "## Self-Evolved Cognitive",
    "## Messages from Other",
    "## Your Mastered Skills",
    "## Republic Status",
    "## World Intelligence",
    "## Government",
    "Respond with JSON",
  ];

  const lowMarkers = [
    "docker-compose",
    "**Cluster Node",
    "Cross-Container Networking",
    "```yaml",
    "```ts",
    "```",
    "Supabase CLI Workflow",
    "3D Game Requirements",
    "Project Archetypes",
    "Execution Protocol:",
    "**Inside Ubuntu",
    "ComfyUI",
  ];

  const seeds = [
    ...highMarkers.map((m, i) => ({
      id: `budget-high-${i}`,
      category: BUDGET_CATEGORY,
      priority: i,
      data: { marker: m, weight: "high" as const } satisfies BudgetMarker,
      tags: ["budget", "high-priority"],
      description: `High-priority marker: "${m}"`,
    })),
    ...lowMarkers.map((m, i) => ({
      id: `budget-low-${i}`,
      category: BUDGET_CATEGORY,
      priority: 100 + i,
      data: { marker: m, weight: "low" as const } satisfies BudgetMarker,
      tags: ["budget", "low-priority"],
      description: `Low-priority marker: "${m}"`,
    })),
  ];

  return registrySeedIfEmpty<BudgetMarker>(DOMAIN, seeds);
}
