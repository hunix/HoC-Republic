---
title: "Public Release Checklist"
summary: "A maintainer checklist for making HoC public safely and effectively."
read_when:
  - Preparing to make the repository public
  - Auditing secrets, generated artifacts, and community-health files
  - Planning a public launch on GitHub
---

# Public Release Checklist

HoC should not be made public by only flipping repository visibility. The repository is a large monorepo with generated artifacts, logs, local environment files, deployment configuration, and experimental agent systems. A public release should therefore be handled as a **security, documentation, and messaging release**.

GitHub's public-repository guidance recommends clear repository metadata, community-health files, and repository security features such as Dependabot alerts, secret scanning, push protection, and code scanning.[^1] [^2] HoC should meet that bar before launch.

## Current known status

| Area                      | Status                                           | Required action                                                                                                                                                       |
| ------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository visibility** | Private                                          | Keep private until this checklist is complete and the owner confirms the visibility change.                                                                           |
| **GitHub Wiki**           | Disabled                                         | Either enable Wiki after launch or keep the curated wiki under `docs/hoc`.                                                                                            |
| **README**                | Rewritten for launch                             | Review wording, claims, screenshots, and links before publication.                                                                                                    |
| **License**               | MIT license present                              | Verify copyright ownership and third-party license compatibility.                                                                                                     |
| **Contributing guide**    | Present                                          | Review maintainer names, expectations, test commands, and AI-assisted PR policy.                                                                                      |
| **Security policy**       | Present                                          | Confirm reporting address, supported versions, and threat model.                                                                                                      |
| **Code of conduct**       | Present                                          | Review `CODE_OF_CONDUCT.md` for maintainer preference before public community launch.                                                                                 |
| **Generated artifacts**   | Current branch cleanup staged                    | Logs, crash dumps, scratch outputs, lint-result files, and temporary video-generation stubs were removed from the current tree; keep history risk separate.           |
| **Environment files**     | Templates sanitized                              | Remaining tracked environment files are intended examples/templates and should be reviewed one final time before launch.                                              |
| **Secrets audit**         | Current-tree scan complete; history risk remains | Exact key-pattern matches reviewed in the current tree appear to be test fixtures, but Git history still contains high-risk path changes and needs a launch strategy. |

## Blockers before changing visibility

The following items should be treated as launch blockers.

| Blocker                                   | Why it matters                                                                                               | How to resolve                                                                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tracked credentials or tokens**         | Public Git history is hard to fully erase once exposed.                                                      | Run `detect-secrets`, GitHub secret scanning, and manual review of `.env*`, config, logs, and deployment files. Rotate anything suspicious.                                                                                                  |
| **Machine-specific logs and crash dumps** | Logs can expose paths, hostnames, tokens, prompts, user data, or private infrastructure.                     | Remove files such as `*.log`, `*_out.txt`, crash reports, generated diagnostics, temporary dumps, and session traces unless intentionally sanitized. Current-tree cleanup is staged, but historical copies still require a history strategy. |
| **Private deployment config**             | Cloud config can reveal app names, regions, private URLs, or credentials.                                    | Convert sensitive deployment files to examples, move secrets to secret managers, and document required variables.                                                                                                                            |
| **Unsafe default execution**              | HoC includes powerful tool and OS-control concepts.                                                          | Make approvals, allowlists, and local-only defaults obvious in the README and docs.                                                                                                                                                          |
| **Public Git history exposure**           | Making the existing private repository public exposes historical commits, not only the cleaned current tree. | Prefer a fresh public repository/clean export or complete history rewrite and branch pruning before changing visibility.                                                                                                                     |
| **Unsupported claims**                    | Viral claims can attract attention but damage credibility if not precise.                                    | Use falsifiable language: "recursive agent orchestration research platform" rather than "finished AGI."                                                                                                                                      |

## Repository cleanup checklist

| Task                           | Command or review path                                                                        | Done                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --- |
| List tracked environment files | `git ls-files '.env*' '*env*'`                                                                |                                                                                  |
| List tracked logs and dumps    | `git ls-files '*.log' '*.txt' 'hs_err_*' '*results*' '*out*'`                                 |                                                                                  |
| List large tracked binaries    | `git ls-files -s                                                                              | sort -k4`and`git lfs ls-files` if LFS is used                                    |     |
| Review deployment files        | `fly.toml`, `render.yaml`, Docker Compose files, service configs                              |                                                                                  |
| Review local state files       | Files containing `session`, `state`, `save`, `process`, `recent`, or machine-specific outputs |                                                                                  |
| Confirm `.gitignore` coverage  | Logs, crash dumps, generated bundles, local env files, and build outputs                      |                                                                                  |
| Remove or sanitize artifacts   | `git rm --cached <file>` for untracking, then commit cleanup                                  |                                                                                  |
| Re-run secret scan             | `detect-secrets scan --all-files` or equivalent                                               | Current-tree custom scan complete; exact high-risk matches reviewed as fixtures. |
| Choose Git-history strategy    | Fresh public export, history rewrite, or owner-approved direct visibility change              | Required before public release.                                                  |
| Rotate exposed secrets         | Provider dashboards, cloud accounts, GitHub tokens, webhooks, app credentials                 | Required for anything uncertain or historically exposed.                         |

## GitHub settings checklist

| Setting               | Recommended value                                                                                                                                         | Notes                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Description**       | `Recursive AI-agent orchestration research platform: OpenClaw gateway, subagents, plugins, and digital-civilization simulation.`                          | Short, searchable, and credible.                                                        |
| **Homepage**          | Docs site or project landing page                                                                                                                         | Use once available.                                                                     |
| **Topics**            | `ai-agents`, `multi-agent`, `agentic-ai`, `llm`, `typescript`, `nodejs`, `self-hosted`, `open-source`, `simulation`, `automation`, `openclaw`, `research` | GitHub topics improve repository discovery.                                             |
| **Features**          | Issues, Discussions, Projects, Wiki optional                                                                                                              | Enable Discussions for launch questions; Wiki optional if `docs/hoc` remains canonical. |
| **Security**          | Enable secret scanning, push protection, Dependabot alerts, Dependabot security updates, and code scanning                                                | GitHub recommends security features for public repositories.[^1]                        |
| **Branch protection** | Protect default branch after launch                                                                                                                       | Require PR review and status checks once CI is stable.                                  |
| **Community profile** | README, LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue templates                                                                                 | GitHub surfaces this in the repository community profile.[^2]                           |

## Documentation checklist

| Page                | Status                                      | Launch standard                                                                               |
| ------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **README**          | Rewritten                                   | Must explain the project in under one minute, with quick start, safety posture, and docs map. |
| **Wiki Home**       | Created under `docs/hoc/wiki-home.md`       | Should be copied to GitHub Wiki if Wiki is enabled.                                           |
| **Research Thesis** | Created under `docs/hoc/research-thesis.md` | Must use precise language and avoid unsupported AGI claims.                                   |
| **Contributor Map** | Created under `docs/hoc/contributor-map.md` | Should route contributors by skill and risk level.                                            |
| **Quick Start**     | Existing docs                               | Verify commands work from a clean clone.                                                      |
| **Security**        | Existing docs and policy                    | Make approvals, local exposure, and secrets handling highly visible.                          |
| **Examples**        | Needed                                      | Add a minimal recursive-agent demo before major launch if possible.                           |

## Launch decision gate

The repository should only be made public when all four conditions are true.

| Gate                    | Passing condition                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Security**            | Secret scan reviewed, sensitive files removed or sanitized, risky credentials rotated, and Git-history exposure strategy chosen. |
| **Reproducibility**     | Clean clone can install, build or run the documented demo, and fail gracefully when optional credentials are missing.            |
| **Comprehension**       | README, wiki home, research thesis, and contributor map explain the project without requiring private context.                   |
| **Community readiness** | Issues, discussions, contribution policy, code of conduct, and maintainer response expectations are set.                         |

## Recommended visibility-change sequence

1. Complete cleanup and commit all documentation changes.
2. Push to the private repository branch.
3. Decide whether to launch from a clean public export, a rewritten-history repository, or the existing repository with owner-approved risk acceptance.
4. Enable repository security features while private if available.
5. Add repository topics and description.
6. Enable Discussions and optionally Wiki.
7. Ask the owner for final approval to make the repository public.
8. Change visibility to public or publish the clean export.
9. Immediately create a pinned launch issue or discussion that explains the roadmap and asks for specific contributions.
10. Publish the coordinated launch posts from the launch strategy document.

## References

[^1]: GitHub Docs, [Best practices for repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories).

[^2]: GitHub Docs, [About community profiles for public repositories](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories).
