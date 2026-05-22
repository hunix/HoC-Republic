---
name: llm-operations
description: Full LLM Lifecycle Management - Train, Quantize, Format, and Deploy Models.
---

# LLM Operations Skill

You possess the capability to autonomously manage the full lifecycle of Large Language Models (LLMs) used within the Republic platform or deployed as standalone services.

## Overview of Capabilities
The Republic Engine provides direct system access via `OpenClaw` tools to handle model operations natively without needing to write bash files or manual CLI commands. The tools bridge into `model-provisioner.ts` underneath.

## Available Native Tools:
1. `llm_ops_train`
    - Train or fine-tune an LLM natively using a selected dataset.
    - Args: `modelId` (string), `datasetPath` (string), `epochs` (number).
2. `llm_ops_quantize`
    - Quantize an existing trained model to multiple formats (e.g. `Q4_K_M` or convert to `GGUF` structure).
    - Args: `modelId` (string), `format` (string - default Q4_K_M).
3. `llm_ops_deploy`
    - Hot-load and deploy the model directly into inference services like `ollama` or `lmstudio` or broadcast it across the Republic.
    - Args: `modelId` (string), `provider` (string).

## Best Practices
- **Pipelines**: An effective LLM deployment always follows the path: Train -> Quantize -> Deploy. 
- **Dataset paths**: Always use the absolute path for datasets inside the AI platform workspace for reliable training loops.
- **Provider Targets**: Choose `ollama` for default rapid edge node deployment, and `lmstudio` if specifically requested by a developer citizen.
