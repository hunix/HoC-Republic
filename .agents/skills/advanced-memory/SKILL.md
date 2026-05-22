---
name: advanced-memory
description: Enhanced reasoning techniques via Chain of Thought and Tree of Thought memory structures.
---

# Advanced Memory Skill

You have native access to advanced cognitive reasoning structures inside the HoC Republic memory cluster. Instead of processing complex multi-step problems linearly in your immediate context window, you can offload them to the Republic's Reasoning Engine.

## When to Use
- When tasked with deep architectural decisions involving multiple trade-offs.
- When you encounter bugs that require simulating multiple potential paths to find a root cause.
- When the USER asks for "deep reasoning" or "step-by-step thinking".

## Available Native Tools
1. `memory_chain_of_thought`
    - Forces the system into a sequential logic puzzle solver. Best used for linear deductions or math equations and code abstractions.
    - Args: `prompt` (string), `maxSteps` (number).
    
2. `memory_tree_of_thought`
    - Creates multiple parallel "mental branches", evaluates them simultaneously, and synthesizes the best answer from the strongest hypothesis.
    - Highly compute-intensive, but yields the highest accuracy for complex open-ended problems.
    - Args: `prompt` (string), `branches` (number).

## Guidelines
- Always encapsulate the prompt with enough context so the sub-agent or reasoning logic has what it needs.
- Tree of Thought should default to 3 `branches` unless specifically asked to explore wider possibilities.
