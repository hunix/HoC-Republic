# Contributing to HoC-Republic

Thank you for helping improve **HoC-Republic**, the open-source home of Hani’s OpenClaws and the Republic of OpenClaws experiment. This repository explores recursive AI-agent orchestration, local-first agent infrastructure, and digital-civilization simulation where AI citizens can work, remember, govern, form families, and create specialized child agents under human-defined constraints.

The project welcomes practical engineering, reproducible research, documentation, safety review, demos, and thoughtful critique. Because HoC-Republic is both a large TypeScript/Node.js monorepo and a research-grade simulation, the best contributions are focused, reproducible, and explicit about safety boundaries.

## Quick links

| Resource | Link |
| --- | --- |
| Repository | <https://github.com/hunix/HoC-Republic> |
| Issues | <https://github.com/hunix/HoC-Republic/issues> |
| Discussions | <https://github.com/hunix/HoC-Republic/discussions> |
| Launch materials | [`docs/hoc/launch-materials.md`](docs/hoc/launch-materials.md) |
| Outreach command center | [`docs/hoc/outreach/index.md`](docs/hoc/outreach/index.md) |
| Research thesis | [`docs/hoc/research-thesis.md`](docs/hoc/research-thesis.md) |
| Security policy | [`SECURITY.md`](SECURITY.md) |
| Code of conduct | [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |

## What kinds of contributions help most

HoC-Republic is intentionally broad. To keep review healthy, choose one narrow improvement and explain how reviewers can verify it.

| Contribution path | Good first artifact | Best place to start |
| --- | --- | --- |
| **Bug fixes** | A small pull request with reproduction steps and a test or command output. | Open a bug issue or submit a focused PR. |
| **Developer experience** | Clearer setup docs, better error messages, faster checks, or simplified onboarding. | Open an issue if the change touches architecture. |
| **Republic simulation** | A reproducible citizen scenario, governance mechanic, memory experiment, or lineage demo. | Open a research proposal or demo issue first. |
| **Benchmarks and evaluation** | A smoke test, trace, metric, or small deterministic scenario. | Use the research proposal template. |
| **Docs and tutorials** | Quick-start fixes, diagrams, source-backed explanations, or examples that reduce confusion. | Submit a docs PR directly. |
| **Safety and security** | Approval-boundary review, secret-handling improvements, sandbox hardening, or threat modeling. | Follow `SECURITY.md` for vulnerabilities. |
| **Launch and outreach** | Demo recordings, screenshots, community-specific copy, or ethical distribution suggestions. | Use discussions or an outreach issue. |

## Canonical local workflow

Use the same command flow that appears in the README so contributors test the public path that new users will follow.

```bash
git clone https://github.com/hunix/HoC-Republic.git
cd HoC-Republic
pnpm install
pnpm build
pnpm ui:build
pnpm dev onboard
pnpm dev gateway run
```

After onboarding and gateway startup, open the local control surface at `http://localhost:18789`, unless you configured another gateway port. For production-style operation, use the start command instead.

```bash
pnpm start gateway run
```

## Before opening a pull request

A high-quality pull request should be small enough to review and concrete enough to reproduce. Please include the commands you ran, the expected result, and any logs or screenshots that make the change easier to evaluate.

```bash
pnpm format
pnpm build
pnpm ui:build
pnpm test
```

If a command is not relevant or cannot be run locally, say so in the pull request and explain why. Do not commit generated logs, secrets, private credentials, local machine state, or large binary artifacts.

## Republic research and demo contributions

The Republic simulation includes experimental modules for citizen memory, autonomy, civic institutions, social life, genome inheritance, and evolution. Contributions in this area should be especially reproducible because social-simulation claims are easy to overstate.

| Research area | Representative source paths | What useful evidence looks like |
| --- | --- | --- |
| **Six-layer memory** | `src/republic/memory.ts`, `src/republic/memory/` | A deterministic scenario showing episodic, semantic, procedural, working, social, or collective memory use. |
| **Digital-genome birth flow** | `src/republic/genetics.ts`, `src/republic/evolution.ts` | Parent genomes, crossover/mutation behavior, resource checks, fitness outputs, and child specialization evidence. |
| **Marriage and family lineage** | `src/republic/social-life.ts` | A trace or fixture showing relationship formation, family state, and lineage persistence. |
| **Governance and rights** | `src/republic/constitution.ts`, `src/republic/` | A runnable civic process such as an election, proposal, court-like review, or constitutional rule check. |
| **Autonomous production** | `src/republic/citizen-autonomy.ts`, `src/republic/` | A citizen activity trace showing generated code, research, art, audio, music, or other work artifact metadata. |

When proposing a new Republic experiment, include the research question, smallest runnable scenario, expected evidence, and safety boundary. If the experiment involves generated code, shell execution, credentials, external posting, messaging systems, or long-running infrastructure, clearly state what must remain approval-gated.

## AI-assisted contributions

AI-assisted pull requests are welcome. Please be transparent so reviewers can focus their attention effectively. In your pull request, state whether AI tools were used, how much of the change they influenced, what you personally verified, and whether any generated code was reviewed for security, licensing, and correctness.

## Community and outreach contributions

HoC-Republic’s strongest public hook is technically accurate but easy to sensationalize: AI citizens can form families and produce child agents with inherited digital-genome traits. Use that hook responsibly. Posts, demos, and outreach should invite feedback, explain what is implemented, avoid unverifiable claims, and never ask communities for artificial votes or engagement.

External posts to Hacker News, Reddit, Product Hunt, Discord, X/Twitter, newsletters, or other third-party communities should be treated as **approval-gated** unless they are posted from your own account and follow the target community’s rules. Prefer comments that help readers run the project, inspect the source, or file useful issues.

## Review expectations

Reviewers may ask you to narrow a change, add evidence, document safety boundaries, or move a broad proposal into a discussion first. That is normal for a research monorepo. The goal is not to slow down contribution; it is to keep the public implementation inspectable, reproducible, and safe to extend.

## Maintainer note

This repository is an active public export of a large system. If you find stale OpenClaw references, outdated command flows, broken docs links, or confusing launch material, those are valuable issues to report and excellent first documentation fixes.
