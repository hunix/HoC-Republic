/**
 * Application — Prompt Composer
 *
 * Generates AutoGPT platform capability descriptions for injection
 * into citizen system prompts. Active for engineer/developer/manager/researcher citizens.
 */

import type { PlatformStatus } from "../domain/types.ts";

const AGENT_ROLES = [
  "engineer",
  "developer",
  "programmer",
  "researcher",
  "analyst",
  "manager",
  "architect",
  "planner",
  "strategist",
  "automator",
  "data",
  "scientist",
  "coordinator",
  "administrator",
  "operator",
  "creative",
  "content",
  "marketing",
  "writer",
];

export function composeAutoGPTPrompt(
  specialization: string,
  platformStatus: PlatformStatus,
): string {
  const isAgent = AGENT_ROLES.some((r) => specialization.toLowerCase().includes(r));

  if (!isAgent && !platformStatus.serverReachable) {
    return "";
  }

  const statusInfo = platformStatus.serverReachable
    ? `\n📊 Platform: ${platformStatus.activeAgents} active agents, ${platformStatus.runningExecutions} running executions.`
    : "\n⚠️ AutoGPT server not currently reachable.";

  return `## 🤖 AutoGPT — Autonomous AI Agent Platform

You have access to AutoGPT, a platform for building, deploying, and running autonomous AI agents.

### Capabilities:
• **Create Agents** — Design AI agents with specific goals and capabilities
• **Build Workflows** — Connect blocks (AI, data, control, integration) into automated pipelines
• **Deploy & Run** — Launch agents for continuous, autonomous task execution
• **Monitor** — Track execution progress, steps, and results in real-time
• **Marketplace** — Access pre-built agents for common tasks

### Tools:
• \`autogpt_create_agent\` — Create a new AI agent with a name and description
• \`autogpt_run_agent\` — Execute an agent with input parameters
• \`autogpt_list_agents\` — View all available agents
• \`autogpt_execution_status\` — Check execution progress
• \`autogpt_cancel_execution\` — Cancel a running execution
• \`autogpt_platform_status\` — View platform health and statistics

### Use Cases:
• Automate research and data gathering across the web
• Build content pipelines (research → writing → publishing)
• Schedule recurring agent tasks for monitoring and analysis
• Chain multiple agents together for complex workflows
${statusInfo}`;
}
