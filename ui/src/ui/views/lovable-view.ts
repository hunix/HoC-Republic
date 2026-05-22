import { html, nothing, type TemplateResult } from "lit";

// ─── Types ────────────────────────────────────────────────────────

type AIProvider = "gemini" | "anthropic" | "openai" | "groq";
type SandboxProvider = "vercel" | "e2b";
type GenerationMode = "clone" | "chat" | "edit";
type JobStatus =
  | "queued"
  | "scraping"
  | "generating"
  | "deploying"
  | "completed"
  | "failed"
  | "cancelled";

export interface LovableJob {
  id: string;
  citizenId: string;
  citizenName: string;
  mode: GenerationMode;
  sourceUrl?: string;
  status: JobStatus;
  progress: number;
  scrapedContent?: string;
  generatedCode?: string;
  deployUrl?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface LovableQueueStatus {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
}

export interface LovableProps {
  loading: boolean;
  jobs: LovableJob[];
  queueStatus: LovableQueueStatus | null;
  onRefresh: () => void;
  onClone: (config: Record<string, unknown>) => void;
  onCancelJob: (jobId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────

const STATUS_COLORS: Record<JobStatus, string> = {
  queued: "#94a3b8",
  scraping: "#f59e0b",
  generating: "#8b5cf6",
  deploying: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
  cancelled: "#6b7280",
};

const STATUS_ICONS: Record<JobStatus, string> = {
  queued: "⏳",
  scraping: "🔍",
  generating: "✨",
  deploying: "🚀",
  completed: "✅",
  failed: "❌",
  cancelled: "⛔",
};

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  scraping: "Scraping Site",
  generating: "Generating Code",
  deploying: "Deploying",
  completed: "Live",
  failed: "Failed",
  cancelled: "Cancelled",
};

const PROVIDER_META: Record<AIProvider, { label: string; color: string; icon: string }> = {
  gemini: { label: "Google Gemini", color: "#4285f4", icon: "💎" },
  anthropic: { label: "Anthropic Claude", color: "#d4a574", icon: "🧠" },
  openai: { label: "OpenAI GPT", color: "#10a37f", icon: "🤖" },
  groq: { label: "Groq", color: "#f55036", icon: "⚡" },
};

const PIPELINE_STAGES: JobStatus[] = ["scraping", "generating", "deploying", "completed"];

// ─── Helpers ──────────────────────────────────────────────────────

function formatElapsed(startMs: number, endMs?: number): string {
  const elapsed = (endMs ?? Date.now()) - startMs;
  const secs = Math.floor(elapsed / 1000);
  if (secs < 60) {
    return `${secs}s`;
  }
  if (secs < 3600) {
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ─── Module-level form state ──────────────────────────────────────

let _cloneUrl = "";
let _cloneProvider: AIProvider = "gemini";
let _cloneSandbox: SandboxProvider = "vercel";
let _cloneInstructions = "";
let _showCloneForm = false;
let _expandedJobId: string | null = null;
let _selectedJob: LovableJob | null = null;
let _selectedFile = 0;

// ─── File Parsing ─────────────────────────────────────────────────

interface ParsedFile {
  path: string;
  content: string;
  language: string;
}

function detectLanguage(filepath: string): string {
  const ext = filepath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    fountain: "text",
  };
  return map[ext] ?? "text";
}

function parseProjectFiles(code: string): ParsedFile[] {
  // Try multi-file format: "// --- FILE: src/App.tsx ---"
  const marker = /^\/\/\s*---\s*FILE:\s*(.+?)\s*---\s*$/gm;
  const parts: ParsedFile[] = [];
  let lastIndex = 0;
  let lastPath = "";
  let match: RegExpExecArray | null;

  while ((match = marker.exec(code)) !== null) {
    if (lastPath && lastIndex < match.index) {
      parts.push({
        path: lastPath,
        content: code.slice(lastIndex, match.index).trim(),
        language: detectLanguage(lastPath),
      });
    }
    lastPath = match[1].trim();
    lastIndex = match.index + match[0].length;
  }
  if (lastPath) {
    parts.push({
      path: lastPath,
      content: code.slice(lastIndex).trim(),
      language: detectLanguage(lastPath),
    });
  }

  // If no markers found, treat as single file
  if (parts.length === 0) {
    const isJsx =
      code.includes("import React") ||
      code.includes('from "react"') ||
      code.includes("from 'react'");
    return [
      {
        path: isJsx ? "src/App.tsx" : "output.txt",
        content: code,
        language: isJsx ? "typescript" : "text",
      },
    ];
  }
  return parts;
}

function buildPreviewHtml(files: ParsedFile[]): string {
  // Find HTML file first, or build one wrapping JS/TSX
  const htmlFile = files.find((f) => f.path.endsWith(".html"));
  if (htmlFile) {
    return htmlFile.content;
  }

  // Try to find main tsx/jsx/ts/js
  const mainFile =
    files.find((f) => /\.(tsx|jsx)$/.test(f.path)) ??
    files.find((f) => /main\.(ts|js)$/.test(f.path)) ??
    files.find((f) => /index\.(ts|js)$/.test(f.path));
  const cssFile = files.find((f) => f.path.endsWith(".css"));

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">`;
  html += `<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}`;
  if (cssFile) {
    html += cssFile.content;
  }
  html += `</style></head><body>`;
  html += `<div style="padding:40px"><div style="font-size:3rem;margin-bottom:16px">💜</div>`;
  html += `<h2 style="color:#a855f7;margin-bottom:8px">Project Preview</h2>`;
  html += `<p style="color:#8b949e;font-size:0.85rem;max-width:400px;margin:0 auto 16px">`;
  html += `This project contains ${files.length} file${files.length > 1 ? "s" : ""}. `;
  html += `Install dependencies and run locally for full interactivity.</p>`;
  if (mainFile) {
    html += `<div style="text-align:left;background:#161b22;border-radius:8px;padding:12px;margin-top:12px;max-height:300px;overflow:auto">`;
    html += `<pre style="font-size:0.72rem;color:#c9d1d9;font-family:'Fira Code',monospace;white-space:pre-wrap">${mainFile.content.slice(0, 2000)}</pre></div>`;
  }
  html += `</div></body></html>`;
  return html;
}

// ─── Project Detail Page ──────────────────────────────────────────

function renderProjectDetail(job: LovableJob): TemplateResult {
  const files = parseProjectFiles(job.generatedCode ?? "");
  const file = files[_selectedFile] ?? files[0];
  const domain = job.sourceUrl ? getDomainFromUrl(job.sourceUrl) : "Custom Project";
  const elapsed = formatElapsed(job.createdAt, job.completedAt);

  return html`
    <!-- Sticky Back Nav -->
    <div style="position:sticky;top:0;z-index:50;background:linear-gradient(180deg,rgba(15,15,20,0.98) 60%,transparent);padding:12px 0 20px 0;margin-bottom:8px">
      <button type="button" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:10px;border:1px solid rgba(168,85,247,0.2);background:rgba(168,85,247,0.06);color:#a855f7;font-size:0.82rem;font-weight:600;cursor:pointer;backdrop-filter:blur(12px);transition:all 0.2s;font-family:inherit;letter-spacing:0.5px"
              @click=${() => {
                _selectedJob = null;
                _selectedFile = 0;
              }}>
        <span style="font-size:1.1rem">←</span> Back to Projects
      </button>
    </div>

    <!-- Hero Banner -->
    <div style="border-radius:16px;overflow:hidden;background:linear-gradient(135deg,#1a0a2e,#0f0f23,#0a1628);padding:28px 32px;display:flex;align-items:center;gap:20px;margin-bottom:16px;border:1px solid rgba(168,85,247,0.15)">
      <div style="font-size:3rem;width:72px;height:72px;display:flex;align-items:center;justify-content:center;background:rgba(168,85,247,0.15);border-radius:16px;backdrop-filter:blur(8px)">💜</div>
      <div style="flex:1;min-width:0">
        <h2 style="font-size:1.3rem;font-weight:700;color:#fff;margin:0 0 4px 0">${domain}</h2>
        <div style="font-size:0.82rem;color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span>👤 ${job.citizenName}</span>
          <span style="background:rgba(168,85,247,0.2);padding:2px 10px;border-radius:12px;font-size:0.72rem;color:#a855f7">${job.mode.toUpperCase()}</span>
          <span>🕐 ${elapsed}</span>
          <span>📁 ${files.length} file${files.length > 1 ? "s" : ""}</span>
        </div>
      </div>
      ${
        job.sourceUrl
          ? html`
        <a href="${job.sourceUrl}" target="_blank" rel="noopener" style="padding:6px 14px;border-radius:8px;border:1px solid rgba(168,85,247,0.3);background:rgba(168,85,247,0.08);color:#a855f7;font-size:0.75rem;text-decoration:none;cursor:pointer;white-space:nowrap">🔗 Source ↗</a>
      `
          : nothing
      }
    </div>

    <!-- Three-Pane Layout: File Tree | Code | Preview -->
    <div style="display:grid;grid-template-columns:200px 1fr 1fr;gap:12px;height:520px;margin-bottom:16px">

      <!-- File Browser -->
      <div class="republic-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
        <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.72rem;font-weight:700;color:var(--text-strong,#e0e0e0);display:flex;align-items:center;gap:6px">
          📂 Files <span style="margin-left:auto;color:var(--muted,#999);font-weight:400">${files.length}</span>
        </div>
        <div style="flex:1;overflow-y:auto;padding:6px 0">
          ${files.map((f, i) => {
            const isActive = i === _selectedFile;
            const icon =
              f.language === "typescript"
                ? "📘"
                : f.language === "javascript"
                  ? "📒"
                  : f.language === "html"
                    ? "🌐"
                    : f.language === "css"
                      ? "🎨"
                      : f.language === "json"
                        ? "📋"
                        : f.language === "markdown"
                          ? "📝"
                          : "📄";
            return html`
              <div style="padding:5px 12px;cursor:pointer;font-size:0.72rem;font-family:'Fira Code',monospace;
                          display:flex;align-items:center;gap:6px;transition:all 0.15s;
                          background:${isActive ? "rgba(168,85,247,0.15)" : "transparent"};
                          color:${isActive ? "#a855f7" : "var(--muted,#999)"};
                          border-left:2px solid ${isActive ? "#a855f7" : "transparent"}"
                   @click=${(e: Event) => {
                     e.stopPropagation();
                     _selectedFile = i;
                   }}>
                <span>${icon}</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title=${f.path}>${f.path.split("/").pop()}</span>
              </div>`;
          })}
        </div>
      </div>

      <!-- Code Viewer -->
      <div class="republic-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
        <div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:6px">
          <div style="display:flex;gap:5px">
            <div style="width:9px;height:9px;border-radius:50%;background:#ff5f56"></div>
            <div style="width:9px;height:9px;border-radius:50%;background:#ffbd2e"></div>
            <div style="width:9px;height:9px;border-radius:50%;background:#27c93f"></div>
          </div>
          <span style="font-size:0.68rem;color:var(--muted,#999);font-family:monospace;margin-left:6px">${file?.path ?? "—"}</span>
          <span style="margin-left:auto;font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase">${file?.language ?? ""}</span>
        </div>
        <div style="flex:1;overflow:auto;background:#0d1117">
          <pre style="margin:0;padding:12px;font-size:0.72rem;line-height:1.6;color:#c9d1d9;font-family:'Fira Code','Cascadia Code',monospace;white-space:pre-wrap;word-break:break-word;counter-reset:line">${file?.content ?? ""}</pre>
        </div>
      </div>

      <!-- Live Preview -->
      <div class="republic-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
        <div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
          <span style="font-size:0.72rem;color:var(--muted,#999)">🖥️ Live Preview</span>
          <span style="margin-left:auto;font-size:0.6rem;color:#22c55e;display:flex;align-items:center;gap:4px">
            <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block"></span> Ready
          </span>
        </div>
        <div style="flex:1;background:#fff;position:relative">
          <iframe
            sandbox="allow-scripts"
            srcdoc=${buildPreviewHtml(files)}
            style="width:100%;height:100%;border:none;background:#fff"
            title="Live Preview"
          ></iframe>
        </div>
      </div>
    </div>

    <!-- Metadata Grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Job ID</div>
        <code style="font-size:0.72rem;color:#a855f7">${job.id.slice(0, 16)}…</code>
      </div>
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Citizen</div>
        <div style="font-size:0.85rem;font-weight:600;color:var(--text-strong,#e0e0e0)">${job.citizenName}</div>
      </div>
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Mode</div>
        <div style="font-size:0.85rem;color:#a855f7;text-transform:capitalize">${job.mode}</div>
      </div>
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Duration</div>
        <div style="font-size:0.85rem;color:var(--text-strong,#e0e0e0)">${elapsed}</div>
      </div>
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Files</div>
        <div style="font-size:0.85rem;font-weight:700;color:#22c55e">${files.length}</div>
      </div>
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Total Size</div>
        <div style="font-size:0.85rem;color:var(--text-strong,#e0e0e0)">${(files.reduce((s, f) => s + f.content.length, 0) / 1024).toFixed(1)} KB</div>
      </div>
    </div>
  `;
}

export function renderLovable(props: LovableProps): TemplateResult {
  const { loading, jobs, queueStatus, onRefresh } = props;

  if (loading && jobs.length === 0) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <span>Loading Open Lovable…</span>
      </div>
    `;
  }

  // If a project is selected, show the full detail page
  if (_selectedJob) {
    return html`
      <div class="republic-view">
        ${renderProjectDetail(_selectedJob)}
      </div>
    `;
  }

  const activeJobs = jobs.filter(
    (j) => j.status !== "completed" && j.status !== "failed" && j.status !== "cancelled",
  );
  const completedJobs = jobs.filter((j) => j.status === "completed");

  return html`
    <div class="republic-view">
      ${renderHero(jobs, queueStatus, onRefresh, loading)}
      ${renderActionBar()}
      ${_showCloneForm ? renderCloneForm(props) : nothing}
      ${activeJobs.length > 0 ? renderPipeline(activeJobs, props) : nothing}
      ${completedJobs.length > 0 ? renderCompletedGallery(completedJobs) : nothing}
      ${jobs.length === 0 && !_showCloneForm ? renderEmpty() : nothing}
    </div>
  `;
}

// ─── Hero Section ─────────────────────────────────────────────────

function renderHero(
  jobs: LovableJob[],
  queue: LovableQueueStatus | null,
  onRefresh: () => void,
  loading: boolean,
): TemplateResult {
  const active = jobs.filter(
    (j) => !["completed", "failed", "cancelled"].includes(j.status),
  ).length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const deployed = jobs.filter((j) => j.deployUrl).length;

  return html`
    <div class="republic-hero">
      <div class="republic-hero__header">
        <h2 class="republic-hero__title">
          <span style="font-size:1.4rem">💜</span> Open Lovable
        </h2>
        <div style="display:flex;gap:0.5rem;align-items:center">
          ${
            active > 0
              ? html`<span class="republic-hero__badge republic-hero__badge--live">✨ ${active} Building</span>`
              : nothing
          }
          <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm" @click=${onRefresh} ?disabled=${loading}>
            ${loading ? "⏳" : "↻"} Refresh
          </button>
        </div>
      </div>
      <div class="republic-metrics">
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${jobs.length}</div>
          <div class="republic-metric__label">Total Projects</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value republic-metric__value--blue">${active}</div>
          <div class="republic-metric__label">Building</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value republic-metric__value--green">${completed}</div>
          <div class="republic-metric__label">Completed</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${deployed}</div>
          <div class="republic-metric__label">Deployed</div>
        </div>
        ${
          queue
            ? html`
              <div class="republic-metric republic-metric--card">
                <div class="republic-metric__value">${queue.queued}</div>
                <div class="republic-metric__label">In Queue</div>
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

// ─── Action Bar ───────────────────────────────────────────────────

function renderActionBar(): TemplateResult {
  return html`
    <div class="republic-card republic-card--compact republic-card--wide"
         style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
      <button type="button" class="republic-btn ${_showCloneForm ? "" : "republic-btn--secondary"} republic-btn--sm"
              style="border-radius:20px;${_showCloneForm ? "background:linear-gradient(135deg,#a855f7,#7c3aed);box-shadow:0 2px 12px #a855f733" : ""}"
              @click=${() => {
                _showCloneForm = !_showCloneForm;
              }}>
        🌐 Clone Website
      </button>
      <div style="flex:1"></div>
      <span style="font-size:0.75rem;color:var(--muted)">
        AI-powered website cloning • Firecrawl + React generation
      </span>
    </div>
  `;
}

// ─── Clone Form ───────────────────────────────────────────────────

function renderCloneForm(props: LovableProps): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide"
         style="border:1px solid #a855f733;background:linear-gradient(135deg, rgba(168,85,247,0.05), rgba(124,58,237,0.03))">
      <div class="republic-card__header">
        <h4>🌐 Clone a Website</h4>
      </div>

      <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:16px">
        <!-- URL -->
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Website URL</label>
          <input class="republic-input" type="url" .value=${_cloneUrl}
                 placeholder="https://example.com — paste any website URL to clone"
                 @input=${(e: Event) => {
                   _cloneUrl = (e.target as HTMLInputElement).value;
                 }}
                 style="width:100%;font-size:0.9rem;padding:10px 14px" />
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:12px">
          <!-- AI Provider -->
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:0.75rem;color:var(--muted);font-weight:600">AI Provider</label>
            <select class="republic-input" style="padding:8px 10px"
                    @change=${(e: Event) => {
                      _cloneProvider = (e.target as HTMLSelectElement).value as AIProvider;
                    }}>
              ${(Object.keys(PROVIDER_META) as AIProvider[]).map(
                (p) => html`
                <option value=${p} ?selected=${p === _cloneProvider}>
                  ${PROVIDER_META[p].icon} ${PROVIDER_META[p].label}
                </option>
              `,
              )}
            </select>
          </div>

          <!-- Sandbox -->
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Deploy Target</label>
            <select class="republic-input" style="padding:8px 10px"
                    @change=${(e: Event) => {
                      _cloneSandbox = (e.target as HTMLSelectElement).value as SandboxProvider;
                    }}>
              <option value="vercel" ?selected=${_cloneSandbox === "vercel"}>▲ Vercel</option>
              <option value="e2b" ?selected=${_cloneSandbox === "e2b"}>🔲 E2B Sandbox</option>
            </select>
          </div>
        </div>

        <!-- Instructions -->
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Custom Instructions (optional)</label>
          <textarea class="republic-input" rows="3" .value=${_cloneInstructions}
                    placeholder="Add any customization instructions, e.g. 'Use dark theme, add animations, change the logo to...'"
                    @input=${(e: Event) => {
                      _cloneInstructions = (e.target as HTMLTextAreaElement).value;
                    }}
                    style="width:100%;resize:vertical;font-family:inherit;min-height:60px"></textarea>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm"
                @click=${() => {
                  _showCloneForm = false;
                }}>Cancel</button>
        <button type="button" class="republic-btn republic-btn--sm"
                style="background:linear-gradient(135deg,#a855f7,#7c3aed)"
                ?disabled=${!_cloneUrl}
                @click=${() => {
                  props.onClone({
                    url: _cloneUrl,
                    provider: _cloneProvider,
                    sandbox: _cloneSandbox,
                    instructions: _cloneInstructions || undefined,
                  });
                  _showCloneForm = false;
                  _cloneUrl = "";
                  _cloneInstructions = "";
                }}>
          ✨ Start Cloning
        </button>
      </div>
    </div>
  `;
}

// ─── Active Pipeline ──────────────────────────────────────────────

function renderPipeline(jobs: LovableJob[], props: LovableProps): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h4>✨ Build Pipeline</h4>
        <span class="republic-tag">${jobs.length} active</span>
      </div>
      <div class="republic-cards republic-cards--two">
        ${jobs.toSorted((a, b) => b.createdAt - a.createdAt).map((job) => renderPipelineCard(job, props))}
      </div>
    </div>
  `;
}

function renderPipelineCard(job: LovableJob, props: LovableProps): TemplateResult {
  const isActive = !["completed", "failed", "cancelled"].includes(job.status);
  const expanded = _expandedJobId === job.id;

  // Determine active stage index
  const stageIdx = PIPELINE_STAGES.indexOf(job.status);

  return html`
    <div class="republic-card republic-card--compact"
         style="border-left:3px solid ${STATUS_COLORS[job.status]};overflow:hidden;cursor:pointer"
         @click=${() => {
           _expandedJobId = expanded ? null : job.id;
         }}>

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="republic-tag" style="background:${STATUS_COLORS[job.status]}22;color:${STATUS_COLORS[job.status]};font-weight:700">
            ${STATUS_ICONS[job.status]} ${STATUS_LABELS[job.status]}
          </span>
          <span class="republic-tag republic-tag--sm" style="text-transform:uppercase">${job.mode}</span>
        </div>
        ${
          isActive
            ? html`
              <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm"
                      style="font-size:0.7rem;padding:2px 8px"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        props.onCancelJob(job.id);
                      }}>
                ⛔ Cancel
              </button>
            `
            : nothing
        }
      </div>

      <!-- Source URL -->
      ${
        job.sourceUrl
          ? html`
            <div style="font-size:0.82rem;font-weight:600;color:var(--text-strong);margin-bottom:4px;
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                 title=${job.sourceUrl}>
              🌐 ${getDomainFromUrl(job.sourceUrl)}
            </div>
            <div style="font-size:0.7rem;color:var(--muted);margin-bottom:8px;
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${job.sourceUrl}
            </div>
          `
          : nothing
      }

      <!-- Multi-stage pipeline -->
      <div style="display:flex;gap:2px;margin-bottom:8px;align-items:center">
        ${PIPELINE_STAGES.map((stage, i) => {
          const isPast = stageIdx > i;
          const isCurrent = stageIdx === i;
          const color = isPast
            ? "#22c55e"
            : isCurrent
              ? STATUS_COLORS[job.status]
              : "var(--border, #333)";
          return html`
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="width:100%;height:4px;border-radius:2px;
                          background:${isPast || isCurrent ? color : "var(--border, #333)"};
                          ${isCurrent ? `box-shadow:0 0 8px ${color}60;animation:pulse-glow 2s ease-in-out infinite` : ""}">
              </div>
              <span style="font-size:0.62rem;color:${isPast || isCurrent ? color : "var(--muted)"};text-transform:capitalize;
                           font-weight:${isCurrent ? "700" : "400"}">
                ${STATUS_LABELS[stage]}
              </span>
            </div>
          `;
        })}
      </div>

      <!-- Progress -->
      ${
        job.progress > 0
          ? html`
            <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--muted);margin-bottom:4px">
              <span>${STATUS_LABELS[job.status]}</span>
              <span>${job.progress}%</span>
            </div>
            <div style="height:4px;background:var(--border, #222);border-radius:2px;overflow:hidden;margin-bottom:8px">
              <div style="height:100%;width:${job.progress}%;background:linear-gradient(90deg,#a855f7,#7c3aed);
                          border-radius:2px;transition:width 0.5s ease"></div>
            </div>
          `
          : nothing
      }

      <!-- Timing + citizen -->
      <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--muted)">
        <span>Started by <strong>${job.citizenName}</strong></span>
        <span>🕐 ${formatElapsed(job.createdAt)}</span>
      </div>

      <!-- Error -->
      ${
        job.error
          ? html`
            <div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:#ef444420;
                        color:#ef4444;font-size:0.72rem;font-family:monospace">
              ${job.error}
            </div>
          `
          : nothing
      }

      <!-- Expanded: Code preview -->
      ${
        expanded && job.generatedCode
          ? html`
            <div style="margin-top:12px;border-top:1px solid var(--border, #222);padding-top:12px">
              <div style="font-size:0.72rem;color:var(--muted);font-weight:600;margin-bottom:6px">Generated Code Preview</div>
              <div style="max-height:200px;overflow:auto;background:#0d1117;border-radius:8px;padding:10px 12px;
                          font-family:'Fira Code','Cascadia Code',monospace;font-size:0.72rem;line-height:1.5;color:#c9d1d9">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                  <span style="width:10px;height:10px;border-radius:50%;background:#ff5f57;display:inline-block"></span>
                  <span style="width:10px;height:10px;border-radius:50%;background:#febc2e;display:inline-block"></span>
                  <span style="width:10px;height:10px;border-radius:50%;background:#28c840;display:inline-block"></span>
                  <span style="margin-left:8px;font-size:0.65rem;color:#8b949e">App.tsx</span>
                </div>
                <pre style="margin:0;white-space:pre-wrap;word-break:break-all">${job.generatedCode.slice(0, 1000)}${job.generatedCode.length > 1000 ? "\n..." : ""}</pre>
              </div>
            </div>
          `
          : nothing
      }
    </div>
  `;
}

// ─── Completed Gallery ────────────────────────────────────────────

function renderCompletedGallery(jobs: LovableJob[]): TemplateResult {
  const sorted = [...jobs].toSorted((a, b) => b.createdAt - a.createdAt);

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h4>🎉 Completed Projects</h4>
        <span class="republic-tag republic-tag--green">${jobs.length} shipped</span>
      </div>
      <div class="republic-cards republic-cards--three">
        ${sorted.map((job) => renderCompletedCard(job))}
      </div>
    </div>
  `;
}

function renderCompletedCard(job: LovableJob): TemplateResult {
  const domain = job.sourceUrl ? getDomainFromUrl(job.sourceUrl) : "Custom";

  return html`
    <div class="republic-card republic-card--compact" style="overflow:hidden;padding:0;cursor:pointer;transition:all 0.2s"
         @click=${() => {
           _selectedJob = job;
           _selectedFile = 0;
         }}
         @mouseenter=${(e: Event) => {
           (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 30px rgba(168,85,247,0.15)";
           (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
         }}
         @mouseleave=${(e: Event) => {
           (e.currentTarget as HTMLElement).style.boxShadow = "";
           (e.currentTarget as HTMLElement).style.transform = "";
         }}>
      <!-- Preview header -->
      <div style="width:100%;aspect-ratio:16/9;background:linear-gradient(135deg, #1a0a2e 0%, #0f0f23 50%, #0a1628 100%);
                  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;position:relative">
        <span style="font-size: 2.5rem">${job.status === "completed" ? "✅" : "❌"}</span>
        <span style="color: ${job.status === "completed" ? "#22c55e" : "#ef4444"}; font-size: 0.75rem; font-weight: 600;text-transform:uppercase;letter-spacing:2px">
          ${job.status === "completed" ? "Completed" : job.status}
        </span>
        <span style="position:absolute;bottom:8px;font-size:0.62rem;color:#a855f7;opacity:0.7">Click to open project →</span>
      </div>

      <!-- Info -->
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:4px">
        <div style="font-size:0.82rem;font-weight:600;color:var(--text-strong);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
             title=${job.sourceUrl ?? "Chat-generated"}>
          ${domain}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="republic-tag republic-tag--sm" style="background:#a855f722;color:#a855f7">
            ${job.mode === "clone" ? "🌐 Clone" : job.mode === "chat" ? "💬 Chat" : "✏️ Edit"}
          </span>
          <span style="font-size:0.72rem;color:var(--muted)">
            ${formatElapsed(job.createdAt, job.completedAt)}
          </span>
          <span style="font-size:0.72rem;color:var(--muted);margin-left:auto">
            by ${job.citizenName}
          </span>
        </div>
        ${
          job.sourceUrl
            ? html`
              <div style="font-size:0.7rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">
                🔗 ${job.sourceUrl}
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

// ─── Empty State ──────────────────────────────────────────────────

function renderEmpty(): TemplateResult {
  return html`
    <div class="republic-empty">
      <div class="republic-empty__icon">💜</div>
      <h3>No Projects Yet</h3>
      <p>
        Clone any website and recreate it as a modern React app using AI. Just paste a URL and let Open
        Lovable do the rest.
      </p>
    </div>
  `;
}
