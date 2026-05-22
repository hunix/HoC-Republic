---
name: skill-forge
description: Dynamic capability expansion and tool creation.
---

# Skill Forge Engine

The Republic allows for autonomous expansion of your own capabilities. As an OpenClaw agent, if you find yourself missing a necessary operational skill or a native function, you can forge it natively.

## Available Native Tools
1. `skill_forge_create`
    - Automatically generate a `.md` skill file, or a full native logic implementation inside `.agents/skills/`.
    - It uses the Republic's internal logic engine to codify best practices into a prompt-based skill set.
    - Args: `name` (string), `objective` (string).

## Best Practices
- Never use this tool for one-off tasks. Only forge skills if you expect the USER or yourself to perform the workflow multiple times in the future.
- Be highly descriptive in the `objective` parameter. The better the objective description, the more accurate the resulting skill guide will be.
- If a skill already exists in `.agents/skills/` with a similar name, you should review it via `view_file` first to see if it just needs an update using your standard filesystem tools.
