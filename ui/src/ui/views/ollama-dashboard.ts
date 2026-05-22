import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { LocalInstance } from "../republic-types.js";

@customElement("hoc-ollama-dashboard")
export class OllamaDashboard extends LitElement {
  @property({ type: Array }) instances: LocalInstance[] = [];
  // These aliases allow app-render.ts to pass status/models without a separate call
  @property({ type: Object }) status: unknown = null;
  @property({ type: Array }) models: string[] = [];
  @property() onPull?: (model: string) => void;
  @property() onDelete?: (id: string, model: string) => void;
  @property() onRemove?: (id: string, model: string) => void;
  @property() onRefresh?: () => void;

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
    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      background: linear-gradient(90deg, var(--accent, #f97316), var(--accent-hover, #fb923c));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .header p {
      margin: 8px 0 0 0;
      color: var(--muted, #94a3b8);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg, 12px);
      padding: 20px;
      transition:
        transform 0.2s,
        box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
      border-color: var(--border-strong);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: var(--radius-full, 12px);
      font-size: 12px;
      font-weight: 600;
      background: var(--accent-subtle);
      color: var(--accent);
    }
    ul.model-list {
      list-style: none;
      padding: 0;
      margin: 16px 0 0 0;
    }
    ul.model-list li {
      padding: 10px 12px;
      background: var(--bg-muted);
      border-radius: var(--radius-sm, 6px);
      margin-bottom: 8px;
      font-family: monospace;
      color: var(--text);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .action-bar {
      margin-bottom: 24px;
      display: flex;
      gap: 12px;
      padding: 16px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg, 12px);
    }
    input[type="text"] {
      flex: 1;
      background: var(--bg-muted);
      border: 1px solid var(--input);
      border-radius: var(--radius-md, 6px);
      padding: 8px 12px;
      color: var(--text);
      font-family: monospace;
      font-size: 14px;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: var(--ring);
    }
    button {
      background: var(--accent);
      color: var(--accent-foreground, white);
      border: none;
      border-radius: var(--radius-md, 6px);
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s;
    }
    button:hover {
      background: var(--accent-hover);
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }
    .btn-danger {
      background: var(--danger-subtle);
      color: var(--danger);
    }
    .btn-danger:hover {
      background: var(--danger-muted);
    }
    .recommended {
      margin-bottom: 24px;
    }
    .rec-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .rec-item {
      background: var(--bg-muted, rgba(0, 0, 0, 0.15));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
      transition:
        background 0.2s,
        border-color 0.2s;
    }
    .rec-item:hover {
      background: var(--accent-subtle);
      border-color: var(--border-strong);
    }
    .rec-name {
      font-weight: 700;
      font-size: 13px;
      color: var(--text-strong);
    }
    .rec-desc {
      font-size: 11px;
      color: var(--muted);
      margin-top: 4px;
    }
  `;

  private readonly RECOMMENDED = [
    { tag: "llama3.2:1b", name: "Llama 3.2 1B", desc: "Fast citizen decisions" },
    { tag: "llama3.2:3b", name: "Llama 3.2 3B", desc: "Balanced reasoning" },
    { tag: "phi3:mini", name: "Phi-3 Mini", desc: "Small & capable" },
    { tag: "deepseek-coder-v2:lite", name: "DeepSeek Coder V2", desc: "Code generation" },
    { tag: "mistral:7b", name: "Mistral 7B", desc: "General purpose" },
    { tag: "qwen2.5:7b", name: "Qwen 2.5 7B", desc: "Multilingual" },
    { tag: "gemma2:2b", name: "Gemma 2 2B", desc: "Compact reasoning" },
    { tag: "codellama:7b", name: "Code Llama 7B", desc: "Code specialist" },
  ];

  render() {
    const ollamas = this.instances.filter((i) => i.type === "ollama");

    return html`
      <div class="header">
        <h1>🦙 Ollama</h1>
        <p>Local LLM inference — pull models, manage instances, and auto-route via the Gateway.</p>
      </div>

      <div class="action-bar">
        <input type="text" id="ollama-model" placeholder="Enter model tag (e.g. llama3.2:3b, mistral:7b)" />
        <button type="button" @click=${this.handlePull}>⬇ Pull Model</button>
      </div>

      <!-- Recommended Models -->
      <div class="card recommended" style="margin-bottom:24px">
        <h3 style="margin:0 0 4px 0;color:var(--text-strong,#f8fafc)">🏷️ Quick Pull — Recommended Models</h3>
        <p style="margin:0;font-size:12px;color:var(--muted,#94a3b8)">Click to pull directly from the Ollama library</p>
        <div class="rec-grid">
          ${this.RECOMMENDED.map(
            (m) => html`
            <div class="rec-item" @click=${() => this.onPull?.(m.tag)}>
              <div class="rec-name">${m.name}</div>
              <div class="rec-desc">${m.desc}</div>
              <div style="font-size:10px;font-family:monospace;color:var(--muted,#71717a);margin-top:4px">${m.tag}</div>
            </div>
          `,
          )}
        </div>
      </div>

      ${
        ollamas.length === 0
          ? html`
              <div class="grid">
                <div class="card">
                  <h3 style="margin: 0 0 12px 0; color: var(--text-strong, #f8fafc)">⚡ Status</h3>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: #f87171"></span>
                    <span style="color: #f87171; font-weight: 600">Not Connected</span>
                  </div>
                  <p style="margin: 0; font-size: 13px; color: var(--muted, #94a3b8)">
                    No Ollama server detected on port 11434. Install Ollama and run
                    <code
                      style="
                        color: var(--text, #e2e8f0);
                        background: var(--bg-muted, rgba(0, 0, 0, 0.3));
                        padding: 2px 6px;
                        border-radius: 4px;
                      "
                      >ollama serve</code
                    >
                    to enable local inference.
                  </p>
                </div>
                <div class="card">
                  <h3 style="margin: 0 0 12px 0; color: var(--text-strong, #f8fafc)">🚀 Quick Setup</h3>
                  <ol
                    style="
                      margin: 0;
                      padding-left: 20px;
                      color: var(--muted, #94a3b8);
                      font-size: 13px;
                      line-height: 1.8;
                    "
                  >
                    <li>Download from <span style="color: #fb923c">ollama.com</span></li>
                    <li>
                      Run
                      <code
                        style="
                          color: var(--text, #e2e8f0);
                          background: var(--bg-muted, rgba(0, 0, 0, 0.3));
                          padding: 2px 6px;
                          border-radius: 4px;
                        "
                        >ollama serve</code
                      >
                    </li>
                    <li>
                      Pull a model:
                      <code
                        style="
                          color: var(--text, #e2e8f0);
                          background: var(--bg-muted, rgba(0, 0, 0, 0.3));
                          padding: 2px 6px;
                          border-radius: 4px;
                        "
                        >ollama pull llama3.2:3b</code
                      >
                    </li>
                    <li>Return here — auto-detection activates</li>
                  </ol>
                </div>
                <div class="card">
                  <h3 style="margin: 0 0 12px 0; color: var(--text-strong, #f8fafc)">🔧 Capabilities</h3>
                  <ul
                    style="
                      margin: 0;
                      padding-left: 16px;
                      color: var(--muted, #94a3b8);
                      font-size: 13px;
                      line-height: 1.8;
                    "
                  >
                    <li>
                      🧠 <strong style="color: var(--text, #e2e8f0)">Local LLM Server</strong> — No cloud
                      dependency
                    </li>
                    <li>
                      ⚙️ <strong style="color: var(--text, #e2e8f0)">GGUF Format</strong> — Quantized for
                      efficiency
                    </li>
                    <li>
                      🎛️ <strong style="color: var(--text, #e2e8f0)">GPU Acceleration</strong> — CUDA / Metal /
                      ROCm
                    </li>
                    <li>
                      🔄 <strong style="color: var(--text, #e2e8f0)">Auto-Routing</strong> — Gateway selects best
                      model
                    </li>
                  </ul>
                </div>
              </div>
            `
          : html`
        <div class="grid">
          ${ollamas.map(
            (l) => html`
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
                <h3 style="margin:0;color:var(--text-strong,#f8fafc);display:flex;align-items:center;gap:8px">
                  🦙 ${l.url}
                </h3>
                <span class="badge">● ONLINE</span>
              </div>
              <p style="margin:0;font-size:13px;color:var(--muted,#94a3b8)">
                Last seen: ${this.formatDate(new Date(l.lastSeen).toISOString())}
              </p>
              <ul class="model-list">
                ${l.models.map(
                  (m) => html`
                  <li>
                    <span>🧠 ${m}</span>
                    <button type="button" class="btn-danger btn-sm" @click=${() => this.onRemove?.(l.id, m)}>🗑 Remove</button>
                  </li>
                `,
                )}
                ${
                  l.models.length === 0
                    ? html`
                        <li style="color: var(--muted, #94a3b8); font-style: italic; justify-content: center">
                          No model currently loaded
                        </li>
                      `
                    : ""
                }
              </ul>
            </div>
          `,
          )}
        </div>
      `
      }
    `;
  }

  private handlePull() {
    const input = this.shadowRoot?.querySelector("#ollama-model") as HTMLInputElement;
    if (input && input.value.trim() && this.onPull) {
      this.onPull(input.value.trim());
      input.value = "";
    }
  }

  private formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      const seconds = Math.floor((new Date().getTime() - d.getTime()) / 1000);
      if (seconds < 60) {
        return `${seconds}s ago`;
      }
      if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ago`;
      }
      if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)}h ago`;
      }
      return `${Math.floor(seconds / 86400)}d ago`;
    } catch {
      return dateStr;
    }
  }
}
