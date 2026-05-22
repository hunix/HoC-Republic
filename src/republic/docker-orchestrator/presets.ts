/**
 * Docker Orchestrator — Container Presets
 */

import type { ContainerConfig } from "./types.js";

/** Pre-built container configurations for common services */
export const CONTAINER_PRESETS: Record<string, Omit<ContainerConfig, "name" | "requestedBy">> = {
  redis: {
    image: "redis:7-alpine",
    ports: ["6379:6379"],
    memoryLimit: "256m",
    cpuLimit: "0.5",
    restartPolicy: "unless-stopped",
  },
  postgres: {
    image: "postgres:16-alpine",
    ports: ["5432:5432"],
    env: { POSTGRES_PASSWORD: "hoc_dev", POSTGRES_DB: "hoc" },
    memoryLimit: "512m",
    cpuLimit: "1.0",
    restartPolicy: "unless-stopped",
    volumes: ["hoc-pgdata:/var/lib/postgresql/data"],
  },
  mongodb: {
    image: "mongo:7",
    ports: ["27017:27017"],
    memoryLimit: "512m",
    cpuLimit: "1.0",
    restartPolicy: "unless-stopped",
    volumes: ["hoc-mongodata:/data/db"],
  },
  chromadb: {
    image: "chromadb/chroma:latest",
    ports: ["8000:8000"],
    memoryLimit: "1g",
    cpuLimit: "1.0",
    restartPolicy: "unless-stopped",
  },
  minio: {
    image: "minio/minio:latest",
    ports: ["9000:9000", "9001:9001"],
    env: { MINIO_ROOT_USER: "hoc", MINIO_ROOT_PASSWORD: "hoc_minio_dev" },
    memoryLimit: "512m",
    cpuLimit: "1.0",
    restartPolicy: "unless-stopped",
    command: ["server", "/data", "--console-address", ":9001"],
  },
  n8n: {
    image: "n8nio/n8n:latest",
    ports: ["5678:5678"],
    memoryLimit: "1g",
    cpuLimit: "1.0",
    restartPolicy: "unless-stopped",
    volumes: ["hoc-n8n:/home/node/.n8n"],
    env: {
      // Disable the browser-based owner setup prompt so the API is immediately accessible
      N8N_SKIP_OWNER_SETUP: "true",
      // Disable basic-auth login page — we use API key auth instead
      N8N_BASIC_AUTH_ACTIVE: "false",
      // Enable API key authentication on the REST API
      N8N_API_KEY_AUTH_ACTIVE: "true",
      // Pre-configured key shared with the gateway — set via HOC_N8N_API_KEY env or default
      // The gateway reads this from process.env.N8N_API_KEY at bridge construction.
      // IMPORTANT: this value is also injected into process.env.N8N_API_KEY at container
      // launch time by citizen-n8n.ts ensureN8nRunning() so the bridge is auto-wired.
      N8N_API_KEY:
        process.env["HOC_N8N_API_KEY"] ?? process.env["N8N_API_KEY"] ?? "hoc-n8n-api-key-auto",
      // Log level
      N8N_LOG_LEVEL: "warn",
      // Webhook URL visible to n8n for generating webhook URLs
      WEBHOOK_URL: "http://localhost:5678",
    },
  },
  ubuntu: {
    image: "ubuntu:24.04",
    memoryLimit: "2g",
    cpuLimit: "2.0",
    command: ["sleep", "infinity"],
  },
  // GPU-Accelerated Presets (require NVIDIA Container Toolkit)
  "ffmpeg-cuda": {
    image: "linuxserver/ffmpeg:latest",
    gpus: "all",
    memoryLimit: "4g",
    cpuLimit: "4.0",
    volumes: ["hoc-media:/media"],
  },
  "blender-gpu": {
    image: "nytimes/blender:latest",
    gpus: "all",
    memoryLimit: "8g",
    cpuLimit: "4.0",
    volumes: ["hoc-renders:/renders"],
  },
  comfyui: {
    image: "yanwk/comfyui-boot:cu128-megapak",
    gpus: "all",
    ports: ["8188:8188"],
    memoryLimit: "16g",
    cpuLimit: "4.0",
    volumes: ["hoc-comfyui:/root"],
    restartPolicy: "unless-stopped",
    labels: { "hoc.service": "comfyui", "hoc.managed": "true", "hoc.department": "creative" },
  },
  supabase: {
    image: "supabase/postgres:15.1.1.61",
    // Use dynamic host ports (0:N) so concurrent citizen instances don't clash
    ports: ["0:5432", "0:8000"],
    env: {
      POSTGRES_PASSWORD: "postgres",
      POSTGRES_DB: "supabase",
    },
    memoryLimit: "2g",
    cpuLimit: "2.0",
    restartPolicy: "unless-stopped",
    volumes: ["hoc-supabase-db:/var/lib/postgresql/data"],
    labels: { "hoc.service": "supabase", "hoc.managed": "true" },
  },
  // ── Security / Cyber Defense Presets ────────────────────────────────
  "kali-linux": {
    image: "kalilinux/kali-rolling",
    memoryLimit: "4g",
    cpuLimit: "4.0",
    command: [
      "bash",
      "-c",
      "apt-get update && apt-get install -y kali-linux-headless metasploit-framework python3-impacket nuclei radare2 sliver bloodhound.py netexec sqlmap beef-xss && sleep infinity",
    ],
    labels: { "hoc.service": "kali-linux", "hoc.managed": "true", "hoc.department": "defense" },
    volumes: ["hoc-kali-data:/root/data"],
  },
  "parrot-os": {
    image: "parrotsec/security",
    memoryLimit: "4g",
    cpuLimit: "4.0",
    command: ["sleep", "infinity"],
    labels: { "hoc.service": "parrot-os", "hoc.managed": "true", "hoc.department": "defense" },
    volumes: ["hoc-parrot-data:/root/data"],
  },
  openvas: {
    image: "greenbone/openvas-scanner:latest",
    ports: ["9392:9392"],
    memoryLimit: "2g",
    cpuLimit: "2.0",
    restartPolicy: "unless-stopped",
    labels: { "hoc.service": "openvas", "hoc.managed": "true", "hoc.department": "defense" },
  },
  wazuh: {
    image: "wazuh/wazuh-agent:latest",
    memoryLimit: "1g",
    cpuLimit: "1.0",
    restartPolicy: "unless-stopped",
    env: { WAZUH_MANAGER: "localhost" },
    labels: { "hoc.service": "wazuh", "hoc.managed": "true", "hoc.department": "defense" },
  },
  // ── Agent Presets ───────────────────────────────────────────────
  "desktop-agent": {
    image: "hoc/agent-sandbox:latest",
    ports: ["3100:3100", "6081:6081"],
    memoryLimit: "8g",
    cpuLimit: "4.0",
    restartPolicy: "unless-stopped",
    volumes: ["hoc-agent-data:/workspace"],
    labels: { "hoc.service": "desktop-agent", "hoc.managed": "true", "hoc.department": "agents" },
  },
  "playwright-sandbox": {
    image: "mcr.microsoft.com/playwright:v1.50.0-noble",
    ports: ["3101:3101"],
    memoryLimit: "4g",
    cpuLimit: "2.0",
    restartPolicy: "unless-stopped",
    command: ["sleep", "infinity"],
    labels: { "hoc.service": "playwright", "hoc.managed": "true", "hoc.department": "agents" },
  },
  "comfyui-rtx": {
    image: "yanwk/comfyui-boot:cu128-megapak",
    gpus: "all",
    ports: ["8189:8188"],
    memoryLimit: "20g",
    cpuLimit: "8.0",
    volumes: ["hoc-comfyui-rtx:/root"],
    restartPolicy: "unless-stopped",
    labels: { "hoc.service": "comfyui-rtx", "hoc.managed": "true", "hoc.department": "creative" },
  },
  // ── ML / Research Presets ───────────────────────────────────────
  jupyter: {
    image: "quay.io/jupyter/scipy-notebook:latest",
    ports: ["8888:8888"],
    memoryLimit: "8g",
    cpuLimit: "4.0",
    restartPolicy: "unless-stopped",
    volumes: ["hoc-jupyter-work:/home/jovyan/work"],
    env: {
      JUPYTER_ENABLE_LAB: "yes",
      // Disable token auth so hoc-ui can iframe/embed without login prompt
      JUPYTER_TOKEN: "",
      JUPYTER_ALLOW_INSECURE_WRITES: "1",
    },
    command: ["start-notebook.sh", "--NotebookApp.token=''", "--NotebookApp.password=''"],
    labels: { "hoc.service": "jupyter", "hoc.managed": "true", "hoc.department": "ml" },
  },
  "deep-research": {
    // Open-WebUI as a self-hostable research + RAG interface
    image: "ghcr.io/open-webui/open-webui:main",
    ports: ["7860:8080"],
    memoryLimit: "4g",
    cpuLimit: "2.0",
    restartPolicy: "unless-stopped",
    volumes: ["hoc-open-webui:/app/backend/data"],
    env: {
      // Connect to local Ollama if available; falls back to cloud proxy
      OLLAMA_BASE_URL: "http://host.docker.internal:11434",
      WEBUI_AUTH: "false", // disable login for internal use
    },
    labels: { "hoc.service": "deep-research", "hoc.managed": "true", "hoc.department": "research" },
  },
};
