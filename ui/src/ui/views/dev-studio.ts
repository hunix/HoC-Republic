/**
 * Republic DevStudio — Full-Stack Development Environment
 *
 * A 4-panel IDE with:
 * - File Explorer (left sidebar)
 * - Code Editor with Monaco (center)
 * - Live Preview (right panel)
 * - Terminal + AI Prompt (bottom panel)
 *
 * Supports all project types from dev-orchestration:
 * web, api, mobile, microservice, ml, systems, fullstack
 */

import { html, nothing, type TemplateResult } from "lit";
import type {
  DevProjectSummary,
  DevProjectDetail,
  DevFileContent,
} from "../republic-types.ts";
import { paginate, getPage, setPage, renderPaginationControls } from "./pagination.js";
// oxlint-disable-next-line no-unused-vars
// oxlint-disable-next-line no-unused-vars
// oxlint-disable-next-line no-unused-vars
// oxlint-disable-next-line no-unused-vars
import { loadMonaco, createEditor, disposeEditor, isMonacoLoaded } from "./dev-studio-editor.js";
import {
  createPreviewBlobUrl,
  // oxlint-disable-next-line no-unused-vars
  revokePreviewBlobUrl,
  type PreviewFile,
} from "./dev-studio-preview.js";

// ─── Types ─────────────────────────────────────────────────────────

export interface DevStudioFile {
  path: string;
  language: string;
  content: string;
  linesOfCode: number;
  quality: number;
  dirty?: boolean;
}

export interface DevStudioTab {
  path: string;
  language: string;
  dirty: boolean;
}

export type PreviewMode = "deployment" | "webcontainer" | "none";
export type BottomPanel = "terminal" | "ai" | "problems" | "output";

export interface DevStudioProps {
  // Project data
  loading: boolean;
  projects: DevProjectSummary[];
  selectedProject: DevProjectDetail | null;
  detailLoading: boolean;

  // Editor state
  openFiles: DevStudioTab[];
  activeFile: string | null;
  fileContent: DevFileContent | null;
  fileLoading: boolean;
  fileDirty: boolean;

  // Preview
  previewMode: PreviewMode;
  previewUrl: string | null;
  previewRoutes: { path: string; label: string; filePath: string }[];
  previewActiveRoute: string;
  previewDevice: "desktop" | "tablet" | "mobile";
  previewInteractive: boolean;

  // Terminal / AI
  bottomPanel: BottomPanel;
  terminalOutput: string[];
  aiPrompt: string;
  aiSending: boolean;
  buildRunning: boolean;

  // GSD pipeline
  gsdTimeline: { timestamp: number; type: string; citizenName?: string; detail: string }[];
  gsdTeam: { name: string; specialization: string; role: string; tasksCompleted: number }[];
  gsdQualityScore: number;

  // Layout
  sidebarCollapsed: boolean;
  previewCollapsed: boolean;
  bottomCollapsed: boolean;

  // Actions
  onSelectProject: (projectId: string) => void;
  onCloseProject: () => void;
  onOpenFile: (projectId: string, path: string) => void;
  onCloseFile: (path: string) => void;
  onSaveFile: (projectId: string, path: string, content: string) => void;
  onCreateFile: (projectId: string, path: string) => void;
  onDeleteFile: (projectId: string, path: string) => void;
  onBuild: (projectId: string) => void;
  onRun: (projectId: string) => void;
  onTest: (projectId: string) => void;
  onDeploy: (projectId: string) => void;
  onAiPrompt: (projectId: string, prompt: string) => void;
  onAiPromptChange: (prompt: string) => void;
  onToggleSidebar: () => void;
  onTogglePreview: () => void;
  onToggleBottom: () => void;
  onBottomPanelChange: (panel: BottomPanel) => void;
  onPreviewRouteChange: (route: string) => void;
  onPreviewDeviceChange: (device: "desktop" | "tablet" | "mobile") => void;
  onPreviewInteractiveToggle: () => void;
  onRefresh: () => void;
  onIdeate: (config?: Record<string, unknown>) => void;
  onReRender: () => void;
}

// ─── Language Helpers ───────────────────────────────────────────────

function langIcon(lang: string): string {
  const icons: Record<string, string> = {
    typescript: "🔷", javascript: "🟡", python: "🐍", rust: "🦀",
    go: "🐹", csharp: "🟣", java: "☕", ruby: "💎",
    swift: "🍎", kotlin: "🟠", html: "🌐", css: "🎨",
    json: "📋", yaml: "📄", markdown: "📝", sql: "🗃️",
    dockerfile: "🐳", shell: "🖥️", toml: "⚙️", xml: "📰",
  };
  return icons[lang.toLowerCase()] || "📄";
}

function fileIcon(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const icons: Record<string, string> = {
    ts: "🔷", tsx: "🔷", js: "🟡", jsx: "🟡",
    py: "🐍", rs: "🦀", go: "🐹", cs: "🟣",
    html: "🌐", css: "🎨", json: "📋", md: "📝",
    yaml: "📄", yml: "📄", sql: "🗃️", sh: "🖥️",
    dockerfile: "🐳", toml: "⚙️", lock: "🔒",
  };
  if (path.includes("/")) {
    return icons[ext] || "📄";
  }
  // Special filenames
  if (path === "package.json") {return "📦";}
  if (path === "tsconfig.json") {return "🔧";}
  if (path === "README.md") {return "📖";}
  if (path === ".gitignore") {return "🙈";}
  return icons[ext] || "📄";
}

function inferMonacoLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
    py: "python", rs: "rust", go: "go", cs: "csharp",
    html: "html", css: "css", scss: "scss", less: "less",
    json: "json", yaml: "yaml", yml: "yaml", md: "markdown",
    sql: "sql", sh: "shell", bash: "shell", xml: "xml",
    toml: "toml", dockerfile: "dockerfile",
  };
  return map[ext] || "plaintext";
}

// ─── Main Render ───────────────────────────────────────────────────

export function renderDevStudio(props: DevStudioProps): TemplateResult {
  if (!props.selectedProject) {
    return renderProjectChooser(props);
  }

  return html`
    <div class="devstudio" style="
      display: grid;
      grid-template-columns: ${props.sidebarCollapsed ? "40px" : "260px"} 1fr ${props.previewCollapsed ? "0px" : "min(45%, 600px)"};
      grid-template-rows: 44px 1fr ${props.bottomCollapsed ? "36px" : "220px"};
      height: calc(100vh - 120px);
      gap: 0;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: var(--bg);
    ">
      <!-- Toolbar -->
      ${renderToolbar(props)}

      <!-- File Explorer -->
      ${renderFileExplorer(props)}

      <!-- Code Editor -->
      ${renderEditorPanel(props)}

      <!-- Preview -->
      ${props.previewCollapsed ? nothing : renderPreviewPanel(props)}

      <!-- Bottom Panel -->
      ${renderBottomPanel(props)}
    </div>
  `;
}

// ─── Project Chooser Filter State (module-scoped) ──────────────────
let _studioSearch = "";
let _studioSort: "name" | "health" | "files" | "loc" | "type" = "name";
let _studioSortDir: "asc" | "desc" = "asc";
let _studioTypeFilter = "";
let _studioHealthFilter: "" | "green" | "yellow" | "red" = "";

function renderProjectChooser(props: DevStudioProps): TemplateResult {
  // Apply client-side filtering
  let filtered = props.projects;

  if (_studioSearch) {
    const q = _studioSearch.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        (p.name?.toLowerCase().includes(q)) ||
        (p.description?.toLowerCase().includes(q)) ||
        (p.stack?.toLowerCase().includes(q)),
    );
  }

  if (_studioTypeFilter) {
    filtered = filtered.filter((p) => p.projectType === _studioTypeFilter);
  }

  if (_studioHealthFilter) {
    filtered = filtered.filter((p) => {
      const h = Math.round((p.buildHealth ?? 0) * 100);
      if (_studioHealthFilter === "green") {return h >= 80;}
      if (_studioHealthFilter === "yellow") {return h >= 50 && h < 80;}
      return h < 50; // red
    });
  }

  // Sort
  const dir = _studioSortDir === "asc" ? 1 : -1;
  filtered = [...filtered].toSorted((a, b) => {
    switch (_studioSort) {
      case "health":
        return ((a.buildHealth ?? 0) - (b.buildHealth ?? 0)) * dir;
      case "files":
        return ((a.filesWritten ?? 0) - (b.filesWritten ?? 0)) * dir;
      case "loc":
        return ((a.linesOfCode ?? 0) - (b.linesOfCode ?? 0)) * dir;
      case "type":
        return (a.projectType ?? "").localeCompare(b.projectType ?? "") * dir;
      default:
        return (a.name ?? "").localeCompare(b.name ?? "") * dir;
    }
  });

  const paged = paginate(filtered, getPage("studio-projects"), 12);

  // Collect unique project types for the filter dropdown
  const types = [...new Set(props.projects.map((p) => p.projectType).filter(Boolean))].toSorted();

  return html`
    <div class="view-enter" style="max-width:1200px;margin:0 auto">
      <!-- Hero -->
      <div style="
        background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-accent) 50%, var(--bg) 100%);
        border: 1px solid rgba(99,102,241,0.2);
        border-radius: 16px;
        padding: 48px 40px;
        margin-bottom: 24px;
        text-align: center;
        position: relative;
        overflow: hidden;
      ">
        <div style="
          position: absolute; inset: 0;
          background: radial-gradient(circle at 20% 50%, rgba(99,102,241,0.15), transparent 60%),
                      radial-gradient(circle at 80% 50%, rgba(16,185,129,0.1), transparent 60%);
        "></div>
        <div style="position:relative;z-index:1">
          <div style="font-size:48px;margin-bottom:12px">🏗️</div>
          <h1 style="font-size:28px;font-weight:700;margin:0 0 8px;
              background:linear-gradient(135deg,var(--info),var(--ok));-webkit-background-clip:text;
              -webkit-text-fill-color:transparent">
            Republic DevStudio
          </h1>
          <p style="color:var(--muted);font-size:14px;max-width:500px;margin:0 auto 24px">
            Full-stack IDE with live preview, AI-driven development, and deployment.
            Select a project or create one to get started.
          </p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button type="button" class="republic-btn republic-btn--accent"
              @click=${() => props.onIdeate()}
              style="border-radius:24px;padding:10px 24px;font-weight:600">
              ✨ AI Ideate New Project
            </button>
            <button type="button" class="republic-btn"
              @click=${() => props.onRefresh()}
              style="border-radius:24px;padding:10px 24px;
                background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.25);
                color:#fff;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)">
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      <!-- Search / Sort / Filter Bar -->
      <div style="
        display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;
        padding:12px 16px;background:rgba(255,255,255,0.03);
        border:1px solid rgba(255,255,255,0.07);border-radius:12px;
      ">
        <!-- Search -->
        <div style="flex:1;min-width:200px;position:relative">
          <input
            type="text"
            placeholder="Search projects…"
            .value=${_studioSearch}
            @input=${(e: Event) => {
              _studioSearch = (e.target as HTMLInputElement).value;
              setPage("studio-projects", 0);
              props.onReRender();
            }}
            style="
              width:100%;padding:8px 12px 8px 32px;border-radius:8px;
              border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);
              color:var(--text-strong);font-size:13px;outline:none;box-sizing:border-box;
            "
          />
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--muted)">🔍</span>
        </div>

        <!-- Sort -->
        <select
          @change=${(e: Event) => {
            _studioSort = (e.target as HTMLSelectElement).value as typeof _studioSort;
            setPage("studio-projects", 0);
            props.onReRender();
          }}
          style="
            padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
            background:rgba(255,255,255,0.04);color:var(--text-strong);font-size:12px;cursor:pointer;
          "
        >
          <option value="name" ?selected=${_studioSort === "name"}>Sort: Name</option>
          <option value="health" ?selected=${_studioSort === "health"}>Sort: Health</option>
          <option value="files" ?selected=${_studioSort === "files"}>Sort: Files</option>
          <option value="loc" ?selected=${_studioSort === "loc"}>Sort: LOC</option>
          <option value="type" ?selected=${_studioSort === "type"}>Sort: Type</option>
        </select>

        <!-- Sort Direction -->
        <button type="button"
          @click=${() => { _studioSortDir = _studioSortDir === "asc" ? "desc" : "asc"; props.onReRender(); }}
          style="
            padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
            background:rgba(255,255,255,0.04);color:var(--text-strong);cursor:pointer;font-size:12px;
          "
          title="Toggle sort direction"
        >${_studioSortDir === "asc" ? "↑ Asc" : "↓ Desc"}</button>

        <!-- Type Filter -->
        <select
          @change=${(e: Event) => {
            _studioTypeFilter = (e.target as HTMLSelectElement).value;
            setPage("studio-projects", 0);
            props.onReRender();
          }}
          style="
            padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
            background:rgba(255,255,255,0.04);color:var(--text-strong);font-size:12px;cursor:pointer;
          "
        >
          <option value="" ?selected=${!_studioTypeFilter}>All Types</option>
          ${types.map((t) => html`<option value=${t} ?selected=${_studioTypeFilter === t}>${t}</option>`)}
        </select>

        <!-- Health Filter -->
        <select
          @change=${(e: Event) => {
            _studioHealthFilter = (e.target as HTMLSelectElement).value as typeof _studioHealthFilter;
            setPage("studio-projects", 0);
            props.onReRender();
          }}
          style="
            padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
            background:rgba(255,255,255,0.04);color:var(--text-strong);font-size:12px;cursor:pointer;
          "
        >
          <option value="" ?selected=${!_studioHealthFilter}>All Health</option>
          <option value="green" ?selected=${_studioHealthFilter === "green"}>🟢 ≥80%</option>
          <option value="yellow" ?selected=${_studioHealthFilter === "yellow"}>🟡 50-79%</option>
          <option value="red" ?selected=${_studioHealthFilter === "red"}>🔴 <50%</option>
        </select>

        <!-- Result count -->
        <span style="font-size:11px;color:var(--muted);margin-left:auto">
          ${filtered.length}${filtered.length !== props.projects.length ? ` / ${props.projects.length}` : ""} projects
        </span>
      </div>

      <!-- Project Grid -->
      ${props.loading
        ? html`<div style="text-align:center;padding:40px;color:var(--muted)">
            <div style="font-size:32px;margin-bottom:8px">⏳</div>
            Loading projects...
          </div>`
        : filtered.length === 0
          ? html`<div style="text-align:center;padding:40px;color:var(--muted)">
              <div style="font-size:32px;margin-bottom:8px">📂</div>
              <p>${props.projects.length === 0 ? html`No projects yet. Click <strong>AI Ideate</strong> to create one.` : "No projects match your filters."}</p>
            </div>`
          : html`
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
              ${paged.items.map(p => renderProjectCard(p, props))}
            </div>
            ${renderPaginationControls(paged.page, paged.totalPages, (pg) => { setPage("studio-projects", pg); props.onReRender(); }, { totalItems: paged.totalItems })}
          `
      }
    </div>
  `;
}

function renderProjectCard(p: DevProjectSummary, props: DevStudioProps): TemplateResult {
  const typeColors: Record<string, string> = {
    software: "#818cf8", research: "#34d399", music: "#f472b6",
    "visual-art": "#fb923c", "3d-model": "#a78bfa", mixed: "#94a3b8",
  };
  const color = typeColors[p.projectType] || "#818cf8";
  const healthPct = Math.round((p.buildHealth ?? 0) * 100);

  return html`
    <div style="
      background: var(--card-highlight);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    " @click=${() => props.onSelectProject(p.id)}
       @mouseenter=${(e: Event) => ((e.currentTarget as HTMLElement).style.borderColor = `${color}44`)}
       @mouseleave=${(e: Event) => ((e.currentTarget as HTMLElement).style.borderColor = `var(--border)`)}>
      <div style="position:absolute;top:0;left:0;right:0;height:3px;
           background:linear-gradient(90deg,${color},${color}44)"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <h4 style="margin:0;font-size:15px;font-weight:600;color:var(--text-strong)">
            ${p.name}
          </h4>
          <span style="font-size:11px;color:${color};font-weight:500">${p.projectType}</span>
        </div>
        <span style="
          font-size:11px;padding:2px 8px;border-radius:10px;
          background:${healthPct >= 80 ? 'rgba(16,185,129,0.15)' : healthPct >= 50 ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)'};
          color:${healthPct >= 80 ? 'var(--ok)' : healthPct >= 50 ? 'var(--warn)' : 'var(--danger)'};
          font-weight:600;
        ">${healthPct}%</span>
      </div>
      <p style="font-size:12px;color:var(--muted);margin:0 0 12px;
         display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
        ${p.description || "No description"}
      </p>
      <div style="display:flex;gap:12px;font-size:11px;color:var(--muted)">
        <span>📄 ${p.filesWritten ?? 0} files</span>
        <span>🧪 ${p.testsWritten ?? 0} tests</span>
        <span>📊 ${p.linesOfCode ?? 0} LOC</span>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted)">
        <code style="font-size:10px;color:var(--muted)">${p.stack}</code>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05)">
        <button type="button"
          @click=${(e: Event) => { e.stopPropagation(); props.onRun(p.id); }}
          style="
            flex:1;padding:5px 0;border-radius:6px;border:1px solid rgba(99,102,241,0.25);
            background:rgba(99,102,241,0.08);color:#818cf8;cursor:pointer;
            font-size:11px;font-weight:500;transition:all 0.2s;
          "
          @mouseenter=${(e: Event) => ((e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.18)")}
          @mouseleave=${(e: Event) => ((e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.08)")}
        >▶ Run</button>
        <button type="button"
          @click=${(e: Event) => { e.stopPropagation(); props.onSelectProject(p.id); }}
          style="
            flex:1;padding:5px 0;border-radius:6px;border:1px solid rgba(255,255,255,0.1);
            background:rgba(255,255,255,0.04);color:var(--text-strong);cursor:pointer;
            font-size:11px;font-weight:500;transition:all 0.2s;
          "
          @mouseenter=${(e: Event) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)")}
          @mouseleave=${(e: Event) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)")}
        >📂 Open</button>
      </div>
    </div>
  `;
}

// ─── Toolbar ───────────────────────────────────────────────────────

function renderToolbar(props: DevStudioProps): TemplateResult {
  const p = props.selectedProject!;
  return html`
    <div style="
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      background: var(--bg-accent);
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    ">
      <button type="button" style="
        background:none;border:none;color:var(--muted);cursor:pointer;
        font-size:16px;padding:4px 8px;border-radius:4px;
      " @click=${() => props.onCloseProject()} title="Back to projects">←</button>

      <button type="button" style="
        background:none;border:none;cursor:pointer;font-size:14px;padding:4px;
        color:${props.sidebarCollapsed ? "var(--muted)" : "var(--info)"};
      " @click=${() => props.onToggleSidebar()} title="Toggle file explorer">📁</button>

      <div style="flex:1;display:flex;align-items:center;gap:8px;min-width:0">
        <span style="font-weight:600;color:var(--text-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${p.name}
        </span>
        <span style="
          font-size:10px;padding:2px 8px;border-radius:8px;
          background:rgba(99,102,241,0.15);color:var(--info);font-weight:500;
        ">${p.phase || p.status}</span>
        <code style="font-size:10px;color:var(--muted)">${p.stack}</code>
      </div>

      <!-- Action Buttons -->
      <div style="display:flex;gap:4px;align-items:center">
        <button type="button" class="republic-btn republic-btn--sm" style="font-size:11px;border-radius:6px"
          @click=${() => props.onBuild(p.id)} ?disabled=${props.buildRunning}>
          ${props.buildRunning ? "⏳" : "🔨"} Build
        </button>
        <button type="button" class="republic-btn republic-btn--sm" style="font-size:11px;border-radius:6px"
          @click=${() => props.onRun(p.id)}>
          ▶ Run
        </button>
        <button type="button" class="republic-btn republic-btn--sm" style="font-size:11px;border-radius:6px"
          @click=${() => props.onTest(p.id)}>
          🧪 Test
        </button>
        <button type="button" class="republic-btn republic-btn--sm republic-btn--accent" style="font-size:11px;border-radius:6px"
          @click=${() => props.onDeploy(p.id)}>
          🚀 Deploy
        </button>

        <div style="width:1px;height:20px;background:var(--border);margin:0 4px"></div>

        <button type="button" style="
          background:none;border:none;cursor:pointer;font-size:14px;padding:4px;
          color:${props.previewCollapsed ? "var(--muted)" : "var(--ok)"};
        " @click=${() => props.onTogglePreview()} title="Toggle preview">👁</button>

        <button type="button" style="
          background:none;border:none;cursor:pointer;font-size:14px;padding:4px;
          color:${props.bottomCollapsed ? "var(--muted)" : "var(--info)"};
        " @click=${() => props.onToggleBottom()} title="Toggle terminal">⌨</button>
      </div>
    </div>
  `;
}

// ─── File Explorer ─────────────────────────────────────────────────

function renderFileExplorer(props: DevStudioProps): TemplateResult {
  const p = props.selectedProject!;
  const files = p.files || [];

  if (props.sidebarCollapsed) {
    return html`
      <div style="
        grid-row: 2 / 4;
        background: var(--bg-accent);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 8px;
        gap: 4px;
      ">
        <button type="button" style="background:none;border:none;cursor:pointer;font-size:16px;padding:6px;
          color:var(--muted);border-radius:4px;"
          @click=${() => props.onToggleSidebar()} title="Expand sidebar">📁</button>
      </div>
    `;
  }

  // Group files by directory
  const tree = buildFileTree(files.map(f => f.path));

  return html`
    <div style="
      grid-row: 2 / 4;
      background: var(--bg-accent);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    ">
      <div style="
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 600;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border);
      ">
        <span>Explorer</span>
        <button type="button" style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px 4px;
          color:var(--muted);border-radius:3px;"
          @click=${() => props.onCreateFile(p.id, "untitled.ts")} title="New file">+</button>
      </div>
      <div style="overflow-y:auto;flex:1;padding:4px 0">
        ${renderFileTree(tree, p.id, props, 0)}
      </div>
      <div style="
        padding: 8px 12px;
        border-top: 1px solid var(--border);
        font-size: 11px;
        color: var(--muted);
      ">
        ${files.length} files · ${(p.linesOfCode ?? 0).toLocaleString()} LOC
      </div>
    </div>
  `;
}

interface FileTreeNode {
  name: string;
  path: string;
  children: FileTreeNode[];
  isDir: boolean;
}

function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const sorted = [...paths].toSorted();

  for (const p of sorted) {
    const parts = p.split("/");
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      let existing = current.find(n => n.name === part);
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          children: [],
          isDir: !isLast,
        };
        current.push(existing);
      }
      if (!isLast) {
        existing.isDir = true;
        current = existing.children;
      }
    }
  }

  return root;
}

function renderFileTree(nodes: FileTreeNode[], projectId: string, props: DevStudioProps, depth: number): TemplateResult {
  return html`
    ${nodes.map(node => node.isDir
      ? html`
        <div>
          <div style="
            padding: 3px 8px 3px ${8 + depth * 14}px;
            font-size: 12px;
            color: var(--muted);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span style="font-size:10px">📂</span>
            <span>${node.name}</span>
          </div>
          ${renderFileTree(node.children, projectId, props, depth + 1)}
        </div>`
      : html`
        <div style="
          padding: 3px 8px 3px ${8 + depth * 14}px;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          color: ${props.activeFile === node.path ? 'var(--info)' : 'var(--text-strong)'};
          background: ${props.activeFile === node.path ? 'rgba(99,102,241,0.1)' : 'transparent'};
          border-radius: 4px;
          margin: 0 4px;
        " @click=${() => props.onOpenFile(projectId, node.path)}
           title="${node.path}">
          <span style="font-size:10px">${fileIcon(node.path)}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${node.name}</span>
          ${props.openFiles.find(f => f.path === node.path)?.dirty ? html`<span style="color:var(--warn);font-size:8px">●</span>` : nothing}
        </div>`
    )}
  `;
}

// ─── Editor Panel ──────────────────────────────────────────────────

function renderEditorPanel(props: DevStudioProps): TemplateResult {
  const gridSpan = props.previewCollapsed ? "span 2" : "span 1";

  return html`
    <div style="
      grid-column: ${gridSpan};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg);
    ">
      <!-- Tab Bar -->
      <div style="
        display: flex;
        align-items: stretch;
        background: var(--bg-accent);
        border-bottom: 1px solid var(--border);
        overflow-x: auto;
        min-height: 32px;
      ">
        ${props.openFiles.length === 0
          ? html`<span style="padding:6px 12px;font-size:12px;color:var(--muted)">No files open</span>`
          : props.openFiles.map(tab => html`
            <div style="
              display: flex;
              align-items: center;
              gap: 4px;
              padding: 0 12px;
              font-size: 12px;
              cursor: pointer;
              border-right: 1px solid var(--border);
              color: ${props.activeFile === tab.path ? 'var(--text-strong)' : 'var(--muted)'};
              background: ${props.activeFile === tab.path ? 'rgba(99,102,241,0.08)' : 'transparent'};
              border-bottom: ${props.activeFile === tab.path ? '2px solid var(--info)' : '2px solid transparent'};
              white-space: nowrap;
              transition: all 0.15s;
            " @click=${() => props.onOpenFile(props.selectedProject!.id, tab.path)}>
              <span style="font-size:10px">${fileIcon(tab.path)}</span>
              <span>${tab.path.split("/").pop()}</span>
              ${tab.dirty ? html`<span style="color:var(--warn);font-size:8px">●</span>` : nothing}
              <button type="button" style="
                background:none;border:none;color:var(--muted);cursor:pointer;
                font-size:14px;padding:0 2px;margin-left:4px;line-height:1;
                opacity:0.5;
              " @click=${(e: Event) => { e.stopPropagation(); props.onCloseFile(tab.path); }}
                title="Close">×</button>
            </div>
          `)
        }
      </div>

      <!-- Editor Content -->
      <div style="flex:1;overflow:auto;position:relative">
        ${props.fileLoading
          ? html`<div style="display:flex;align-items:center;justify-content:center;height:100%;
              color:var(--muted);font-size:13px">⏳ Loading file...</div>`
          : props.fileContent
            ? renderCodeEditor(props)
            : html`
              <div style="
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;color:var(--muted);gap:8px;
              ">
                <div style="font-size:48px;opacity:0.2">💻</div>
                <p style="font-size:13px">Select a file from the explorer to start editing</p>
                <p style="font-size:11px;opacity:0.5">Or use the AI prompt below to generate code</p>
              </div>`
        }
      </div>
    </div>
  `;
}

function renderCodeEditor(props: DevStudioProps): TemplateResult {
  const file = props.fileContent!;
  const lines = file.content.split("\n");
  // oxlint-disable-next-line no-unused-vars
  const lang = inferMonacoLanguage(file.path);

  return html`
    <div style="font-family:'JetBrains Mono','Fira Code','Cascadia Code',monospace;font-size:13px;line-height:1.6">
      <!-- File info bar -->
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:6px 16px;background:var(--card-highlight);
        border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);
      ">
        <div style="display:flex;align-items:center;gap:8px">
          <span>${langIcon(file.language)} ${file.language}</span>
          <span>·</span>
          <span>${file.linesOfCode} lines</span>
          <span>·</span>
          <span>Quality: ${Math.round(file.quality * 100)}%</span>
        </div>
        <div style="display:flex;gap:6px">
          <button type="button" class="republic-btn republic-btn--sm" style="font-size:10px;padding:2px 8px;border-radius:4px"
            @click=${() => props.onSaveFile(props.selectedProject!.id, file.path, file.content)}>
            💾 Save
          </button>
        </div>
      </div>
      <!-- Code lines -->
      <div style="overflow:auto;padding:8px 0">
        ${lines.map((line, i) => html`
          <div style="
            display:flex;padding:0 16px;
            ${i % 2 === 0 ? 'background:var(--card-highlight)' : ''};
          ">
            <span style="
              min-width:48px;text-align:right;padding-right:16px;
              color:var(--muted);user-select:none;font-size:12px;
            ">${i + 1}</span>
            <pre style="margin:0;flex:1;overflow-x:auto;white-space:pre;
              color:var(--text-strong);tab-size:2">${line || " "}</pre>
          </div>
        `)}
      </div>
    </div>
  `;
}

// ─── Preview Panel ─────────────────────────────────────────────────

function renderPreviewPanel(props: DevStudioProps): TemplateResult {
  const deviceWidths = { desktop: "100%", tablet: "768px", mobile: "375px" };
  const deviceW = deviceWidths[props.previewDevice ?? "desktop"];
  const p = props.selectedProject!;

  // Auto-generate preview URL from project files if none exists
  let previewSrc = props.previewUrl;
  if (!previewSrc && p.files && p.files.length > 0) {
    const previewFiles: PreviewFile[] = p.files.map(f => ({
      path: f.path,
      content: (f as unknown as { content?: string }).content ?? `// ${f.path}`,
    }));
    previewSrc = createPreviewBlobUrl(previewFiles, p.name);
  }

  return html`
    <div style="
      grid-row: 2 / 3;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg);
      border-left: 1px solid var(--border);
    ">
      <!-- Preview Header with Route Dropdown -->
      <div style="
        padding: 6px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--border);
        background: var(--bg-accent);
        gap: 8px;
      ">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;min-width:0;flex:1">
          <span style="color:var(--ok);font-weight:600;white-space:nowrap">Preview</span>

          <!-- Route/Page Dropdown (Lovable-style) -->
          <select style="
            background: var(--card-highlight);
            border: 1px solid var(--border);
            border-radius: 6px;
            color: var(--text-strong);
            font-size: 11px;
            padding: 3px 8px;
            cursor: pointer;
            outline: none;
            min-width: 120px;
            max-width: 200px;
          " @change=${(e: Event) => props.onPreviewRouteChange((e.target as HTMLSelectElement).value)}>
            ${(props.previewRoutes ?? [{ path: "/", label: "Home" }]).map(r => html`
              <option value="${r.path}" ?selected=${props.previewActiveRoute === r.path}>
                ${r.label} — ${r.path}
              </option>
            `)}
          </select>

          <!-- Interactive Mode Toggle -->
          <button type="button" style="
            background: ${props.previewInteractive ? 'rgba(16,185,129,0.2)' : 'var(--card-highlight)'};
            border: 1px solid ${props.previewInteractive ? 'rgba(16,185,129,0.3)' : 'var(--border)'};
            border-radius: 5px;
            color: ${props.previewInteractive ? 'var(--ok)' : 'var(--muted)'};
            font-size: 10px;
            padding: 2px 8px;
            cursor: pointer;
            white-space: nowrap;
          " @click=${() => props.onPreviewInteractiveToggle()}
             title="Toggle interactive mode — click/type in preview">
            ${props.previewInteractive ? '🟢 Interactive' : '🔒 View Only'}
          </button>
        </div>

        <!-- Device Selector -->
        <div style="display:flex;gap:2px;background:var(--card-highlight);border-radius:6px;padding:2px">
          ${(["desktop", "tablet", "mobile"] as const).map(dev => html`
            <button type="button" style="
              background: ${props.previewDevice === dev ? 'rgba(99,102,241,0.2)' : 'transparent'};
              border: none;
              cursor: pointer;
              font-size: 12px;
              padding: 3px 8px;
              border-radius: 4px;
              color: ${props.previewDevice === dev ? 'var(--info)' : 'var(--muted)'};
              transition: all 0.15s;
            " @click=${() => props.onPreviewDeviceChange(dev)}
               title="${dev.charAt(0).toUpperCase() + dev.slice(1)}">
              ${dev === 'desktop' ? '🖥️' : dev === 'tablet' ? '📱' : '📲'}
            </button>
          `)}
        </div>
      </div>

      <!-- Preview Content -->
      <div style="flex:1;overflow:hidden;position:relative;background:var(--bg-elevated);
        display:flex;align-items:center;justify-content:center;padding:8px">
        ${previewSrc
          ? html`
            <div style="
              width: ${deviceW};
              max-width: 100%;
              height: 100%;
              transition: width 0.3s ease;
              border-radius: ${props.previewDevice !== 'desktop' ? '12px' : '0'};
              overflow: hidden;
              box-shadow: ${props.previewDevice !== 'desktop' ? '0 4px 24px rgba(0,0,0,0.4)' : 'none'};
              border: ${props.previewDevice !== 'desktop' ? '2px solid var(--border)' : 'none'};
            ">
              <iframe
                src="${previewSrc}"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                loading="lazy"
                style="width:100%;height:100%;border:none;background:#fff;
                  pointer-events:${props.previewInteractive ? 'auto' : 'none'}"
                title="Project preview — ${props.previewActiveRoute ?? '/'}"
              ></iframe>
            </div>`
          : html`
            <div style="
              display:flex;flex-direction:column;align-items:center;justify-content:center;
              height:100%;color:var(--muted);gap:8px;
            ">
              <div style="font-size:40px;opacity:0.2">🌐</div>
              <p style="font-size:12px;text-align:center;max-width:200px">
                Click <strong>Run</strong> to generate live preview from project files
              </p>
            </div>`
        }
      </div>
    </div>
  `;
}

// ─── Bottom Panel ──────────────────────────────────────────────────

function renderBottomPanel(props: DevStudioProps): TemplateResult {
  if (props.bottomCollapsed) {
    return html`
      <div style="
        grid-column: ${props.sidebarCollapsed ? '2' : '2'} / -1;
        background: var(--bg-accent);
        border-top: 1px solid var(--border);
        display: flex;
        align-items: center;
        padding: 0 12px;
        gap: 8px;
      ">
        ${renderBottomTabs(props)}
        <div style="flex:1"></div>
        <button type="button" style="background:none;border:none;cursor:pointer;font-size:14px;
          color:var(--muted);padding:4px" @click=${() => props.onToggleBottom()}>▲</button>
      </div>
    `;
  }

  return html`
    <div style="
      grid-column: ${props.sidebarCollapsed ? '2' : '2'} / -1;
      display: flex;
      flex-direction: column;
      background: var(--bg-accent);
      border-top: 1px solid var(--border);
      overflow: hidden;
    ">
      <!-- Panel tabs -->
      <div style="
        display: flex;
        align-items: center;
        padding: 0 12px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-accent);
        min-height: 30px;
      ">
        ${renderBottomTabs(props)}
        <div style="flex:1"></div>
        <button type="button" style="background:none;border:none;cursor:pointer;font-size:14px;
          color:var(--muted);padding:4px" @click=${() => props.onToggleBottom()}>▼</button>
      </div>

      <!-- Panel content -->
      <div style="flex:1;overflow-y:auto">
        ${props.bottomPanel === "terminal" ? renderTerminalContent(props)
          : props.bottomPanel === "ai" ? renderAiPromptContent(props)
          : props.bottomPanel === "problems" ? renderProblemsContent(props)
          : renderOutputContent(props)
        }
      </div>
    </div>
  `;
}

function renderBottomTabs(props: DevStudioProps): TemplateResult {
  const tabs: { id: BottomPanel; label: string; icon: string }[] = [
    { id: "terminal", label: "Terminal", icon: "⌨" },
    { id: "ai", label: "AI Assistant", icon: "✨" },
    { id: "problems", label: "Problems", icon: "⚠" },
    { id: "output", label: "Output", icon: "📤" },
  ];

  return html`
    ${tabs.map(t => html`
      <button type="button" style="
        background: none;
        border: none;
        cursor: pointer;
        font-size: 11px;
        padding: 6px 10px;
        color: ${props.bottomPanel === t.id ? 'var(--info)' : 'var(--muted)'};
        border-bottom: ${props.bottomPanel === t.id ? '2px solid var(--info)' : '2px solid transparent'};
        font-weight: ${props.bottomPanel === t.id ? '600' : '400'};
        transition: all 0.15s;
      " @click=${() => { props.onBottomPanelChange(t.id); if (props.bottomCollapsed) {props.onToggleBottom();} }}>
        ${t.icon} ${t.label}
      </button>
    `)}
  `;
}

function renderTerminalContent(props: DevStudioProps): TemplateResult {
  return html`
    <div style="
      padding: 8px 16px;
      font-family: 'JetBrains Mono','Fira Code',monospace;
      font-size: 12px;
      line-height: 1.5;
      color: var(--ok);
    ">
      ${props.terminalOutput.length === 0
        ? html`<div style="color:var(--muted)">$ Ready. Click Build, Run, or Test to see output here.</div>`
        : props.terminalOutput.map(line => html`<div>${line}</div>`)
      }
    </div>
  `;
}

function renderAiPromptContent(props: DevStudioProps): TemplateResult {
  const projectId = props.selectedProject?.id;
  return html`
    <div style="padding:12px 16px;display:flex;flex-direction:column;height:100%">
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <span>✨ Describe what to build. Citizens will form a team, code, peer-review, and deliver autonomously.</span>
        ${props.gsdQualityScore > 0 ? html`
          <span style="
            font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;
            background:${props.gsdQualityScore >= 70 ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.15)'};
            color:${props.gsdQualityScore >= 70 ? 'var(--ok)' : 'var(--warn)'};
          ">Quality: ${props.gsdQualityScore}%</span>
        ` : nothing}
      </div>
      <div style="display:flex;gap:8px;flex:1;min-height:0">
        <textarea style="
          flex:1;
          background:var(--card-highlight);
          border:1px solid var(--border);
          border-radius:8px;
          color:var(--text-strong);
          padding:10px 14px;
          font-size:13px;
          font-family:inherit;
          resize:none;
          outline:none;
          min-height:60px;
        " .value=${props.aiPrompt}
          @input=${(e: Event) => props.onAiPromptChange((e.target as HTMLTextAreaElement).value)}
          placeholder="e.g. Build a task management dashboard with real-time updates, auth, and dark mode..."
        ></textarea>
        <button type="button" class="republic-btn republic-btn--accent" style="
          border-radius:8px;padding:10px 20px;font-weight:600;
          align-self:flex-end;white-space:nowrap;
        " @click=${() => { if (projectId) {props.onAiPrompt(projectId, props.aiPrompt);} }}
          ?disabled=${props.aiSending || !props.aiPrompt.trim()}>
          ${props.aiSending ? "⏳ Army Working..." : "🚀 Deploy GSD Army"}
        </button>
      </div>

      <!-- Quick Actions -->
      <div style="margin-top:8px;font-size:11px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${["🧪 Add tests", "⚡ Optimize", "🎨 Add UI", "🛡️ Fix & Secure", "📱 Add mobile", "🔐 Add auth", "📊 Add analytics"].map(chip => html`
          <span style="cursor:pointer;padding:2px 8px;border-radius:10px;
            background:var(--card-highlight);border:1px solid var(--border);
            transition:all 0.15s;"
            @mouseenter=${(e: Event) => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.3)')}
            @mouseleave=${(e: Event) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')}
            @click=${() => props.onAiPromptChange(chip.slice(2).trim())}>
            ${chip}
          </span>
        `)}
      </div>

      <!-- GSD Team Visualization -->
      ${props.gsdTeam && props.gsdTeam.length > 0 ? html`
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Active Team</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${props.gsdTeam.map(m => html`
              <div style="
                display:flex;align-items:center;gap:4px;padding:3px 8px;
                background:rgba(99,102,241,0.08);border-radius:8px;
                border:1px solid rgba(99,102,241,0.15);font-size:10px;
              ">
                <span style="font-weight:600;color:var(--info)">${m.name}</span>
                <span style="color:var(--muted)">${m.specialization}</span>
                <span style="color:var(--muted)">·</span>
                <span style="color:var(--ok)">${m.role}</span>
              </div>
            `)}
          </div>
        </div>
      ` : nothing}
    </div>
  `;
}

function renderProblemsContent(props: DevStudioProps): TemplateResult {
  const p = props.selectedProject;
  if (!p) {return html`<div style="padding:12px 16px;color:var(--muted);font-size:12px">No project selected</div>`;}

  const issues: string[] = [];
  if ((p.testsFailed ?? 0) > 0) {issues.push(`🔴 ${p.testsFailed} test(s) failing`);}
  if ((p.buildHealth ?? 1) < 0.5) {issues.push(`⚠️ Build health is low: ${Math.round((p.buildHealth ?? 0) * 100)}%`);}
  if ((p.codeQuality ?? 1) < 0.6) {issues.push(`⚠️ Code quality: ${Math.round((p.codeQuality ?? 0) * 100)}%`);}

  return html`
    <div style="padding:12px 16px;font-size:12px">
      ${issues.length === 0
        ? html`<div style="color:var(--ok)">✅ No problems detected</div>`
        : issues.map(issue => html`<div style="padding:4px 0;color:var(--text-strong)">${issue}</div>`)
      }
    </div>
  `;
}

function renderOutputContent(_props: DevStudioProps): TemplateResult {
  return html`
    <div style="padding:12px 16px;color:var(--muted);font-size:12px">
      Build output will appear here after running Build or Deploy.
    </div>
  `;
}
