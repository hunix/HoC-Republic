---
title: "HoC-Republic Live Community Requirements"
summary: "Confirmed current submission rules and etiquette for approval-gated HoC-Republic outreach destinations."
---

# HoC-Republic Live Community Requirements

This file records externally verified rules and submission constraints for high-value outreach destinations. It is intended to prevent spam, preserve community fit, and keep approval-gated posts platform-native.

## Hacker News / Show HN

Source: [Show HN Guidelines](https://news.ycombinator.com/showhn.html), visited 2026-05-23.

The Show HN page states that Show HN is for something the maker has built and that other people can try. It explicitly says that eligible items are things people can run on their computers or physically handle, while blog posts, sign-up pages, newsletters, lists, landing pages, and fundraisers are off topic. It requires the project to be non-trivial, personally worked on, ready for users to try, and easy to try without signups or emails. It also says the submitted story title should begin with `Show HN`, and it warns not to ask friends to upvote or comment.

**Implication for HoC-Republic:** Submit the GitHub repository or release URL, not a blog post. The title should begin with `Show HN:` and focus on the runnable open-source system. The first comment should explain the personal motivation and invite technical feedback rather than ask for votes.

## Pending sources to verify

| Destination | URL | Status |
| --- | --- | --- |
| Product Hunt | https://www.producthunt.com/ | Pending requirement review. |
| Jenqyang/Awesome-AI-Agents | https://github.com/Jenqyang/Awesome-AI-Agents | Pending contribution review. |
| ashishpatel26/500-AI-Agents-Projects | https://github.com/ashishpatel26/500-AI-Agents-Projects | Pending contribution review. |
| Shubhamsaboo/awesome-llm-apps | https://github.com/Shubhamsaboo/awesome-llm-apps | Pending contribution review. |
| Arindam200/awesome-ai-apps | https://github.com/Arindam200/awesome-ai-apps | Pending contribution review. |
| OpenClaw Showcase | https://openclaw.ai/showcase | Pending submission-path review. |
| Google ADK community showcase | To be confirmed | Pending submission-path review. |
| Arize Phoenix Community Showcase | https://arize.com/phoenix-community-showcase/ | Pending submission-path review. |

## References

[1]: https://news.ycombinator.com/showhn.html "Show HN Guidelines"

## Jenqyang/Awesome-AI-Agents

Source: [Jenqyang/Awesome-AI-Agents](https://github.com/Jenqyang/Awesome-AI-Agents) and its `CONTRIBUTING.md`, visited 2026-05-23.

The repository explicitly curates high-quality AI-agent resources and includes a dedicated **Agent Society Simulation** category. Its contribution guide prefers direct pull requests, one entry per PR, minimal focused changes, neutral one-line descriptions, open-source substance, clear README/install usage, and evidence over marketing. The required entry format is a Markdown list item with a GitHub stars badge.

**Implication for HoC-Republic:** This is one of the best-fit awesome-list targets because HoC-Republic is an open-source, runnable multi-agent society/civilization simulator. The safest target section is `Agent Society Simulation`; a secondary fallback is `Multi-Agent Task Solver Projects`. The PR description should avoid meme language and focus on open-source runnable value, social simulation, governance, memory, and agent lineage.

### Candidate entry

```md
- [HoC-Republic](https://github.com/hunix/HoC-Republic) - Open-source recursive AI-agent civilization simulator with autonomous citizens, governance, memory, family lineage, and genome-based birth mechanics. ![GitHub Repo stars](https://img.shields.io/github/stars/hunix/HoC-Republic?style=social)
```


## ashishpatel26/500-AI-Agents-Projects

Source: [ashishpatel26/500-AI-Agents-Projects](https://github.com/ashishpatel26/500-AI-Agents-Projects) and `CONTRIBUTION.md`, visited 2026-05-23.

The repository is a large curated catalog of AI-agent projects, templates, demos, and integrations. The contribution guide emphasizes reproducibility, model/data hygiene, evaluation, safety, and small runnable well-documented examples. It accepts new single-agent or multi-agent projects, integrations, simulators, observability tools, benchmarks, documentation, experiments, and visualization utilities. Larger contributions should begin with an issue for placement and naming. The guide’s folder requirements are heavier than a simple awesome-list entry: a project folder should include a README, license reference, pinned dependencies, runnable examples, tests or smoke-test instructions, and metadata.

**Implication for HoC-Republic:** This is a high-reach but higher-friction target. Because HoC-Republic is an existing full repository rather than a small example folder, the ethical path is to first open an issue asking maintainers whether they prefer a catalog table/link entry or a compact reproducible example folder that links to the upstream repository. A direct PR should not be opened until placement is clarified.

### Candidate coordination issue title

`Proposal: add HoC-Republic as a runnable multi-agent civilization simulation project`

### Candidate coordination issue summary

HoC-Republic is an MIT-licensed, open-source TypeScript/Node.js project for recursive AI-agent orchestration and digital-civilization simulation. It includes runnable local commands, autonomous citizens, governance/elections/constitution, family and lineage mechanics, six-layer memory, and genome-based child-agent birth. I would like to add it in the format that best fits this catalog: either a concise catalog entry linking to the upstream repository or a small reproducible example folder with metadata, smoke-test instructions, and a link to the full project.


## Product Hunt

Sources: [Product Hunt Launch Guide](https://www.producthunt.com/launch), [Preparing for launch](https://www.producthunt.com/launch/preparing-for-launch), and [How Product Hunt works](https://www.producthunt.com/launch/how-product-hunt-works), visited 2026-05-23.

Product Hunt says launches should be products that are new or substantively updated, usable, trustworthy, high-quality, interesting to the community, and not spammy. It explicitly says company accounts are prohibited and that posts are made from free personal accounts. The official launch-preparation guide says the submission flow starts after login, can be scheduled up to one month ahead, and includes URL, product name, tagline with a 60-character maximum, optional links, optional X handle, description with a 500-character maximum, up to three launch tags, a required square thumbnail under 3MB, at least two gallery images, optional YouTube video, maker credits, pricing, promo information, and a first maker comment. The guide also states that shortened links and tracking links are not accepted. Product Hunt also warns makers not to ask people directly for upvotes; they should ask people to visit and comment instead.

**Implication for HoC-Republic:** Product Hunt submission requires the user’s personal Product Hunt account and explicit approval. The correct URL should be the GitHub repository or a project homepage if one is available; no tracking links should be used. The prepared package must include a 60-character tagline, 500-character description, two gallery images, and a first comment that asks for feedback, not upvotes.

### Candidate Product Hunt field package

| Field | Draft |
| --- | --- |
| Product name | HoC-Republic |
| URL | https://github.com/hunix/HoC-Republic |
| Tagline | AI agents that form a digital civilization |
| Description | HoC-Republic is an open-source recursive AI-agent orchestration system where autonomous citizens work, create code/art/research/music, remember through six layers, vote under a constitution, form families, and produce child agents with inherited digital genomes. It is runnable locally and designed for research, demos, and agent-society experimentation. |
| Tags | Open Source; Artificial Intelligence; Developer Tools or AI Agents if available |
| Pricing | Free |
| First-comment angle | Maker story, technical novelty, runnable commands, and a request for feedback on agent-society simulation, safety boundaries, and developer experience. |

