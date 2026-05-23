---
title: "HoC-Republic Wiki Home"
summary: "A public-facing map of HoC-Republic, the Republic of OpenClaws research platform, documentation, and contribution areas."
read_when:
  - Orienting new contributors to HoC
  - Preparing the repository for public launch
  - Explaining the research scope behind Hani’s OpenClaws and the Republic of OpenClaws
---

# HoC-Republic Wiki Home

**HoC-Republic** is the public home of **HoC**, short for **Hani’s OpenClaws**. It is a research-oriented monorepo for recursive AI-agent orchestration and a **Republic of OpenClaws**: a self-hosted system where AI agents can coordinate, work, remember, govern, sustain themselves, evolve, and reproduce smarter specialized agents under human-defined constraints.

This page is the recommended **wiki table of contents** for the public repository. The repository's GitHub Wiki feature is currently disabled, so these pages live inside the documentation tree first. When the repository is made public and the Wiki is enabled, this page can be copied almost directly to `Home.md` in the GitHub Wiki.

> **Project framing:** HoC-Republic is best introduced as the Republic of OpenClaws: an open implementation of recursive agent orchestration where agents can use tools, delegate work, preserve learned workflows, and create more specialized OpenClaws under human-defined constraints.

## Start here

| Audience        | First page                                                           | Why it matters                                                                                        |
| --------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Researchers** | [Research thesis](./research-thesis)                                 | Explains the main hypothesis, novelty, subsystem boundaries, and reproducibility goals.               |
| **Developers**  | [Contributor map](./contributor-map)                                 | Shows where to contribute safely without first understanding the whole monorepo.                      |
| **Maintainers** | [Public release checklist](./public-release-checklist)               | Lists the hygiene, security, metadata, and launch tasks required before making the repository public. |
| **Operators**   | [Gateway security](/gateway/security)                                | Covers auth, local exposure, hardening, and safe deployment assumptions.                              |
| **New users**   | [Getting started](/start/getting-started) and the command flow below | Gives the fastest path to a working OpenClaw gateway.                                                 |

## Fastest local path

New users should start from a clean checkout and run the commands below in order. This flow installs dependencies, builds the TypeScript packages, builds the web control UI, completes OpenClaw onboarding, and starts the gateway in development mode.

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

## System map

HoC-Republic is easiest to understand as seven cooperating layers rather than one application.

| Layer                     | Purpose                                                                                                                            | Primary docs                         | Primary code                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| **OpenClaw gateway**      | Runs sessions, auth, routing, channels, APIs, cron, approvals, and node discovery.                                                 | [Gateway docs](/gateway)             | [`src/gateway`](../../src/gateway)                                             |
| **Agent runtime**         | Coordinates models, tools, sessions, memory, subagents, prompts, and local execution boundaries.                                   | [Agent concepts](/concepts/agent)    | [`src/agents`](../../src/agents)                                               |
| **Messaging channels**    | Connects agents to WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Matrix, LINE, and related surfaces.                       | [Channels](/channels)                | [`src/channels`](../../src/channels)                                           |
| **Republic simulation**   | Experiments with digital-civilization modules such as governance, economy, memory, cognition, tool creation, and self-improvement. | [Research thesis](./research-thesis) | [`src/republic`](../../src/republic)                                           |
| **Plugin SDK**            | Provides extension points for tools, channels, models, media workflows, and automation backends.                                   | [Plugin docs](/tools/plugin)         | [`src/plugin-sdk`](../../src/plugin-sdk)                                       |
| **Native surfaces**       | Adds macOS, iOS, Android, Windows, browser, web, and terminal interfaces.                                                          | [Platforms](/platforms)              | [`apps`](../../apps), [`ui`](../../ui), [`hoc-ui`](../../hoc-ui)               |
| **Operations and safety** | Defines release, security, testing, deployment, update, and contribution workflows.                                                | [Security](/gateway/security)        | [`SECURITY.md`](../../SECURITY.md), [`CONTRIBUTING.md`](../../CONTRIBUTING.md) |

## Wiki page set

The public wiki should stay short, memorable, and action-oriented. GitHub recommends a repository landing page, a license, contribution guidance, and healthy community documentation for public projects.[^1] The best HoC-Republic wiki is therefore not a copy of every documentation page; it is a **curated orientation layer** that routes readers to the right deeper docs.

| Wiki page                    | Purpose                                                                                                                                                                                   | Status                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Home**                     | One-page overview and navigation map.                                                                                                                                                     | This page.                                                                                                         |
| **Research Thesis**          | Explains the recursive-agent idea and what is novel.                                                                                                                                      | [Created](./research-thesis).                                                                                      |
| **Launch Strategy**          | Turns the research narrative into an ethical, high-velocity launch plan.                                                                                                                  | [Created](./launch-strategy).                                                                                      |
| **Launch Materials**         | Provides ready-to-post X/Twitter, Hacker News, Reddit, LinkedIn, Discord, Slack, and outreach copy.                                                                                       | [Created](./launch-materials).                                                                                     |
| **Outreach Command Center**  | Coordinates meme-native social spread, target communities, platform copy, launch calendar, and reply handling around AI-citizen marriage, families, digital genomes, and birth mechanics. | [Created](./outreach).                                                                                             |
| **Architecture**             | Explains gateway, runtime, Republic, plugin, and native app boundaries.                                                                                                                   | Existing material in [Architecture](/concepts/architecture) and [`docs/hoc-architecture.md`](../hoc-architecture). |
| **Quick Start**              | Shows the shortest path to running the gateway.                                                                                                                                           | Existing material in [Getting started](/start/getting-started).                                                    |
| **Safety Model**             | Explains approvals, sandboxing, secrets, and bounded autonomy.                                                                                                                            | Existing material in [Gateway security](/gateway/security).                                                        |
| **Contributor Map**          | Gives good-first work areas by skill level.                                                                                                                                               | [Created](./contributor-map).                                                                                      |
| **Public Release Checklist** | Tracks open-source readiness before switching visibility.                                                                                                                                 | [Created](./public-release-checklist).                                                                             |
| **Roadmap**                  | Turns the research agenda into milestones.                                                                                                                                                | Seeded by [Research thesis](./research-thesis).                                                                    |

## Public positioning

HoC-Republic should be positioned with confident but falsifiable language. The strongest public wording is not that the system has already solved autonomy, but that it makes a previously abstract research direction inspectable and hackable through a memorable civic metaphor: a Republic where OpenClaw agents can live, coordinate, evolve, and reproduce specialized descendants.

| Avoid                                          | Prefer                                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The first AI that gives birth to smarter AI." | "A Republic of OpenClaws: an open implementation of recursive agent orchestration where agents can create specialized subagents and preserve learned improvements."    |
| "Fully autonomous AI civilization."            | "A research platform for persistent digital-civilization simulations, multi-agent governance experiments, and bounded recursive agent creation."                       |
| "Production AGI platform."                     | "A self-hosted research monorepo combining mature gateway components with experimental agent-society modules."                                                         |
| "No other project can do this."                | "The novelty is the integration boundary: gateway, channels, tools, memory, subagents, simulation, native surfaces, and self-improvement in one inspectable codebase." |

## Outreach operators

Launch operators should use the [Outreach Command Center](./outreach) after reviewing the [Launch Materials](./launch-materials). The command center turns the strongest meme hook—AI citizens marrying, forming families, inheriting digital genomes, and giving birth to child agents—into platform-native copy, community targeting, reply handling, and a seven-day launch sequence while preserving careful safety boundaries.

## Maintainer next actions

Before the repository is made public, maintainers should complete the public-release checklist, remove tracked local artifacts, verify no credentials are present, enable repository security features, and decide whether GitHub Wiki should be enabled. GitHub's public-repository guidance specifically emphasizes discoverability metadata, community-health files, and security features such as Dependabot alerts and secret scanning.[^1] [^2]

## References

[^1]: GitHub Docs, [Best practices for repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories).

[^2]: GitHub Docs, [About community profiles for public repositories](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories).
