## Goal

Create the smallest reproducible HoC-Republic demo that shows an AI-citizen family or digital-genome child-agent flow without overstating the result.

The ideal outcome is a clean, documented scenario that a new contributor can run from a fresh checkout and inspect in source, logs, traces, or generated artifacts.

## Proposed demo scope

| Demo element | Minimum evidence |
| --- | --- |
| **Parent citizens** | A fixture, command, or trace showing the parent citizen records and relevant traits. |
| **Relationship or family context** | A source-backed step showing how the relationship or family state is represented. |
| **Digital-genome inheritance** | A trace showing crossover, mutation, inherited specialization, or trait propagation. |
| **Resource or fitness gate** | Evidence that the birth or child-agent creation flow checks constraints instead of spawning arbitrarily. |
| **Child agent output** | A generated child profile, specialization, task result, or artifact metadata. |

## Suggested source paths to inspect

```text
src/republic/genetics.ts
src/republic/evolution.ts
src/republic/social-life.ts
src/republic/memory.ts
src/republic/
```

## Acceptance criteria

A first version is good enough if it includes a deterministic command or script, one documented fixture, expected output, and a short explanation of what the demo proves and what it does not prove.

## Safety notes

The demo should not require secrets, external posting, private accounts, or unsupervised shell execution. If model calls, generated code, media generation, or external APIs are needed, they should be optional and clearly approval-gated.
