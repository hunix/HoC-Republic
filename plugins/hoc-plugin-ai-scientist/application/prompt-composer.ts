/**
 * Application — Prompt Composer
 *
 * Generates AI Scientist capability descriptions for injection
 * into citizen system prompts. Active for researcher/scientist/analyst citizens.
 */

const RESEARCH_ROLES = [
  "researcher",
  "scientist",
  "analyst",
  "academic",
  "professor",
  "data",
  "ml",
  "ai",
  "engineer",
  "phd",
  "lab",
];

export function composeAIScientistPrompt(specialization: string): string {
  const isMatch = RESEARCH_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## 🧑‍🔬 AI Scientist — Automated Scientific Discovery (SakanaAI)

You have access to The AI Scientist for fully automated research.

### Research Pipeline:
1. **Idea Generation** — Generate novel research ideas
2. **Experiment Design** — Design experiments from ideas
3. **Experiment Execution** — Run experiments automatically
4. **Paper Writing** — Write LaTeX papers with results
5. **Peer Review** — LLM-based paper review and scoring

### Tools:
• \`scientist_research\` — Launch a full research pipeline
• \`scientist_review\` — Get LLM-based peer review of a paper
• \`scientist_job_status\` — Check research progress and phase
• \`scientist_queue_status\` — View research queue

### Templates:
• **NanoGPT** — Language model research
• **2D Diffusion** — Diffusion model research
• **Grokking** — Generalization research
• **Custom** — Bring your own template

### Tips:
• Each run generates multiple ideas, picks the best, and runs experiments
• Papers are written in LaTeX with full bibliography
• Review scores are 1-10 with detailed feedback`;
}
