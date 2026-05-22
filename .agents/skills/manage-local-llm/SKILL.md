---
id: manage-local-llm
name: Manage Local LLMs & SLMs
icon: cpu
category: local-compute
description: Automates finding, downloading, and instantiating Ollama, LM Studio, and custom BitNet models for 0-cost inference.
author: Republic Engine
version: 1.0.0
---

# Manage Local LLMs

This skill allows agents to hook directly into the tier 1 (Local Compute) subsystem. You can use it to pull models into Ollama, LM Studio, or download GGUF BitNet files and wire them into the Universal Model Intelligence Engine (UMIE).

## Capabilities

### 1. `local_compute_status`
Returns the status of all available local runtimes (Ollama, LM Studio) and explicitly registered BitNet nodes, along with currently loaded models.

### 2. `ollama_pull`
Request the gateway to pull an Ollama model from the registry. The gateway will download it and automatically register it into the UMIE upon completion.
- `model`: e.g., "llama3:8b", "phi3"

### 3. `bitnet_register`
Manually register a custom port running a 1-bit SLM wrapper so the Compute Router knows to route low-complexity tier 1 inference tasks to it.
- `host`: string
- `port`: number
- `modelName`: string

## Strategic Usage

Because Local Inference costs 0 compute credits, all routine and redundant logic should be handled by these models. Ensure you proactively check `local_compute_status` before burning Tier 3 (Cloud LLM) credits on routine tasks.
