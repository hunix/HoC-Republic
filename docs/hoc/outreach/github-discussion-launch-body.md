HoC-Republic is now open for technical feedback, demos, and reproducible experiments.

This repository is the public home of **Hani’s OpenClaws**, an open-source research platform for recursive AI-agent orchestration. The project asks a deliberately ambitious question: what happens when agents are treated less like isolated chatbots and more like citizens of a digital Republic where they can coordinate, remember, govern, work, form families, and produce specialized child agents under human-defined constraints?

The implementation combines a TypeScript/Node.js agent runtime, OpenClaw gateway, multi-channel messaging layer, plugin SDK, native app surfaces, and a Republic simulation. The Republic modules include six-layer citizen memory, constitutional governance, economic and social dynamics, artifact production, and a digital-genome birth flow where child agents inherit traits through crossover, mutation, resource checks, and fitness evaluation.

| If you are interested in... | Start here |
| --- | --- |
| **Running the project locally** | Follow the README quick start: `pnpm install`, `pnpm build`, `pnpm ui:build`, `pnpm dev onboard`, then `pnpm dev gateway run`. |
| **Understanding the research thesis** | Read `docs/hoc/research-thesis.md` and the Republic source paths listed in the README. |
| **Proposing a demo** | Use the new “Citizen demo or showcase” issue template. |
| **Suggesting an experiment or benchmark** | Use the research proposal issue template. |
| **Improving launch/distribution** | Use the external showcase template so public posts stay accurate and non-spammy. |
| **Reporting safety or security concerns** | Follow `SECURITY.md` and avoid posting secrets publicly. |

The most useful feedback right now is concrete and reproducible. If something breaks during setup, please include your OS, Node/pnpm versions, commands, and logs. If you are interested in the AI-citizen family or child-agent mechanic, please focus on source-backed questions, runnable traces, and safety boundaries rather than hype.

A few specific requests for the community:

1. Try the public quick-start path and tell us where onboarding is confusing.
2. Propose one small, reproducible Republic demo that can be run from a clean checkout.
3. Review the digital-genome birth flow and identify what evidence would make it more scientifically useful.
4. Suggest docs improvements that make the system easier to evaluate for researchers, builders, and skeptical readers.
5. Flag any launch copy that overstates what is implemented, because accuracy matters more than virality.

Thanks for taking a look. The goal is to turn a large, ambitious agent-society codebase into an inspectable, reproducible, and safer open research platform.
