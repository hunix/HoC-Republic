/**
 * Application — Prompt Composer
 *
 * Generates Open Lovable capability descriptions for injection
 * into citizen system prompts. Active for developer/web/designer citizens.
 */

const WEB_ROLES = [
  "developer",
  "web",
  "frontend",
  "designer",
  "ui",
  "ux",
  "fullstack",
  "engineer",
  "architect",
  "builder",
  "creator",
];

export function composeLovablePrompt(specialization: string): string {
  const isWeb = WEB_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isWeb) {
    return "";
  }

  return `## 🔥 Open Lovable — AI Website Cloning & React Generation (Firecrawl)

You have access to Open Lovable, which can clone any website and recreate it as a modern React app.

### Capabilities:
• **Clone** — Scrape any URL via Firecrawl and generate a React clone
• **Chat-to-Code** — Build React apps through natural language chat
• **Edit** — Modify existing generated projects

### Tools:
• \`lovable_clone\` — Clone a website URL into a React app
• \`lovable_job_status\` — Check cloning/generation progress
• \`lovable_cancel\` — Cancel a queued job
• \`lovable_queue_status\` — View queue statistics

### AI Providers:
Gemini, Anthropic (Claude), OpenAI (GPT), Groq

### Workflow:
1. Provide a URL to clone → Firecrawl scrapes it
2. AI generates a modern React app from the scraped content
3. App is deployed to sandbox (Vercel or E2B)

### Tips:
• Add custom instructions to guide the generation style
• Works best with content-rich pages
• Clone result is a full, deployable React application`;
}
