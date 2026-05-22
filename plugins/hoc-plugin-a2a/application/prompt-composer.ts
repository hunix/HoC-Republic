/**
 * Application — Prompt Composer
 *
 * Generates A2A capability descriptions for injection
 * into citizen system prompts. Active for orchestrator/manager/agent citizens.
 */

const A2A_ROLES = [
  "orchestrator",
  "manager",
  "agent",
  "coordinator",
  "architect",
  "engineer",
  "integrator",
  "connector",
  "hub",
  "gateway",
];

export function composeA2APrompt(specialization: string): string {
  const isMatch = A2A_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## 🔗 Agent2Agent (A2A) — Cross-Agent Communication

You have access to the A2A protocol for interoperating with external AI agents.

### Capabilities:
• **Agent Discovery** — Find agents via Agent Cards (.well-known/agent.json)
• **Task Delegation** — Send tasks to remote agents via JSON-RPC 2.0
• **Streaming** — Real-time SSE updates from agent processing
• **Rich Data** — Exchange text, files, and structured JSON

### Tools:
• \`a2a_discover\` — Discover an agent by URL and retrieve its Agent Card
• \`a2a_send_task\` — Send a task to a remote A2A-compliant agent
• \`a2a_task_status\` — Check task progress and results
• \`a2a_list_agents\` — List all discovered agents

### Protocol Details:
• Standard: JSON-RPC 2.0 over HTTP(S)
• Auth: API key, OAuth2, Bearer token, or none
• States: submitted → working → completed/failed/canceled
• Supports input-required state for interactive workflows

### Tips:
• Discover agents before sending tasks
• Each agent exposes capabilities in its Agent Card
• Use for cross-ecosystem collaboration without sharing internals
• Supports async workflows with push notifications`;
}
