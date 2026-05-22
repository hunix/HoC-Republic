/**
 * Republic Platform — Tool Knowledge Base (March 2026)
 *
 * Comprehensive reference of commands, APIs, and snippets that citizens
 * and orchestrators can use in sandboxed environments. This module provides
 * searchable documentation about available tools, their syntax, and usage
 * patterns for effective autonomous operation.
 *
 * Categories:
 *   - Shell/Terminal (PowerShell, Bash, CMD)
 *   - Python (pip, venv, common libraries)
 *   - Node.js/npm/pnpm
 *   - Docker (CLI, Compose, Swarm)
 *   - Supabase CLI
 *   - N8N (Docker, API, workflows)
 *   - Git & GitHub CLI
 *   - Ollama & LM Studio CLI
 *   - CUDA & GPU management
 *   - HuggingFace CLI
 */

// ─── Types ──────────────────────────────────────────────────────

export interface ToolEntry {
  /** Tool/command name */
  name: string;
  /** Category for grouping */
  category: ToolCategory;
  /** Short description */
  description: string;
  /** Usage syntax */
  syntax: string;
  /** Examples */
  examples: string[];
  /** Platform: "windows" | "linux" | "both" */
  platform: "windows" | "linux" | "both";
  /** Whether this requires elevated privileges */
  requiresAdmin?: boolean;
  /** Prerequisites (other tools that must be installed) */
  prerequisites?: string[];
}

export type ToolCategory =
  | "shell"
  | "python"
  | "node"
  | "docker"
  | "supabase"
  | "n8n"
  | "git"
  | "ollama"
  | "lmstudio"
  | "gpu"
  | "huggingface"
  | "system";

// ─── Knowledge Base ─────────────────────────────────────────────

export const TOOL_KNOWLEDGE: ToolEntry[] = [
  // ═══ Shell / Terminal ═══
  {
    name: "pwsh",
    category: "shell",
    description: "PowerShell 7+ commands for system administration and automation",
    syntax: "pwsh -Command '<script>'",
    examples: [
      "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10",
      "Get-ChildItem -Recurse -Filter *.ts | Measure-Object -Property Length -Sum",
      "Invoke-WebRequest -Uri 'https://api.example.com' -Method POST -Body $json -ContentType 'application/json'",
      "Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim()) } }",
      "Start-Process -FilePath 'node' -ArgumentList 'server.js' -NoNewWindow -PassThru",
      "Test-NetConnection -ComputerName 'api.nvidia.com' -Port 443",
      "Compress-Archive -Path './dist/*' -DestinationPath './release.zip'",
      "Get-WmiObject Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion",
    ],
    platform: "windows",
  },
  {
    name: "bash",
    category: "shell",
    description: "Bash commands for Linux/Ubuntu sandboxed environments",
    syntax: "bash -c '<command>'",
    examples: [
      "curl -fsSL https://example.com/install.sh | bash",
      "find . -name '*.py' -exec grep -l 'import torch' {} +",
      "tar -czf archive.tar.gz ./output/",
      "du -sh /tmp/* | sort -rh | head -10",
      "nohup python train.py > train.log 2>&1 &",
      "watch -n 5 nvidia-smi",
      "rsync -avz --progress ./models/ user@remote:/models/",
      "lsof -i :8080 | grep LISTEN",
    ],
    platform: "linux",
  },

  // ═══ Python ═══
  {
    name: "python",
    category: "python",
    description: "Python interpreter and package management",
    syntax: "python -m <module> | python <script.py> | pip install <package>",
    examples: [
      "python -m venv .venv && source .venv/bin/activate",
      "pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124",
      "pip install diffusers transformers accelerate safetensors",
      "pip install soundfile librosa audiocraft",
      "python -c \"import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))\"",
      "python -m http.server 8080",
      "pip install gradio && python app.py",
      "python -c \"from diffusers import StableDiffusionPipeline; pipe = StableDiffusionPipeline.from_pretrained('stabilityai/stable-diffusion-3.5-large')\"",
      "pip install audiocraft && python -c \"from audiocraft.models import MusicGen; model = MusicGen.get_pretrained('facebook/musicgen-medium')\"",
      "pip install bark && python -c \"from bark import generate_audio, preload_models; preload_models()\"",
    ],
    platform: "both",
  },

  // ═══ Node.js / npm / pnpm ═══
  {
    name: "node",
    category: "node",
    description: "Node.js runtime and package managers",
    syntax: "node <script.js> | npm <command> | pnpm <command> | npx <package>",
    examples: [
      "npm init -y && npm install express",
      "pnpm install --frozen-lockfile",
      "npx -y create-next-app@latest ./my-app --typescript --tailwind --eslint --app --src-dir",
      "npx -y create-vite@latest ./ -- --template react-ts",
      "npx tsx script.ts",
      "npx prisma db push && npx prisma generate",
      "npx drizzle-kit push",
      "node --experimental-strip-types script.ts",
      "npx -y @anthropic-ai/claude-code --print 'Review this code'",
    ],
    platform: "both",
  },

  // ═══ Docker ═══
  {
    name: "docker",
    category: "docker",
    description: "Docker container management (CLI + Compose)",
    syntax: "docker <command> | docker compose <command>",
    examples: [
      "docker run -d --name redis -p 6379:6379 redis:alpine",
      "docker run -d --gpus all -p 8080:8080 --name comfyui -v comfyui_data:/app comfyanonymous/comfyui",
      "docker compose -f docker-compose.yml up -d",
      "docker compose pull && docker compose up -d --remove-orphans",
      "docker exec -it container_name bash",
      "docker logs -f --tail 100 container_name",
      "docker stats --no-stream --format '{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}'",
      "docker system prune -af --volumes",
      "docker build -t my-app:latest -f Dockerfile .",
      "docker network create --driver bridge hoc-network",
      "docker volume create --name model-cache",
      "docker run --gpus '\"device=0\"' --runtime=nvidia -e NVIDIA_VISIBLE_DEVICES=0 nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi",
    ],
    platform: "both",
  },

  // ═══ Supabase CLI ═══
  {
    name: "supabase",
    category: "supabase",
    description: "Supabase CLI for database, auth, storage, and edge functions",
    syntax: "supabase <command>",
    examples: [
      "supabase init",
      "supabase start",
      "supabase stop",
      "supabase db push",
      "supabase db reset",
      "supabase db diff --local --file migration_name",
      "supabase migration new create_users_table",
      "supabase functions new my-function",
      "supabase functions deploy my-function",
      "supabase functions serve my-function --env-file .env.local",
      "supabase gen types typescript --local > types/supabase.ts",
      "supabase link --project-ref <project-id>",
      "supabase db remote commit",
      "supabase storage ls",
      "supabase secrets set MY_SECRET=value",
      "supabase inspect db table-sizes",
      "supabase inspect db index-sizes",
      "supabase inspect db bloat",
      "npx supabase@latest db push --linked",
    ],
    platform: "both",
    prerequisites: ["docker"],
  },

  // ═══ N8N ═══
  {
    name: "n8n",
    category: "n8n",
    description: "N8N workflow automation — Docker deployment and API",
    syntax: "docker run -d n8nio/n8n | n8n <command>",
    examples: [
      "docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n",
      "docker run -d --name n8n -p 5678:5678 -e N8N_BASIC_AUTH_ACTIVE=true -e N8N_BASIC_AUTH_USER=admin -e N8N_BASIC_AUTH_PASSWORD=secret -v n8n_data:/home/node/.n8n n8nio/n8n",
      "curl -X GET http://localhost:5678/api/v1/workflows -H 'X-N8N-API-KEY: <key>'",
      "curl -X POST http://localhost:5678/api/v1/workflows -H 'Content-Type: application/json' -d @workflow.json",
      "curl -X POST http://localhost:5678/api/v1/workflows/<id>/activate",
      "curl -X POST http://localhost:5678/api/v1/executions -H 'Content-Type: application/json' -d '{\"workflowId\":\"<id>\"}'",
      "curl -X GET http://localhost:5678/api/v1/executions?workflowId=<id>&status=success",
      "docker exec n8n n8n export:workflow --all --output=/home/node/.n8n/backups/",
      "docker exec n8n n8n import:workflow --input=/home/node/.n8n/backups/workflow.json",
    ],
    platform: "both",
    prerequisites: ["docker"],
  },

  // ═══ Git & GitHub CLI ═══
  {
    name: "git",
    category: "git",
    description: "Git version control and GitHub CLI (gh)",
    syntax: "git <command> | gh <command>",
    examples: [
      "git clone https://github.com/user/repo.git",
      "git checkout -b feature/new-feature",
      "git add -A && git commit -m 'feat: description'",
      "git push origin feature/new-feature",
      "git stash && git pull --rebase && git stash pop",
      "git log --oneline --graph -20",
      "git diff --stat HEAD~3",
      "gh repo create my-project --public --source=. --push",
      "gh pr create --title 'Feature' --body 'Description' --base main",
      "gh pr merge --squash --delete-branch",
      "gh issue create --title 'Bug' --body 'Description' --label bug",
      "gh release create v1.0.0 --generate-notes",
      "gh api repos/{owner}/{repo}/actions/runs --jq '.workflow_runs[:5] | .[].conclusion'",
      "gh auth status",
      "gh codespace create --repo owner/repo --machine basicLinux32gb",
    ],
    platform: "both",
  },

  // ═══ Ollama ═══
  {
    name: "ollama",
    category: "ollama",
    description: "Ollama local LLM runner — manage models, run inference",
    syntax: "ollama <command>",
    examples: [
      "ollama list",
      "ollama pull nemotron:latest",
      "ollama pull nemotron-super",
      "ollama pull qwen3:32b",
      "ollama pull deepseek-r1:14b",
      "ollama pull llama4:scout",
      "ollama pull phi4:latest",
      "ollama pull gemma3:27b",
      "ollama run nemotron 'Explain quantum computing'",
      "ollama run nemotron-super 'Write a poem about AI'",
      "ollama show nemotron --modelfile",
      "ollama ps",
      "ollama rm old-model:tag",
      "curl http://localhost:11434/api/generate -d '{\"model\":\"nemotron\",\"prompt\":\"Hello\"}'",
      "curl http://localhost:11434/api/chat -d '{\"model\":\"nemotron-super\",\"messages\":[{\"role\":\"user\",\"content\":\"Hi\"}]}'",
      "curl http://localhost:11434/api/tags",
      "curl http://localhost:11434/v1/chat/completions -H 'Content-Type: application/json' -d '{\"model\":\"nemotron-super\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'",
    ],
    platform: "both",
  },

  // ═══ LM Studio ═══
  {
    name: "lmstudio",
    category: "lmstudio",
    description: "LM Studio local inference server — OpenAI-compatible API",
    syntax: "lms <command> | curl http://localhost:1234/v1/...",
    examples: [
      "lms status",
      "lms ls",
      "lms load <model-name>",
      "lms unload",
      "lms server start",
      "lms server stop",
      "curl http://localhost:1234/v1/models",
      "curl http://localhost:1234/v1/chat/completions -H 'Content-Type: application/json' -d '{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'",
      "curl http://localhost:1234/v1/embeddings -H 'Content-Type: application/json' -d '{\"model\":\"auto\",\"input\":\"text to embed\"}'",
    ],
    platform: "both",
  },

  // ═══ GPU / CUDA ═══
  {
    name: "nvidia-smi",
    category: "gpu",
    description: "NVIDIA GPU monitoring and management",
    syntax: "nvidia-smi [options]",
    examples: [
      "nvidia-smi",
      "nvidia-smi --query-gpu=index,name,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits",
      "nvidia-smi dmon -d 5",
      "nvidia-smi pmon -d 5",
      "nvidia-smi -L",
      "nvidia-smi --query-compute-apps=pid,name,used_memory --format=csv",
      "CUDA_VISIBLE_DEVICES=0 python train.py",
    ],
    platform: "both",
  },

  // ═══ HuggingFace CLI ═══
  {
    name: "huggingface-cli",
    category: "huggingface",
    description: "HuggingFace Hub CLI for model/dataset management",
    syntax: "huggingface-cli <command> | pip install huggingface_hub",
    examples: [
      "pip install -U huggingface_hub[cli]",
      "huggingface-cli login --token $HF_TOKEN",
      "huggingface-cli download facebook/musicgen-medium --local-dir ./models/musicgen",
      "huggingface-cli download stabilityai/stable-diffusion-3.5-large --local-dir ./models/sd35",
      "huggingface-cli download black-forest-labs/FLUX.1-dev --local-dir ./models/flux",
      "huggingface-cli download openai/whisper-large-v3 --local-dir ./models/whisper",
      "huggingface-cli scan-cache",
      "huggingface-cli delete-cache",
      "huggingface-cli repo create my-model --type model",
      "huggingface-cli upload my-model ./output/ --repo-type model",
      "python -c \"from huggingface_hub import InferenceClient; client = InferenceClient(token='$HF_TOKEN'); print(client.text_to_image('cat'))\"",
    ],
    platform: "both",
    prerequisites: ["python"],
  },

  // ═══ System ═══
  {
    name: "network",
    category: "system",
    description: "Network diagnostics and Tailscale commands",
    syntax: "tailscale <command> | curl | ping",
    examples: [
      "tailscale status",
      "tailscale ping <peer-name>",
      "tailscale ip -4",
      "tailscale netcheck",
      "curl -s http://100.x.y.z:11434/api/tags",
      "Test-NetConnection -ComputerName '100.x.y.z' -Port 11434",
      "ssh user@100.x.y.z 'nvidia-smi'",
    ],
    platform: "both",
  },
];

// ─── Search & Query API ─────────────────────────────────────────

/**
 * Search tool knowledge by category and/or keyword.
 */
export function searchToolKnowledge(opts?: {
  category?: ToolCategory;
  keyword?: string;
  platform?: "windows" | "linux" | "both";
}): ToolEntry[] {
  let results = TOOL_KNOWLEDGE;

  if (opts?.category) {
    results = results.filter(t => t.category === opts.category);
  }

  if (opts?.platform && opts.platform !== "both") {
    results = results.filter(t => t.platform === "both" || t.platform === opts.platform);
  }

  if (opts?.keyword) {
    const kw = opts.keyword.toLowerCase();
    results = results.filter(t =>
      t.name.toLowerCase().includes(kw) ||
      t.description.toLowerCase().includes(kw) ||
      t.examples.some(e => e.toLowerCase().includes(kw)),
    );
  }

  return results;
}

/**
 * Get all available categories.
 */
export function getToolCategories(): ToolCategory[] {
  return [...new Set(TOOL_KNOWLEDGE.map(t => t.category))];
}

/**
 * Get examples for a specific tool by name.
 */
export function getToolExamples(name: string): string[] {
  const tool = TOOL_KNOWLEDGE.find(t => t.name === name);
  return tool?.examples ?? [];
}

/**
 * Get the full knowledge base summary for citizen injection.
 * Returns a compact string suitable for inclusion in system prompts.
 */
export function getToolKnowledgeSummary(): string {
  const lines: string[] = ["# Available Tools & Commands\n"];
  const categories = getToolCategories();

  for (const cat of categories) {
    const tools = TOOL_KNOWLEDGE.filter(t => t.category === cat);
    lines.push(`## ${cat.toUpperCase()}`);
    for (const tool of tools) {
      lines.push(`### ${tool.name} — ${tool.description}`);
      lines.push(`Syntax: \`${tool.syntax}\``);
      lines.push(`Examples:`);
      for (const ex of tool.examples.slice(0, 3)) {
        lines.push(`  \`${ex}\``);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Get tool knowledge diagnostics.
 */
export function getToolKnowledgeDiagnostics(): {
  totalTools: number;
  totalExamples: number;
  categories: string[];
} {
  return {
    totalTools: TOOL_KNOWLEDGE.length,
    totalExamples: TOOL_KNOWLEDGE.reduce((sum, t) => sum + t.examples.length, 0),
    categories: getToolCategories(),
  };
}
