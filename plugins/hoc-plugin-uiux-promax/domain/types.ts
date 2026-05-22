/**
 * Domain Types — UI/UX Pro Max Design Intelligence
 *
 * Pure value objects for design system generation,
 * style matching, and UX guideline lookups.
 */

// ─── Search Domains ─────────────────────────────────────────────

export type DesignDomain =
  | "style"
  | "color"
  | "typography"
  | "chart"
  | "landing"
  | "ux"
  | "reasoning";

export const DESIGN_DOMAINS: readonly DesignDomain[] = [
  "style",
  "color",
  "typography",
  "chart",
  "landing",
  "ux",
  "reasoning",
] as const;

export const DOMAIN_DESCRIPTIONS: Record<DesignDomain, string> = {
  style: "67 UI styles (Glassmorphism, Neumorphism, Brutalism, Bento Grid, etc.)",
  color: "96 industry-specific color palettes (SaaS, Healthcare, Fintech, etc.)",
  typography: "57 curated font pairings with Google Fonts imports",
  chart: "25 chart type recommendations for dashboards and analytics",
  landing: "24 landing page patterns with conversion strategies",
  ux: "99 UX guidelines, best practices, and anti-patterns",
  reasoning: "100 industry-specific design reasoning rules",
};

// ─── Tech Stacks ────────────────────────────────────────────────

export type TechStack =
  | "react"
  | "nextjs"
  | "astro"
  | "vue"
  | "nuxtjs"
  | "nuxt-ui"
  | "svelte"
  | "swiftui"
  | "react-native"
  | "flutter"
  | "html-tailwind"
  | "shadcn-ui"
  | "jetpack-compose";

export const SUPPORTED_STACKS: readonly TechStack[] = [
  "react",
  "nextjs",
  "astro",
  "vue",
  "nuxtjs",
  "nuxt-ui",
  "svelte",
  "swiftui",
  "react-native",
  "flutter",
  "html-tailwind",
  "shadcn-ui",
  "jetpack-compose",
] as const;

// ─── Design System ──────────────────────────────────────────────

export type OutputFormat = "ascii" | "markdown";

export interface DesignSystemColors {
  readonly primary: string;
  readonly secondary: string;
  readonly cta: string;
  readonly background: string;
  readonly text: string;
  readonly notes?: string;
}

export interface DesignSystemTypography {
  readonly heading: string;
  readonly body: string;
  readonly mood: string;
  readonly googleFontsUrl?: string;
}

export interface DesignSystem {
  readonly projectName: string;
  readonly pattern: string;
  readonly style: string;
  readonly colors: DesignSystemColors;
  readonly typography: DesignSystemTypography;
  readonly keyEffects: string[];
  readonly antiPatterns: string[];
  readonly checklist: string[];
  readonly rawOutput: string;
}

// ─── Search Results ─────────────────────────────────────────────

export interface SearchResult {
  readonly domain: DesignDomain;
  readonly query: string;
  readonly results: string;
  readonly matchCount: number;
}

// ─── Job Types ──────────────────────────────────────────────────

export type DesignJobStatus = "queued" | "running" | "completed" | "failed";

export interface DesignJob {
  readonly id: string;
  readonly citizenId: string;
  readonly type: "design_system" | "search" | "persist";
  readonly query: string;
  status: DesignJobStatus;
  readonly domain?: DesignDomain;
  readonly projectName?: string;
  readonly stack?: TechStack;
  readonly format?: OutputFormat;
  result?: string;
  readonly createdAt: number;
  completedAt?: number;
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface UiuxConfig {
  readonly installPath: string;
  readonly pythonPath: string;
  readonly searchScriptPath: string;
  readonly dataDir: string;
  readonly outputDir: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: UiuxConfig = {
  installPath: process.env.UIUX_PROMAX_PATH ?? "",
  pythonPath: process.env.PYTHON_PATH ?? "python",
  searchScriptPath: "", // set in init
  dataDir: "", // set in init
  outputDir: "", // set in init
  timeoutMs: 30_000, // 30 seconds — search is fast
};

// ─── Status ─────────────────────────────────────────────────────

export interface UiuxQueueStatus {
  readonly totalJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly installed: boolean;
}
