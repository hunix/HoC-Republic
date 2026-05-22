import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { LocalInstance } from "../republic-types.js";

/** VRAM estimation: model_params × bits_per_weight ÷ 8 + KV cache overhead */
function estimateVRAM(modelId: string): { estimateGB: number; label: string } {
  const lower = modelId.toLowerCase();
  // Parse param count from model name (e.g. "7b", "3b", "1b", "700m")
  const match = lower.match(/(\d+\.?\d*)\s*([bm])/i);
  if (!match) {
    return { estimateGB: 0, label: "Unknown" };
  }
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const params = unit === "b" ? num * 1e9 : num * 1e6;
  // Assume Q4 quantization (4 bits per weight) + 20% overhead for KV cache
  const bytesForWeights = (params * 4) / 8;
  const totalBytes = bytesForWeights * 1.2;
  const gb = totalBytes / 1024 ** 3;
  return { estimateGB: Math.round(gb * 10) / 10, label: `~${Math.round(gb * 10) / 10} GB` };
}

@customElement("hoc-lmstudio-dashboard")
export class LmstudioDashboard extends LitElement {
  @property({ type: Array }) instances: LocalInstance[] = [];

  @state() private serverOnline = false;
  @state() private loadedModel: string | null = null;
  @state() private modelList: string[] = [];
  @state() private pollTimer: ReturnType<typeof setInterval> | null = null;
  @state() private logEntries: { time: string; type: string; message: string }[] = [];
  @state() private tokensPerSec = 0;
  @state() private requestCount = 0;
  @state() private avgLatencyMs = 0;
  @state() private lastChecked = "";
  @state() private gpuTemp: number | null = null;
  @state() private benchmarkResult: { tps: number; ttft: number; total: number } | null = null;
  @state() private benchmarking = false;
  @state() private logsPaused = false;

  connectedCallback() {
    super.connectedCallback();
    this._pollHealth();
    this.pollTimer = setInterval(() => this._pollHealth(), 5000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  private async _pollHealth() {
    try {
      const res = await fetch("http://127.0.0.1:1234/v1/models", {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        this.serverOnline = false;
        return;
      }
      const data = (await res.json()) as { data?: { id: string }[] };
      const models = data.data ?? [];
      this.serverOnline = true;
      this.modelList = models.map((m) => m.id);
      this.loadedModel = models.length > 0 ? models[0].id : null;
      this.lastChecked = new Date().toLocaleTimeString();

      // Try to get GPU temp via nvidia-smi (best effort)
      try {
        const gpuRes = await fetch("http://127.0.0.1:1234/api/v1/status", {
          signal: AbortSignal.timeout(1000),
        });
        if (gpuRes.ok) {
          const info = (await gpuRes.json()) as Record<string, unknown>;
          if (typeof info.gpu_temperature === "number") {
            this.gpuTemp = info.gpu_temperature;
          }
        }
      } catch {
        /* no GPU info */
      }

      // Log activity
      if (!this.logsPaused) {
        this.requestCount++;
        const entry = {
          time: new Date().toLocaleTimeString(),
          type: "health",
          message: `Server OK — ${models.length} model(s) loaded`,
        };
        this.logEntries = [...this.logEntries.slice(-99), entry];
      }
    } catch {
      this.serverOnline = false;
      this.lastChecked = new Date().toLocaleTimeString();
    }
  }

  private async _runBenchmark() {
    if (!this.serverOnline || !this.loadedModel || this.benchmarking) {
      return;
    }
    this.benchmarking = true;
    const prompt = "Explain the theory of relativity in exactly three sentences.";
    const start = performance.now();
    let ttft = 0;
    let totalTokens = 0;

    try {
      const res = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.loadedModel,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 150,
          temperature: 0.7,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        this.benchmarking = false;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let firstToken = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            continue;
          }
          try {
            const parsed = JSON.parse(jsonStr) as { choices?: { delta?: { content?: string } }[] };
            const content = parsed.choices?.[0]?.delta?.content ?? "";
            if (content && firstToken) {
              ttft = performance.now() - start;
              firstToken = false;
            }
            if (content) {
              totalTokens++;
            }
          } catch {
            /* skip malformed SSE */
          }
        }
      }

      const total = performance.now() - start;
      const tps = totalTokens > 0 ? totalTokens / (total / 1000) : 0;
      this.benchmarkResult = {
        tps: Math.round(tps * 10) / 10,
        ttft: Math.round(ttft),
        total: Math.round(total),
      };
      this.tokensPerSec = this.benchmarkResult.tps;
      this.avgLatencyMs = this.benchmarkResult.total;

      // Add log entry
      this.logEntries = [
        ...this.logEntries.slice(-99),
        {
          time: new Date().toLocaleTimeString(),
          type: "benchmark",
          message: `Benchmark complete: ${this.benchmarkResult.tps} tok/s, TTFT ${this.benchmarkResult.ttft}ms, total ${this.benchmarkResult.total}ms`,
        },
      ];
    } catch (err) {
      this.logEntries = [
        ...this.logEntries.slice(-99),
        {
          time: new Date().toLocaleTimeString(),
          type: "error",
          message: `Benchmark failed: ${err}`,
        },
      ];
    }
    this.benchmarking = false;
  }

  static styles = css`
    :host {
      display: block;
      padding: 24px;
      color: var(--text, #e2e8f0);
      font-family: var(--font-body, system-ui, sans-serif);
      animation: fade-in 0.4s ease-out;
    }
    @keyframes fade-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      background: linear-gradient(90deg, var(--accent, #a855f7), var(--accent-hover, #c084fc));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .header p {
      margin: 8px 0 0 0;
      color: var(--muted, #94a3b8);
      font-size: 14px;
    }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card, rgba(30, 41, 59, 0.5));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.05));
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      transition:
        transform 0.2s,
        box-shadow 0.2s;
    }
    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--accent);
    }
    .stat-label {
      font-size: 11px;
      color: var(--muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 4px;
    }
    .stat-unit {
      font-size: 14px;
      color: var(--muted, #94a3b8);
      font-weight: 400;
    }

    .panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    @media (max-width: 900px) {
      .panels {
        grid-template-columns: 1fr;
      }
    }

    .panel {
      background: var(--card, rgba(30, 41, 59, 0.5));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.05));
      border-radius: 12px;
      padding: 20px;
      min-height: 200px;
    }
    .panel h3 {
      margin: 0 0 12px 0;
      color: var(--text-strong, #f8fafc);
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    .status-dot.online {
      background: var(--ok);
      box-shadow: 0 0 8px var(--ok-subtle);
    }
    .status-dot.offline {
      background: var(--danger);
    }

    .log-viewer {
      background: var(--secondary);
      border-radius: var(--radius-md, 8px);
      padding: 12px;
      max-height: 300px;
      overflow-y: auto;
      font-family: var(--mono, "JetBrains Mono", "Fira Code", monospace);
      font-size: 12px;
      line-height: 1.6;
    }
    .log-entry {
      display: flex;
      gap: 8px;
      padding: 2px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    .log-time {
      color: var(--muted);
      min-width: 70px;
      flex-shrink: 0;
    }
    .log-type {
      min-width: 60px;
      flex-shrink: 0;
      font-weight: 600;
    }
    .log-type.health {
      color: var(--ok);
    }
    .log-type.benchmark {
      color: var(--info);
    }
    .log-type.error {
      color: var(--danger);
    }
    .log-type.request {
      color: var(--warn);
    }
    .log-msg {
      color: var(--text);
      word-break: break-all;
    }

    .log-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .vram-bar {
      height: 24px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.3);
      overflow: hidden;
      margin-top: 8px;
      position: relative;
    }
    .vram-fill {
      height: 100%;
      border-radius: 12px;
      transition: width 0.5s ease;
    }
    .vram-label {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 11px;
      font-weight: 600;
    }

    .model-card {
      background: var(--bg-muted, rgba(0, 0, 0, 0.2));
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .model-name {
      font-weight: 600;
      color: var(--text-strong, #f8fafc);
      font-size: 14px;
      margin-bottom: 4px;
    }
    .model-meta {
      font-size: 12px;
      color: var(--muted, #94a3b8);
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-hover, #7c3aed));
      color: var(--accent-foreground, white);
    }
    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px var(--accent-glow);
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .btn-ghost {
      background: var(--bg-muted);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-ghost:hover {
      background: var(--bg-hover);
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }

    .benchmark-card {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 12px;
    }
    .bench-metric {
      text-align: center;
      padding: 12px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
    }
    .bench-value {
      font-size: 24px;
      font-weight: 700;
    }
    .bench-label {
      font-size: 10px;
      color: var(--muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .temp-gauge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .temp-icon {
      font-size: 18px;
    }
    .temp-value {
      font-weight: 700;
    }
    .temp-ok {
      color: var(--ok);
    }
    .temp-warm {
      color: var(--warn);
    }
    .temp-hot {
      color: var(--danger);
    }

    .quick-setup {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
    }
    .setup-card {
      background: var(--card, rgba(30, 41, 59, 0.5));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.05));
      border-radius: 12px;
      padding: 20px;
    }
    .setup-card h3 {
      margin: 0 0 12px 0;
    }
    .setup-list {
      margin: 0;
      padding-left: 20px;
      color: var(--muted, #94a3b8);
      font-size: 13px;
      line-height: 1.8;
    }
    .rec-model {
      padding: 8px 12px;
      background: var(--bg-muted, rgba(0, 0, 0, 0.2));
      border-radius: 6px;
      margin-bottom: 6px;
      font-family: monospace;
      font-size: 13px;
    }
  `;

  render() {
    const lms = this.instances.filter((i) => i.type === "lmstudio");
    const isOnline = this.serverOnline || lms.length > 0;
    const vram = this.loadedModel ? estimateVRAM(this.loadedModel) : null;
    const tempClass =
      this.gpuTemp === null
        ? ""
        : this.gpuTemp < 60
          ? "temp-ok"
          : this.gpuTemp < 80
            ? "temp-warm"
            : "temp-hot";

    return html`
      <div class="header">
        <h1>🧪 LM Studio Server</h1>
        <p>GGUF model inference engine with real-time monitoring and performance analytics.</p>
      </div>

      ${
        !isOnline
          ? this._renderOfflineState()
          : html`
        <!-- Stats Row -->
        <div class="stats-row">
          <div class="stat-card">
            <div><span class="status-dot ${isOnline ? "online" : "offline"}"></span></div>
            <div class="stat-value" style="color: ${isOnline ? "#22c55e" : "#f87171"}">${isOnline ? "ONLINE" : "OFFLINE"}</div>
            <div class="stat-label">Server Status</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${this.modelList.length}</div>
            <div class="stat-label">Models Loaded</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${this.tokensPerSec}<span class="stat-unit"> tok/s</span></div>
            <div class="stat-label">Generation Speed</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${vram ? vram.label : "—"}</div>
            <div class="stat-label">Est. VRAM Usage</div>
          </div>
          ${
            this.gpuTemp !== null
              ? html`
            <div class="stat-card">
              <div class="stat-value temp-gauge">
                <span class="temp-icon">🌡️</span>
                <span class="${tempClass}">${this.gpuTemp}°C</span>
              </div>
              <div class="stat-label">GPU Temperature</div>
            </div>
          `
              : nothing
          }
        </div>

        <!-- Two-column panels -->
        <div class="panels">
          <!-- Active Models Panel -->
          <div class="panel">
            <h3>🧠 Active Models</h3>
            ${
              this.modelList.length > 0
                ? this.modelList.map((m) => {
                    const v = estimateVRAM(m);
                    return html`
                <div class="model-card">
                  <div class="model-name">${m}</div>
                  <div class="model-meta">
                    <span>📊 VRAM: ${v.label}</span>
                    <span>⚡ ${this.tokensPerSec > 0 ? `${this.tokensPerSec} tok/s` : "N/A"}</span>
                  </div>
                  ${
                    v.estimateGB > 0
                      ? html`
                    <div class="vram-bar">
                      <div class="vram-fill" style="width: ${Math.min((v.estimateGB / 24) * 100, 100)}%; background: linear-gradient(90deg, #22c55e, ${v.estimateGB > 16 ? "#f87171" : "#3b82f6"});"></div>
                      <span class="vram-label">${v.label} / 24 GB</span>
                    </div>
                  `
                      : nothing
                  }
                </div>
              `;
                  })
                : html`
                    <p style="color: var(--muted, #94a3b8); font-size: 13px; font-style: italic">
                      No model currently loaded. Load one in LM Studio.
                    </p>
                  `
            }

            <!-- Benchmark Section -->
            <div style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3 style="margin: 0;">⚡ Quick Benchmark</h3>
                <button type="button" class="btn btn-primary btn-sm" ?disabled=${this.benchmarking || !this.loadedModel}
                  @click=${() => this._runBenchmark()}>
                  ${this.benchmarking ? "Running..." : "🏃 Run"}
                </button>
              </div>
              ${
                this.benchmarkResult
                  ? html`
                <div class="benchmark-card">
                  <div class="bench-metric">
                    <div class="bench-value" style="color: #22c55e">${this.benchmarkResult.tps}</div>
                    <div class="bench-label">Tokens/sec</div>
                  </div>
                  <div class="bench-metric">
                    <div class="bench-value" style="color: #3b82f6">${this.benchmarkResult.ttft}ms</div>
                    <div class="bench-label">Time to First Token</div>
                  </div>
                  <div class="bench-metric">
                    <div class="bench-value" style="color: #f59e0b">${this.benchmarkResult.total}ms</div>
                    <div class="bench-label">Total Latency</div>
                  </div>
                </div>
              `
                  : html`
                      <p style="color: var(--muted, #94a3b8); font-size: 12px">
                        Run a benchmark to measure tokens/sec, TTFT, and total latency.
                      </p>
                    `
              }
            </div>
          </div>

          <!-- Real-Time Log Viewer -->
          <div class="panel">
            <h3>📋 Real-Time Activity Log</h3>
            <div class="log-controls">
              <button type="button" class="btn btn-ghost btn-sm" @click=${() => {
                this.logsPaused = !this.logsPaused;
              }}>
                ${this.logsPaused ? "▶️ Resume" : "⏸️ Pause"}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" @click=${() => {
                this.logEntries = [];
              }}>
                🗑️ Clear
              </button>
              <span style="font-size: 11px; color: var(--muted, #94a3b8); margin-left: auto; align-self: center;">
                ${this.logEntries.length} entries • Last: ${this.lastChecked || "—"}
              </span>
            </div>
            <div class="log-viewer" id="log-viewer">
              ${
                this.logEntries.length === 0
                  ? html`
                      <div style="color: #64748b; text-align: center; padding: 40px 0">
                        <div style="font-size: 24px; margin-bottom: 8px">📋</div>
                        Waiting for activity...
                      </div>
                    `
                  : this.logEntries.map(
                      (e) => html`
                <div class="log-entry">
                  <span class="log-time">${e.time}</span>
                  <span class="log-type ${e.type}">${e.type}</span>
                  <span class="log-msg">${e.message}</span>
                </div>
              `,
                    )
              }
            </div>
          </div>
        </div>

        <!-- Server Info Row -->
        <div class="stats-row" style="margin-top: 0;">
          <div class="stat-card">
            <div class="stat-value" style="font-size: 16px; color: var(--text, #e2e8f0)">
              http://127.0.0.1:1234
            </div>
            <div class="stat-label">Endpoint</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="font-size: 16px; color: var(--text, #e2e8f0)">
              OpenAI + Anthropic
            </div>
            <div class="stat-label">Compatible APIs</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${this.requestCount}</div>
            <div class="stat-label">Health Checks</div>
          </div>
        </div>
      `
      }
    `;
  }

  private _renderOfflineState() {
    return html`
      <div class="quick-setup">
        <div class="setup-card">
          <h3 style="color: var(--text-strong, #f8fafc)">⚡ Status</h3>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px">
            <span class="status-dot offline"></span>
            <span style="color: #f87171; font-weight: 600">Not Connected</span>
          </div>
          <p style="margin: 0; font-size: 13px; color: var(--muted, #94a3b8)">
            No LM Studio server detected on port 1234. Launch the local server in LM Studio to enable GGUF
            inference and real-time monitoring.
          </p>
        </div>

        <div class="setup-card">
          <h3 style="color: var(--text-strong, #f8fafc)">🚀 Quick Setup</h3>
          <ol class="setup-list">
            <li>Download from <span style="color: #c084fc">lmstudio.ai</span></li>
            <li>Open LM Studio → search & download a GGUF model</li>
            <li>Go to Local Server tab → Start Server (port 1234)</li>
            <li>Return here — auto-detection activates in 5 seconds</li>
          </ol>
        </div>

        <div class="setup-card">
          <h3 style="color: var(--text-strong, #f8fafc)">🔧 Capabilities</h3>
          <ul class="setup-list" style="list-style: none; padding-left: 0">
            <li>
              🧠 <strong style="color: var(--text, #e2e8f0)">OpenAI-compatible API</strong> — Drop-in LLM
              server
            </li>
            <li>
              ⚙️ <strong style="color: var(--text, #e2e8f0)">GGUF Format</strong> — Quantized models for
              efficiency
            </li>
            <li>
              🎛️ <strong style="color: var(--text, #e2e8f0)">GPU Acceleration</strong> — CUDA / Metal /
              Vulkan
            </li>
            <li>
              📊 <strong style="color: var(--text, #e2e8f0)">Real-Time Monitoring</strong> — Live logs,
              benchmarks, VRAM
            </li>
            <li>
              🔄 <strong style="color: var(--text, #e2e8f0)">Auto-Routing</strong> — Gateway selects best
              model
            </li>
          </ul>
        </div>

        <div class="setup-card">
          <h3 style="color: var(--text-strong, #f8fafc)">📋 Recommended GGUF Models</h3>
          <p style="margin: 0 0 10px 0; font-size: 12px; color: var(--muted, #94a3b8)">
            Optimized for CPU inference on Intel Core Ultra 9 (16 cores, 32 GB RAM):
          </p>
          <div class="rec-model">
            ⭐ <strong>Qwen2.5-7B-Instruct-Q4_K_M</strong> — Best all-around (~4.4 GB)
          </div>
          <div class="rec-model">
            🧠 <strong>Llama-3.1-8B-Instruct-Q4_K_M</strong> — Strong reasoning (~4.7 GB)
          </div>
          <div class="rec-model">
            🔬 <strong>Phi-3-medium-4k-instruct-Q4_K_M</strong> — Deep analysis (~8 GB)
          </div>
          <div class="rec-model">
            💻 <strong>DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M</strong> — Code gen (~2.5 GB)
          </div>
          <div class="rec-model">
            📝 <strong>Mistral-7B-Instruct-v0.3-Q5_K_M</strong> — General purpose (~5.1 GB)
          </div>
        </div>
      </div>
    `;
  }

  updated(changed: Map<string, unknown>) {
    super.updated(changed);
    // Auto-scroll log viewer to bottom
    if (changed.has("logEntries") && !this.logsPaused) {
      const viewer = this.shadowRoot?.getElementById("log-viewer");
      if (viewer) {
        viewer.scrollTop = viewer.scrollHeight;
      }
    }
  }
}
