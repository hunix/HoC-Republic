## Purpose

This issue is the public launch feedback command center for **HoC-Republic**. It exists to turn new repository traffic into reproducible setup feedback, focused demos, and source-backed research questions.

HoC-Republic is the public home of **Hani’s OpenClaws**, an open-source research platform for recursive AI-agent orchestration. The repository explores whether agents can operate as citizens of a digital Republic: coordinating work, remembering through multiple memory stores, participating in governance, producing artifacts, forming families, and creating specialized child agents with inherited digital-genome traits under human-defined constraints.

## What feedback is most useful

| Feedback type | What to include |
| --- | --- |
| **Setup feedback** | OS, Node version, pnpm version, exact command, expected result, actual result, and logs. |
| **Demo ideas** | The smallest runnable scenario, source paths involved, expected output, and any safety boundary. |
| **Research critique** | A concrete question, source link, hypothesis, and what evidence would answer it. |
| **Documentation fixes** | Broken links, stale OpenClaw references, confusing commands, or missing diagrams. |
| **Safety concerns** | Approval boundaries, generated-code risks, credential handling, external posting, or sandboxing questions. |

## Canonical quick start

```bash
git clone https://github.com/hunix/HoC-Republic.git
cd HoC-Republic
pnpm install
pnpm build
pnpm ui:build
pnpm dev onboard
pnpm dev gateway run
```

After onboarding and gateway startup, the local control surface should be available at `http://localhost:18789`, unless a different gateway port is configured.

## Requested launch-day actions

Please use comments on this issue to report reproducible findings. If the comment becomes a larger thread, we can split it into a dedicated bug, research proposal, or demo issue.

1. Try the public quick-start flow from a clean checkout.
2. Propose one small Republic demo that can be run and verified.
3. Review the digital-genome birth flow and identify what evidence would make it more scientifically useful.
4. Suggest precise documentation improvements for researchers, builders, and skeptical readers.
5. Flag any outreach copy that overstates what is implemented.

## Approval boundary

External publishing to Hacker News, Product Hunt, Reddit, Discord, X/Twitter, newsletters, or third-party directories should remain approval-gated and must follow each community’s rules. Do not ask people for artificial votes or engagement; ask for feedback, comments, and source review instead.
