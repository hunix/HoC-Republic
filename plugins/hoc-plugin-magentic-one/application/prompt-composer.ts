/**
 * Application — Prompt Composer
 *
 * Generates Magentic-One capability descriptions for injection
 * into citizen system prompts. Active for engineer/researcher/manager citizens.
 */

const M1_ROLES = [
  "engineer",
  "developer",
  "researcher",
  "manager",
  "analyst",
  "architect",
  "coordinator",
  "project",
  "devops",
  "sre",
];

export function composeMagenticPrompt(specialization: string): string {
  const isMatch = M1_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## 🤖 Magentic-One — Multi-Agent Task Solver (Microsoft AutoGen)

You have access to Magentic-One, a generalist multi-agent system for solving complex tasks.

### Agent Team:
• **Orchestrator** — Coordinates all agents, plans and tracks progress
• **WebSurfer** — Browses the web with multimodal understanding
• **FileSurfer** — Navigates and reads local files
• **Coder** — Writes and executes code

### Tools:
• \`magentic_run_task\` — Submit a complex task for the multi-agent team
• \`magentic_job_status\` — Check task progress and agent activity
• \`magentic_cancel\` — Cancel a queued task
• \`magentic_queue_status\` — View task queue statistics

### Best For:
• Complex web research and data gathering
• File analysis and transformation
• Multi-step coding tasks
• Tasks requiring web browsing + code execution

### Tips:
• Write clear, specific task descriptions
• The team autonomously coordinates — let it work
• Tasks with web + file + code components benefit most`;
}
