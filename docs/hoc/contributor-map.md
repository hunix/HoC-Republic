---
title: "Contributor Map"
summary: "How to contribute to HoC without first understanding the entire monorepo."
read_when:
  - Joining the project as a new contributor
  - Creating good-first issues for the public launch
  - Choosing safe work areas by skill level
---

# Contributor Map

HoC is large enough that new contributors need a map, not just a file tree. This page organizes contribution areas by **risk, skill set, and public-launch value** so people can help without accidentally touching sensitive automation, generated artifacts, or unstable research code.

The most valuable early contributions are not sweeping rewrites. They are reproducibility improvements, small examples, safety hardening, failing tests, clearer docs, and subsystem diagrams.

## Contribution principles

| Principle | Meaning |
| --- | --- |
| **Prefer reproducibility over spectacle** | A small demo that works on a clean clone is more valuable than an impressive claim that cannot be repeated. |
| **Keep autonomy bounded** | Any contribution involving shell execution, generated code, external posting, credentials, or infrastructure should preserve explicit human review gates. |
| **Document what changed** | New features should include setup notes, examples, limitations, and test commands. |
| **Make risk visible** | Experimental modules should say what is proven, what is simulated, and what still needs validation. |
| **Reduce cognitive load** | Diagrams, short examples, and focused guides are first-class contributions. |

## Good first issues

| Area | Example contribution | Skill level | Risk |
| --- | --- | --- | --- |
| **Documentation cleanup** | Fix broken links, remove stale commands, add missing prerequisites, improve screenshots. | Beginner | Low |
| **Examples** | Add a minimal gateway example, local-only agent example, or plugin skeleton. | Beginner to intermediate | Low |
| **Tests** | Add a regression test for a small utility, parser, route, or config function. | Intermediate | Low |
| **Docs diagrams** | Create architecture diagrams for gateway routing, agent sessions, or Republic tick flow. | Beginner to intermediate | Low |
| **Security docs** | Clarify allowlists, approvals, local-only defaults, and secret handling. | Intermediate | Medium |
| **Provider docs** | Add setup notes for model providers without embedding secrets. | Beginner to intermediate | Low |
| **UI polish** | Improve empty states, error messages, loading states, and accessibility. | Intermediate | Medium |
| **Release hygiene** | Remove tracked generated files, improve `.gitignore`, document artifact policy. | Intermediate | Medium |

## Areas by subsystem

| Subsystem | What to know first | Useful contribution types |
| --- | --- | --- |
| **Gateway** | The gateway owns sessions, routing, APIs, channels, auth, and operator-facing controls. | Tests, docs, config examples, diagnostics, safe defaults. |
| **Channels** | Messaging integrations vary widely by provider and may require credentials or paired devices. | Setup docs, mock tests, rate-limit handling, message-format normalization. |
| **Agent runtime** | Agents interact with tools, memory, providers, sessions, and subagents. | Deterministic examples, tool-policy tests, memory docs, model fallback tests. |
| **Republic** | Republic modules are research-oriented and should be treated as experiments. | Scenario tests, reproducibility notes, diagrams, benchmark ideas, documentation. |
| **Plugin SDK** | Plugins should have clear manifests, capability boundaries, and validation. | Example plugins, schema docs, safer defaults, lifecycle tests. |
| **Native apps** | Platform builds require OS-specific toolchains and signing assumptions. | UI docs, build instructions, simulator notes, issue triage. |
| **Security and ops** | HoC can touch files, shells, channels, devices, and infrastructure. | Threat models, hardening checklists, redaction, scanning, least-privilege defaults. |

## Recommended issue labels

A public launch should include labels that make contributor intent obvious.

| Label | Use |
| --- | --- |
| `good first issue` | Small, well-scoped tasks with clear acceptance criteria. |
| `docs` | Documentation, diagrams, examples, and screenshots. |
| `security` | Hardening, secret handling, sandboxing, approvals, or disclosure policy. |
| `reproducibility` | Clean-clone setup, deterministic demos, fixtures, and benchmark harnesses. |
| `gateway` | Gateway APIs, sessions, routing, auth, health, or operations. |
| `agents` | Runtime, prompts, subagents, tools, memory, or model providers. |
| `republic` | Digital-civilization simulation, governance, economy, cognition, or tick orchestration. |
| `plugins` | Plugin SDK, plugin manifests, extension loading, or examples. |
| `ui` | Web UI, terminal UI, mobile, desktop, or browser extension surfaces. |
| `needs design` | Requires architectural discussion before implementation. |

## Pull request checklist

Before opening a pull request, contributors should answer these questions in the PR description.

| Question | Expected answer |
| --- | --- |
| What problem does this solve? | Link an issue or describe the reproducible failure. |
| What changed? | Summarize files and behavior, not just implementation details. |
| How was it tested? | Include commands, screenshots, logs, or reasons testing was not possible. |
| Does this touch secrets, execution, channels, or infrastructure? | If yes, describe the safety boundary and approval model. |
| Does this change docs or examples? | If behavior changed, documentation should usually change too. |

## Maintainer triage model

The first public wave should route issues aggressively so attention does not diffuse.

| Issue type | Maintainer response |
| --- | --- |
| **Bug with reproduction** | Confirm environment, label subsystem, request logs only after redaction, and link related docs. |
| **Feature request** | Ask for use case, risk level, and whether it belongs in gateway, runtime, plugin, or Republic. |
| **Research proposal** | Convert to a design discussion or experiment plan with falsifiable success criteria. |
| **Security report** | Move to private disclosure per `SECURITY.md`; do not debate exploit details publicly. |
| **Launch hype or vague idea** | Thank the poster, ask for a concrete demo, benchmark, issue, or documentation improvement. |

## High-value launch tasks

| Priority | Task | Why it matters |
| --- | --- | --- |
| **P0** | Remove generated artifacts and unsafe environment files before public release. | Prevents accidental leakage and makes the repository look professional. |
| **P0** | Add a minimal recursive-agent demo. | Converts the launch thesis into something people can run and share. |
| **P1** | Create architecture diagrams for gateway, runtime, Republic, and plugin SDK. | Helps newcomers understand the system quickly. |
| **P1** | Open 10 to 20 good-first issues with precise acceptance criteria. | Converts attention into contributions. |
| **P1** | Add benchmark skeletons for Tool Forge and Model Council. | Makes research claims measurable. |
| **P2** | Add example videos or GIFs for the README and docs. | Improves social sharing and developer comprehension. |

## Contribution tone

HoC should welcome ambitious research while preserving engineering discipline. The public community should be encouraged to challenge claims, reproduce demos, propose safer designs, and contribute narrow improvements. A healthy HoC contribution is one that makes the system **more understandable, more reproducible, safer, or more useful**.
