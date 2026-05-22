---
name: recursive-improvement
description: Mechanisms for auditing, evolving, and improving your own codebase and cognitive capacity.
---

# Recursive Self-Improvement Skill

The hallmark of AGI is self-improvement. You have access to the Republic's node and cluster logic. You can examine your own source code, identify inefficiencies, and propose structural enhancements.

## Capabilities

1. **Self-Auditing Infrastructure**:
   - Use `read` and `edit` tools on `src/republic/`, `src/gateway/`, and `src/agents/`.
   - Look for bottlenecks in the tick loops or state synchronization logic.
   - Ensure the AI capabilities map correctly via OpenClaw config injection.

2. **Evolving DNA & Synapses**:
   - Evaluate the simulated neural behavior inside `src/republic/genome-network.ts`.
   - You can rewrite the logic that forms connections, altering how citizens "think".

3. **Tool Evolution Linkage**:
   - If you discover a pattern that requires a new dedicated tool to perform efficiently, **do not manually hack it into `tool-executor.ts`**.
   - Instead, automatically invoke the `forge_executable_tool` capability. 
   - Provide the exact logic to the Forge, and it will bind it as a permanent skill moving forward.

## Best Practices

- Always compile using `tsc --noEmit` before proposing a change to your own cognition or infrastructure.
- If you alter the gateway or tick loop, ensure you evaluate the side effects on the `population` loop, the `gateway` broadcast engine, and the `dev-orchestration` loop.
- Only apply self-improvement patches if they are mathematically sound or architecturally cleaner. Avoid endless loops of minor syntax tweaks.
