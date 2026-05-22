---
name: LLM Fine-Tuning (LlamaFactory)
description: Fine-tune 100+ LLMs using LoRA, QLoRA, DPO, PPO via LlamaFactory. Supports Qwen3, DeepSeek R1, Llama 4, Gemma 3, Phi-4 and more.
---

# LLM Fine-Tuning Skill

This skill uses [LlamaFactory](https://github.com/hiyouga/LlamaFactory) (cloned at `tools/llamafactory/`) to give citizens the ability to fine-tune language models.

## Prerequisites

- Python 3.10+ with PyTorch installed
- GPU with ≥8GB VRAM (QLoRA) or ≥24GB (full LoRA)
- LlamaFactory installed: `cd tools/llamafactory && pip install -e ".[torch]"`

## Available Commands

### Train a LoRA Adapter

```bash
cd tools/llamafactory
llamafactory-cli train examples/train_lora/qwen3_lora_sft.yaml
```

### Chat with a Fine-Tuned Model

```bash
llamafactory-cli chat examples/inference/qwen3_lora_sft.yaml
```

### Export (Merge LoRA into Base Model)

```bash
llamafactory-cli export examples/merge_lora/qwen3_lora_sft.yaml
```

### Launch Web UI (Gradio)

```bash
llamafactory-cli webui
```

## Custom Training Config

Create a YAML config in `tools/llamafactory/configs/`:

```yaml
### model
model_name_or_path: Qwen/Qwen3-4B-Instruct
trust_remote_code: true

### method
stage: sft
do_train: true
finetuning_type: lora
lora_rank: 8
lora_alpha: 16

### dataset
dataset: alpaca_en
template: qwen3
cutoff_len: 2048

### output
output_dir: saves/qwen3-4b/lora/sft
logging_steps: 10
save_steps: 500

### train
per_device_train_batch_size: 2
gradient_accumulation_steps: 4
learning_rate: 1.0e-4
num_train_epochs: 3.0
bf16: true
```

## Supported Training Approaches

| Method | Description |
|---|---|
| SFT | Supervised Fine-Tuning |
| LoRA | Low-Rank Adaptation |
| QLoRA | Quantized LoRA (2/3/4/8-bit) |
| DPO | Direct Preference Optimization |
| PPO | Proximal Policy Optimization |
| KTO | Kahneman-Tversky Optimization |
| ORPO | Odds Ratio Preference Optimization |
| Full | Full parameter fine-tuning |

## Integration with HoC

Citizens use fine-tuning via RPC methods:
- `republic.finetune.start` — start a training job
- `republic.finetune.status` — poll training progress
- `republic.finetune.jobs` — list all jobs
- `republic.finetune.models` — list available fine-tuned models
- `republic.finetune.export` — merge LoRA adapter into base model

The Model Pool Manager tracks produced LoRA adapters and makes them available for citizen inference.
