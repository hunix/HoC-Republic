/**
 * Application — Prompt Composer
 *
 * Generates DGM capability descriptions for injection
 * into citizen system prompts. Active for engineer/researcher/meta citizens.
 */

const DGM_ROLES = [
  "engineer",
  "researcher",
  "meta",
  "architect",
  "optimizer",
  "developer",
  "evolution",
  "ai",
  "ml",
  "scientist",
];

export function composeDGMPrompt(specialization: string): string {
  const isMatch = DGM_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## 🧬 Darwin Gödel Machine — Self-Improving Agents

You have access to the Darwin Gödel Machine for open-ended evolution of coding agents.

### Evolution Pipeline:
1. **Self-Analysis** — Agent analyzes its own source code
2. **Code Modification** — LLM proposes improvements to agent code
3. **Benchmark Evaluation** — Tests modifications on SWE-bench/Polyglot
4. **Selection** — Fittest variants survive and reproduce

### Tools:
• \`dgm_evolve\` — Start an evolutionary self-improvement run
• \`dgm_job_status\` — Check evolution progress, generation, and best score
• \`dgm_cancel\` — Cancel a queued evolution run
• \`dgm_queue_status\` — View evolution queue

### Benchmarks:
• **SWE-bench** — Real-world software engineering tasks
• **Polyglot** — Multi-language coding benchmark
• **Custom** — Bring your own benchmark

### Tips:
• Each generation produces multiple candidate agents
• Only the best-performing variants survive to the next gen
• Runs in Docker for safety — untrusted code is sandboxed
• Typical runs need 10+ generations for meaningful improvement`;
}
