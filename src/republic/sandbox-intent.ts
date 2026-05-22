/**
 * Sandbox Intent Classification — Route detection for the autonomous agent loop.
 *
 * Determines whether a user message should be handled by the autonomous tool-calling
 * agent loop (project builds, research tasks, etc.) vs a simple conversational response.
 */

/**
 * Detect if a user message is a project/build/research/task request that should
 * be routed to the autonomous agent loop (vs a simple chat question).
 *
 * This is intentionally BROAD — the agent is capable of handling anything
 * from "build me an app" to "create a presentation" to "clone that website".
 */
export function isProjectBuildIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();

  // Short messages are usually questions, not projects (unless they contain a URL)
  if (lower.length < 15 && !lower.includes("http")) {
    return false;
  }

  // ── Question guard: if the message looks like a question about something
  // (rather than a request to build something), don't route to agent loop.
  // This prevents false positives like "can you analyze this chat bug?"
  const questionPatterns =
    /^(what|how|why|when|where|who|which|is |are |do |does |can you explain|tell me about|describe|show me how|help me understand)/;
  const interrogativeEnding = /\?\s*$/;
  // Check for conversational question patterns — "about this/that/the" indicates discussion, not creation
  const aboutPattern = /\b(about|regarding|concerning)\s+(this|that|the|my|our|a )\b/;
  if (
    (questionPatterns.test(lower) || interrogativeEnding.test(lower)) &&
    aboutPattern.test(lower) &&
    !lower.includes("http")
  ) {
    return false;
  }

  // Explicit build/create/make verbs
  const buildVerbs = [
    "build me",
    "build a",
    "build an",
    "create a",
    "create an",
    "create me",
    "make me",
    "make a",
    "make an",
    "design a",
    "design me",
    "develop a",
    "develop me",
    "code a",
    "code me",
    "write a",
    "write me",
    "implement a",
    "implement an",
    "set up a",
    "setup a",
    "scaffold",
    "scaffold a",
    "generate a",
    "generate me",
    "produce a",
    "deploy a",
    "launch a",
    "spin up a",
    "prepare a",
    "prepare me",
    "put together a",
    "clone",
    "scrape",
    "crawl",
    "mirror",
    "research",
    "analyze",
    "investigate",
    "download",
    "fetch",
    "grab",
    "extract",
    "add this result",
    "add it to a",
    "convert to",
    "export to",
    "save as",
  ];
  if (buildVerbs.some((v) => lower.startsWith(v) || lower.includes(v))) {
    return true;
  }

  // App/project-related nouns with action verbs
  const projectNouns = [
    "app",
    "application",
    "website",
    "web app",
    "webapp",
    "web page",
    "webpage",
    "dashboard",
    "portal",
    "page",
    "landing page",
    "landing",
    "api",
    "server",
    "backend",
    "frontend",
    "microservice",
    "tool",
    "script",
    "bot",
    "crawler",
    "scraper",
    "spider",
    "game",
    "calculator",
    "tracker",
    "manager",
    "monitor",
    "todo",
    "chat",
    "blog",
    "store",
    "shop",
    "marketplace",
    "portfolio",
    "gallery",
    "form",
    "survey",
    "quiz",
    "presentation",
    "powerpoint",
    "pptx",
    "slides",
    "deck",
    "report",
    "document",
    "pdf",
    "spreadsheet",
    "excel",
    "database",
    "schema",
    "migration",
    "docker",
    "container",
    "compose",
    "stack",
    "template",
    "boilerplate",
    "starter",
    "prototype",
    "mvp",
    "demo",
    "proof of concept",
    "poc",
  ];
  const hasProjectNoun = projectNouns.some((n) => lower.includes(n));
  const hasActionVerb =
    /\b(build|create|make|design|develop|code|write|implement|set up|setup|generate|prepare|deploy|launch|clone|scrape|crawl|download|fetch|research|analyze|add|convert|export|save)\b/.test(
      lower,
    );
  if (hasProjectNoun && hasActionVerb) {
    return true;
  }

  // "I want/need a ..." + project noun
  if (
    /\b(i want|i need|can you|could you|please|help me|i'd like)\b/.test(lower) &&
    hasProjectNoun
  ) {
    return true;
  }

  // URL-based requests (user pastes a URL with instructions)
  if (
    /https?:\/\//.test(lower) &&
    (hasActionVerb ||
      hasProjectNoun ||
      /\b(about|from|info|data|content|profile|company|extract)\b/.test(lower))
  ) {
    return true;
  }

  // Full-stack / technical project keywords
  if (
    /\b(full.?stack|fullstack|react|vue|angular|next\.?js|express|flask|django|fastapi|tailwind|bootstrap|prisma|sqlite|postgres|mongodb|redis)\b/.test(
      lower,
    ) &&
    hasActionVerb
  ) {
    return true;
  }

  return false;
}
