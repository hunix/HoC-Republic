# HoC-Republic v2026.2.6-5

This first public HoC-Republic release frames the project as the **Republic of OpenClaws**: an open-source TypeScript research platform for recursive AI-agent orchestration, gateway-driven agent workflows, tools, subagents, plugins, and digital-civilization simulation under human-defined constraints.

## Highlights

| Area                          | What is included                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public positioning**        | The README and HoC documentation now explain the Republic of OpenClaws narrative, the research thesis, the contributor map, and responsible launch language.         |
| **Canonical quick start**     | New users can follow one command flow: `pnpm install`, `pnpm build`, `pnpm ui:build`, `pnpm dev onboard`, and `pnpm dev gateway run`.                                |
| **Production gateway path**   | Production-style startup documentation now points to `pnpm start gateway run` after build and onboarding are complete.                                               |
| **Gateway-served control UI** | Web control UI documentation now emphasizes building the UI and serving it through the gateway rather than relying on the retired standalone UI development command. |
| **Launch materials**          | A ready-to-post launch copy bank has been added for X/Twitter, Hacker News, Reddit, LinkedIn, Discord, Slack, direct outreach, meme captions, and reply handling.    |
| **Social preview asset**      | The repository includes a 1280×640 `docs/assets/hoc-republic-social-preview.png` image suitable for GitHub social sharing and launch posts.                          |

## Responsible framing

HoC-Republic uses the vivid question, **“what if an AI agent could give birth to the next specialized agent it needs?”**, as a metaphor for a grounded engineering loop: a parent agent identifies a missing capability, routes work to a specialized OpenClaw or helper, evaluates the result, and preserves useful work as a workflow, tool, memory, or process. This release does **not** claim finished AGI or autonomous safety. It is an inspectable research artifact for reproduction, critique, benchmark design, and safety hardening.

## Quick start

```bash
git clone https://github.com/hunix/HoC-Republic.git
cd HoC-Republic
pnpm install
pnpm build
pnpm ui:build
pnpm dev onboard
pnpm dev gateway run
```

For production-style gateway execution after onboarding and build, use:

```bash
pnpm start gateway run
```

## Call for contributors

This release is especially seeking help with minimal reproducible recursive-agent demos, benchmark harnesses, safety review, architecture diagrams, issue triage, documentation improvements, gateway setup verification, and examples that make the OpenClaw delegation loop measurable.
