import { html, nothing, type TemplateResult } from "lit";
import type {
  DevProjectsStatus,
  DevProjectSummary,
  DevProjectDetail,
  DevFileContent,
  InnovationSummary,
} from "../republic-types.ts";
import { icon } from "../icons.js";
import { paginate, getPage, setPage, renderPaginationControls } from "./pagination.js";

// ─── Ideation Config ──────────────────────────────────────────────

export interface IdeationConfig {
  projectType: string;
  category: string;
  templateId: string;
  name: string;
  description: string;
  technologies: string[];
  teamSize: number;
  priority: string;
  deadline: string;
  scheduleAt: string;
  autoAssign: boolean;
  autoFix: boolean;
}

// ─── Types ────────────────────────────────────────────────────────

export interface DevProjectsProps {
  loading: boolean;
  status: DevProjectsStatus | null;
  selectedProject: DevProjectDetail | null;
  detailLoading: boolean;
  fileContent: DevFileContent | null;
  fileLoading: boolean;
  onSelectProject: (projectId: string) => void;
  onCloseDetail: () => void;
  onRefresh: () => void;
  /** Lightweight re-render trigger (no data reload). Used by the ideation dialog. */
  onReRender?: () => void;
  onDownloadProject?: (projectId: string) => void;
  onClearAll?: () => void;
  onConfirmClearAll?: () => void;
  onCancelClearAll?: () => void;
  confirmingClearAll?: boolean;
  onForceIdeate?: (config: IdeationConfig) => void;
  onViewFile?: (projectId: string, filePath: string) => void;
  onCloseFile?: () => void;
  onDownloadFile?: (file: DevFileContent) => void;
}

// ─── Project Type Helpers ─────────────────────────────────────

const PROJECT_TYPES = [
  { id: "software", icon: "💻", label: "Software" },
  { id: "music", icon: "🎵", label: "Music" },
  { id: "visual-art", icon: "🎨", label: "Visual Art" },
  { id: "literature", icon: "📝", label: "Literature" },
  { id: "research", icon: "🔬", label: "Research" },
  { id: "video", icon: "📽️", label: "Video" },
  { id: "mixed", icon: "🔮", label: "Mixed" },
] as const;

const CATEGORIES: Record<string, { id: string; label: string }[]> = {
  software: [
    { id: "web-app", label: "Web App" },
    { id: "api", label: "REST API" },
    { id: "mobile", label: "Mobile App" },
    { id: "game-2d", label: "2D Game" },
    { id: "game-3d", label: "3D Game" },
    { id: "cli", label: "CLI Tool" },
    { id: "ml-pipeline", label: "ML Pipeline" },
    { id: "dashboard", label: "Dashboard" },
    { id: "microservice", label: "Microservice" },
    { id: "web3", label: "Web3 / DApp" },
    { id: "iot", label: "IoT" },
    { id: "systems", label: "Systems" },
    { id: "extension", label: "Extension" },
    { id: "library", label: "Library / SDK" },
    { id: "other", label: "Other" },
  ],
  music: [
    { id: "album", label: "Album" },
    { id: "production", label: "Production" },
    { id: "dj-set", label: "DJ Set" },
    { id: "composition", label: "Composition" },
    { id: "lyrics", label: "Lyrics Writing" },
    { id: "soundtrack", label: "Soundtrack" },
  ],
  "visual-art": [
    { id: "gallery", label: "Art Gallery" },
    { id: "branding", label: "Brand Identity" },
    { id: "illustration", label: "Illustration" },
    { id: "3d-art", label: "3D Art" },
    { id: "ui-design", label: "UI/UX Design" },
    { id: "motion", label: "Motion Graphics" },
  ],
  literature: [
    { id: "poetry", label: "Poetry Collection" },
    { id: "novel", label: "Novel / Story" },
    { id: "essays", label: "Essays" },
    { id: "journalism", label: "Journalism" },
    { id: "screenplay", label: "Screenplay" },
  ],
  research: [
    { id: "paper", label: "Research Paper" },
    { id: "thesis", label: "Thesis" },
    { id: "survey", label: "Literature Survey" },
    { id: "experiment", label: "Experiment" },
    { id: "data-analysis", label: "Data Analysis" },
  ],
  video: [
    { id: "short-film", label: "Short Film" },
    { id: "documentary", label: "Documentary" },
    { id: "animation", label: "Animation" },
    { id: "tutorial", label: "Tutorial" },
    { id: "music-video", label: "Music Video" },
  ],
  mixed: [
    { id: "multimedia", label: "Multimedia" },
    { id: "interactive", label: "Interactive Experience" },
    { id: "vr", label: "VR Experience" },
    { id: "ar", label: "AR Experience" },
    { id: "installation", label: "Installation" },
  ],
};

const TECH_OPTIONS: Record<string, string[]> = {
  languages: [
    "TypeScript",
    "JavaScript",
    "Python",
    "Go",
    "Rust",
    "C#",
    "Dart",
    "Solidity",
    "LaTeX",
    "LilyPond",
    "SVG",
    "HTML",
    "CSS",
    "SQL",
    "Shell",
  ],
  frameworks: [
    "React",
    "Next.js",
    "Vue",
    "Angular",
    "Svelte",
    "FastAPI",
    "Express",
    "Gin",
    "Actix",
    "Flutter",
    "ASP.NET",
    "PyTorch",
    "TensorFlow",
    "Three.js",
    "Tailwind",
  ],
  databases: [
    "PostgreSQL",
    "MySQL",
    "SQLite",
    "MongoDB",
    "Redis",
    "Firebase",
    "InfluxDB",
    "DynamoDB",
    "Supabase",
  ],
  infrastructure: [
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "GCP",
    "Vercel",
    "IPFS",
    "Ethereum",
    "MQTT",
    "GPU",
  ],
};

const PRIORITIES = ["low", "normal", "high", "critical"] as const;
const DEADLINES = [
  { id: "1h", label: "1 Hour" },
  { id: "4h", label: "4 Hours" },
  { id: "1d", label: "1 Day" },
  { id: "3d", label: "3 Days" },
  { id: "1w", label: "1 Week" },
  { id: "open", label: "Open-ended" },
] as const;

function projectTypeIcon(type: string): string {
  return PROJECT_TYPES.find((t) => t.id === type)?.icon ?? "📦";
}

function projectTypeLabel(type: string): string {
  return PROJECT_TYPES.find((t) => t.id === type)?.label ?? type;
}

function metricLabel(type: string, metric: "health" | "quality"): string {
  if (metric === "health") {
    const map: Record<string, string> = {
      music: "Mix Quality",
      "visual-art": "Composition",
      literature: "Coherence",
      research: "Rigor",
      video: "Production",
    };
    return map[type] ?? "Build Health";
  }
  const map: Record<string, string> = {
    music: "Sound Design",
    "visual-art": "Visual Polish",
    literature: "Prose Quality",
    research: "Methodology",
    video: "Edit Quality",
  };
  return map[type] ?? "Code Quality";
}

// ─── Ideation Dialog State (module-level singleton) ─────────────

let _ideationOpen = false;
let _ideationConfig: IdeationConfig = makeDefaultConfig();
let _selectedTechs = new Set<string>();

function makeDefaultConfig(): IdeationConfig {
  return {
    projectType: "software",
    category: "web-app",
    templateId: "random",
    name: "",
    description: "",
    technologies: [],
    teamSize: 3,
    priority: "normal",
    deadline: "1d",
    scheduleAt: "now",
    autoAssign: true,
    autoFix: true,
  };
}

function openIdeation(): void {
  _ideationOpen = true;
  _ideationConfig = makeDefaultConfig();
  _selectedTechs = new Set<string>();
}

function closeIdeation(): void {
  _ideationOpen = false;
}

// ─── Main Render ──────────────────────────────────────────────────

export function renderDevProjects(props: DevProjectsProps): TemplateResult {
  const { loading, status, selectedProject, detailLoading } = props;

  // Only show full-screen loader on initial load when there's NO data yet.
  // Quiet re-polls should NOT destroy the current view (especially open dialogs).
  if (loading && !status && !_ideationOpen) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading dev projects…</p>
      </div>
    `;
  }

  if (!status) {
    return html`
      <div class="republic-card">
        <p class="republic-card__empty">Dev orchestration not yet active</p>
      </div>
    `;
  }

  // If a project is selected, show the detail view
  if (selectedProject) {
    return renderProjectDetail(selectedProject, props);
  }

  return html`
    <div class="republic-view republic-dev">
      <!-- Hero -->
      <div class="republic-hero republic-hero--dev">
        <div class="republic-hero__header">
          <h2 class="republic-hero__title">${icon("cpu")} Dev Projects</h2>
          <div style="display:flex;gap:8px;align-items:center">
            ${
              props.onForceIdeate
                ? html`<button type="button" class="republic-btn republic-btn--secondary" @click=${() => {
                    openIdeation();
                    props.onRefresh();
                  }}>⚡ Force Ideation</button>`
                : nothing
            }
            ${
              props.onClearAll && status.totalProjects > 0
                ? html`<span>
                  ${props.confirmingClearAll
                    ? html`<span style="display:flex;align-items:center;gap:6px">
                        <span style="font-size:0.8rem;color:var(--danger,#ef4444)">Really clear all?</span>
                        <button type="button" class="republic-btn republic-btn--sm republic-btn--danger" @click=${() => props.onClearAll!()}>Yes, clear</button>
                        <button type="button" class="republic-btn republic-btn--sm" @click=${() => props.onCancelClearAll?.()}>Cancel</button>
                      `
                    : html`<button type="button" class="republic-btn republic-btn--sm republic-btn--danger" @click=${() => props.onConfirmClearAll?.()}>🗑 Clear All</button>`
                  }
                </span>`
                : nothing
            }
            <button type="button" class="republic-btn republic-btn--sm" @click=${props.onRefresh}>↻ Refresh</button>
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="republic-metrics republic-metrics--grid">
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${status.totalProjects}</div>
          <div class="republic-metric__label">Projects</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${status.totalInnovations}</div>
          <div class="republic-metric__label">Innovations</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${status.projects.filter((p) => p.status === "active" || p.status === "in-progress").length}</div>
          <div class="republic-metric__label">Active</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${status.innovations.filter((i) => i.implemented).length}</div>
          <div class="republic-metric__label">Implemented</div>
        </div>
      </div>

      <!-- Detail Loading Overlay -->
      ${
        detailLoading
          ? html`
              <div class="republic-loading">
                <div class="republic-loading__spinner"></div>
                <p>Loading project details…</p>
              </div>
            `
          : nothing
      }

      <!-- Project Cards -->
      ${renderProjectList(status.projects, props)}

      <!-- Innovations -->
      ${renderInnovations(status.innovations)}

      <!-- Ideation Dialog Overlay -->
      ${_ideationOpen ? renderIdeationDialog(props) : nothing}
    </div>
  `;
}

// ─── Ideation Dialog ──────────────────────────────────────────────

function renderIdeationDialog(props: DevProjectsProps): TemplateResult {
  const cfg = _ideationConfig;
  const cats = CATEGORIES[cfg.projectType] ?? [];

  // Use lightweight re-render (no data reload) for form interactions.
  // Falls back to onRefresh if onReRender not provided.
  const reRender = props.onReRender ?? props.onRefresh;

  return html`
    <div class="ideation-overlay" @click=${(e: Event) => {
      if ((e.target as HTMLElement).classList.contains("ideation-overlay")) {
        closeIdeation();
        reRender();
      }
    }}>
      <div class="ideation-dialog" @click=${(e: Event) => e.stopPropagation()}>
        <style>
          .ideation-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 9999; backdrop-filter: blur(4px);
            animation: fadeIn 0.2s ease;
          }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(30px); opacity:0; } to { transform: translateY(0); opacity:1; } }
          .ideation-dialog {
            background: var(--card, linear-gradient(145deg, #0f172a 0%, #1e293b 100%));
            border: 1px solid var(--republic-glass-border, rgba(99,102,241,0.3));
            border-radius: 16px; width: min(720px, 92vw); max-height: 88vh;
            overflow-y: auto; padding: 0;
            box-shadow: 0 24px 48px rgba(0,0,0,0.25), 0 0 80px rgba(99,102,241,0.08);
            animation: slideUp 0.3s ease;
            color: var(--text, inherit);
          }
          .ideation-dialog::-webkit-scrollbar { width: 6px; }
          .ideation-dialog::-webkit-scrollbar-track { background: transparent; }
          .ideation-dialog::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 3px; }
          .ideation-header {
            padding: 24px 28px 16px; border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
            display: flex; justify-content: space-between; align-items: center;
            position: sticky; top: 0; background: var(--card, linear-gradient(145deg, #0f172a, #1e293b));
            z-index: 2; border-radius: 16px 16px 0 0;
          }
          .ideation-header h2 {
            margin: 0; font-size: 1.3rem; color: var(--text-strong, #e2e8f0);
            display: flex; align-items: center; gap: 10px;
          }
          .ideation-header h2 span { font-size: 1.6rem; }
          .ideation-close {
            background: var(--republic-glass-hover, rgba(255,255,255,0.06)); border: 1px solid var(--border, rgba(255,255,255,0.1));
            color: var(--muted, #94a3b8); width: 36px; height: 36px; border-radius: 10px;
            font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.15s;
          }
          .ideation-close:hover { background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }

          .ideation-body { padding: 20px 28px 28px; }
          .ideation-section { margin-bottom: 22px; }
          .ideation-section-title {
            font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.08em; color: var(--accent, #6366f1); margin-bottom: 10px;
          }

          /* Type Cards */
          .ideation-types {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px;
          }
          .ideation-type-card {
            background: var(--republic-glass-hover, rgba(255,255,255,0.03)); border: 1.5px solid var(--border, rgba(255,255,255,0.08));
            border-radius: 10px; padding: 12px 6px; text-align: center; cursor: pointer;
            transition: all 0.15s; color: var(--muted, #94a3b8);
          }
          .ideation-type-card:hover { background: rgba(99,102,241,0.08); border-color: rgba(99,102,241,0.3); color: var(--text-strong, #e2e8f0); }
          .ideation-type-card[data-selected="true"] {
            background: rgba(99,102,241,0.12); border-color: #6366f1; color: var(--text-strong, #e2e8f0);
            box-shadow: 0 0 12px rgba(99,102,241,0.15);
          }
          .ideation-type-card .type-icon { font-size: 1.5rem; display: block; margin-bottom: 4px; }
          .ideation-type-card .type-label { font-size: 0.72rem; font-weight: 500; }

          /* Form Controls */
          .ideation-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
          .ideation-row--3 { grid-template-columns: 1fr 1fr 1fr; }
          .ideation-field { display: flex; flex-direction: column; gap: 5px; }
          .ideation-field label {
            font-size: 0.73rem; font-weight: 500; color: var(--muted, #94a3b8); text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .ideation-field input, .ideation-field select, .ideation-field textarea {
            background: var(--republic-glass-hover, rgba(255,255,255,0.04)); border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 8px; padding: 9px 12px; color: var(--text-strong, #e2e8f0); font-size: 0.85rem;
            font-family: inherit; outline: none; transition: border-color 0.15s;
          }
          .ideation-field input:focus, .ideation-field select:focus, .ideation-field textarea:focus {
            border-color: rgba(99,102,241,0.5); box-shadow: 0 0 0 2px rgba(99,102,241,0.1);
          }
          .ideation-field select { cursor: pointer; }
          .ideation-field textarea { resize: vertical; min-height: 60px; }
          .ideation-field select option { background: var(--card, #1e293b); color: var(--text-strong, #e2e8f0); }

          /* Tech Tags */
          .ideation-tech-section { margin-bottom: 8px; }
          .ideation-tech-section-label { font-size: 0.68rem; color: var(--muted, #64748b); margin-bottom: 6px; font-weight: 500; }
          .ideation-tech-tags { display: flex; flex-wrap: wrap; gap: 6px; }
          .ideation-tech-tag {
            background: var(--republic-glass-hover, rgba(255,255,255,0.04)); border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 6px; padding: 4px 10px; font-size: 0.75rem; color: var(--muted, #94a3b8);
            cursor: pointer; transition: all 0.15s; user-select: none;
          }
          .ideation-tech-tag:hover { background: rgba(99,102,241,0.08); border-color: rgba(99,102,241,0.3); }
          .ideation-tech-tag[data-selected="true"] {
            background: rgba(99,102,241,0.15); border-color: #6366f1;
            color: var(--text-strong, #e2e8f0); font-weight: 500;
          }

          /* Slider */
          .ideation-slider-wrap { display: flex; align-items: center; gap: 12px; }
          .ideation-slider-wrap input[type="range"] {
            flex: 1; accent-color: #6366f1; height: 4px; background: transparent;
          }
          .ideation-slider-val {
            background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3);
            border-radius: 8px; padding: 4px 12px; font-size: 0.85rem; color: #a5b4fc;
            font-weight: 600; min-width: 44px; text-align: center;
          }

          /* Toggles */
          .ideation-toggles { display: flex; gap: 20px; flex-wrap: wrap; }
          .ideation-toggle {
            display: flex; align-items: center; gap: 8px; cursor: pointer;
            font-size: 0.82rem; color: var(--muted, #94a3b8); user-select: none;
          }
          .ideation-toggle input[type="checkbox"] {
            accent-color: #6366f1; width: 16px; height: 16px; cursor: pointer;
          }
          .ideation-toggle:hover { color: var(--text-strong, #e2e8f0); }

          /* Footer */
          .ideation-footer {
            padding: 16px 28px 20px;
            border-top: 1px solid var(--border, rgba(255,255,255,0.06));
            display: flex; justify-content: flex-end; gap: 10px;
            position: sticky; bottom: 0;
            background: var(--card, linear-gradient(145deg, #0f172a, #1e293b));
            border-radius: 0 0 16px 16px;
          }
          .ideation-submit {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            border: none; border-radius: 10px; padding: 10px 28px;
            color: #fff; font-size: 0.9rem; font-weight: 600; cursor: pointer;
            transition: all 0.2s; box-shadow: 0 4px 12px rgba(99,102,241,0.25);
          }
          .ideation-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.35); }
          .ideation-cancel {
            background: var(--republic-glass-hover, rgba(255,255,255,0.05)); border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 10px; padding: 10px 24px; color: var(--muted, #94a3b8); font-size: 0.9rem;
            cursor: pointer; transition: all 0.15s;
          }
          .ideation-cancel:hover { background: rgba(99,102,241,0.08); color: var(--text-strong, #e2e8f0); }

          /* Priority badges */
          .ideation-priority-opt { display: flex; align-items: center; gap: 6px; }
          .priority-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
          .priority-dot--low { background: #64748b; }
          .priority-dot--normal { background: #3b82f6; }
          .priority-dot--high { background: #f59e0b; }
          .priority-dot--critical { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,0.4); }
        </style>

        <!-- Header -->
        <div class="ideation-header">
          <h2><span>⚡</span> Force Ideation</h2>
          <button type="button" class="ideation-close" @click=${() => {
            closeIdeation();
            reRender();
          }} title="Cancel">✕</button>
        </div>

        <div class="ideation-body">
          <!-- Project Type -->
          <div class="ideation-section">
            <div class="ideation-section-title">Project Type</div>
            <div class="ideation-types">
              ${PROJECT_TYPES.map(
                (t) => html`
                <div class="ideation-type-card"
                     data-selected=${t.id === cfg.projectType}
                     @click=${() => {
                       cfg.projectType = t.id;
                       cfg.category = CATEGORIES[t.id]?.[0]?.id ?? "";
                       reRender();
                     }}>
                  <span class="type-icon">${t.icon}</span>
                  <span class="type-label">${t.label}</span>
                </div>
              `,
              )}
            </div>
          </div>

          <!-- Category & Template -->
          <div class="ideation-section">
            <div class="ideation-row">
              <div class="ideation-field">
                <label>Category</label>
                <select .value=${cfg.category} @change=${(e: Event) => {
                  cfg.category = (e.target as HTMLSelectElement).value;
                  reRender();
                }}>
                  ${cats.map((c) => html`<option value=${c.id} ?selected=${c.id === cfg.category}>${c.label}</option>`)}
                </select>
              </div>
              <div class="ideation-field">
                <label>Template</label>
                <select .value=${cfg.templateId} @change=${(e: Event) => {
                  cfg.templateId = (e.target as HTMLSelectElement).value;
                }}>
                  <option value="random" ?selected=${cfg.templateId === "random"}>🎲 Random (best match)</option>
                  <option value="custom" ?selected=${cfg.templateId === "custom"}>✨ Custom (no template)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Name & Description -->
          <div class="ideation-section">
            <div class="ideation-row">
              <div class="ideation-field">
                <label>Project Name (optional)</label>
                <input type="text" placeholder="Auto-generated if empty" .value=${cfg.name}
                       @input=${(e: Event) => {
                         cfg.name = (e.target as HTMLInputElement).value;
                       }} />
              </div>
              <div class="ideation-field">
                <label>Priority</label>
                <select .value=${cfg.priority} @change=${(e: Event) => {
                  cfg.priority = (e.target as HTMLSelectElement).value;
                }}>
                  ${PRIORITIES.map((p) => html`<option value=${p} ?selected=${p === cfg.priority}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`)}
                </select>
              </div>
            </div>
            <div class="ideation-field">
              <label>Description (optional)</label>
              <textarea placeholder="Describe the project vision…" .value=${cfg.description}
                        @input=${(e: Event) => {
                          cfg.description = (e.target as HTMLTextAreaElement).value;
                        }}></textarea>
            </div>
          </div>

          <!-- Technologies -->
          <div class="ideation-section">
            <div class="ideation-section-title">Technologies</div>
            ${Object.entries(TECH_OPTIONS).map(
              ([group, techs]) => html`
              <div class="ideation-tech-section">
                <div class="ideation-tech-section-label">${group.charAt(0).toUpperCase() + group.slice(1)}</div>
                <div class="ideation-tech-tags">
                  ${techs.map(
                    (tech) => html`
                    <span class="ideation-tech-tag"
                          data-selected=${_selectedTechs.has(tech)}
                          @click=${() => {
                            if (_selectedTechs.has(tech)) {
                              _selectedTechs.delete(tech);
                            } else {
                              _selectedTechs.add(tech);
                            }
                            cfg.technologies = [..._selectedTechs];
                            reRender();
                          }}>
                      ${_selectedTechs.has(tech) ? "✓ " : ""}${tech}
                    </span>
                  `,
                  )}
                </div>
              </div>
            `,
            )}
          </div>

          <!-- Team Size -->
          <div class="ideation-section">
            <div class="ideation-section-title">Team & Scheduling</div>
            <div class="ideation-row--3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
              <div class="ideation-field">
                <label>Team Size</label>
                <div class="ideation-slider-wrap">
                  <input type="range" min="1" max="12" .value=${String(cfg.teamSize)}
                         @input=${(e: Event) => {
                           cfg.teamSize = parseInt((e.target as HTMLInputElement).value, 10);
                           reRender();
                         }} />
                  <span class="ideation-slider-val">${cfg.teamSize}</span>
                </div>
              </div>
              <div class="ideation-field">
                <label>Timeline</label>
                <select .value=${cfg.deadline} @change=${(e: Event) => {
                  cfg.deadline = (e.target as HTMLSelectElement).value;
                }}>
                  ${DEADLINES.map((d) => html`<option value=${d.id} ?selected=${d.id === cfg.deadline}>${d.label}</option>`)}
                </select>
              </div>
              <div class="ideation-field">
                <label>Schedule</label>
                <select .value=${cfg.scheduleAt} @change=${(e: Event) => {
                  cfg.scheduleAt = (e.target as HTMLSelectElement).value;
                  reRender();
                }}>
                  <option value="now" ?selected=${cfg.scheduleAt === "now"}>▶ Execute Now</option>
                  <option value="later" ?selected=${cfg.scheduleAt === "later"}>⏰ Schedule Later</option>
                </select>
              </div>
            </div>
            ${
              cfg.scheduleAt === "later"
                ? html`
              <div class="ideation-field" style="margin-top:10px;max-width:280px">
                <label>Execute At</label>
                <input type="datetime-local" @change=${(e: Event) => {
                  cfg.scheduleAt = (e.target as HTMLInputElement).value;
                }} />
              </div>
            `
                : nothing
            }
          </div>

          <!-- Toggles -->
          <div class="ideation-section">
            <div class="ideation-toggles">
              <label class="ideation-toggle">
                <input type="checkbox" ?checked=${cfg.autoAssign}
                       @change=${(e: Event) => {
                         cfg.autoAssign = (e.target as HTMLInputElement).checked;
                       }} />
                Auto-assign best citizens
              </label>
              <label class="ideation-toggle">
                <input type="checkbox" ?checked=${cfg.autoFix}
                       @change=${(e: Event) => {
                         cfg.autoFix = (e.target as HTMLInputElement).checked;
                       }} />
                Enable QA auto-fix pipeline
              </label>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="ideation-footer">
          <button type="button" class="ideation-cancel" @click=${() => {
            closeIdeation();
            reRender();
          }}>Cancel</button>
          <button type="button" class="ideation-submit" @click=${() => {
            cfg.technologies = [..._selectedTechs];
            closeIdeation();
            props.onForceIdeate?.(cfg);
          }}>⚡ Create Project</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Project List ─────────────────────────────────────────────────

function renderProjectList(projects: DevProjectSummary[], props: DevProjectsProps): TemplateResult {
  if (projects.length === 0) {
    return html`
      <div class="republic-card"><p class="republic-card__empty">No projects yet</p></div>
    `;
  }

  const paged = paginate(projects, getPage("dev-projects"), 20);

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>Project Pipeline</h3>
        <span class="republic-badge">${projects.length} total</span>
      </div>
      <div class="republic-table-wrap">
        <table class="republic-table">
          <thead>
            <tr><th>Name</th><th>Phase</th><th>Stack</th><th>Files</th><th>Tests</th><th>Health</th><th>Owner</th><th>Created</th></tr>
          </thead>
          <tbody>
            ${paged.items.map(
              (
                p,
              ) => html`<tr class="republic-table__row" style="cursor:pointer" @click=${() => props.onSelectProject(p.id)}>
                <td>
                  <strong style="color:#60a5fa">${projectTypeIcon(p.projectType)} ${p.name}</strong>
                  <small style="display:block;color:var(--muted)">${p.description?.slice(0, 60)}${(p.description?.length ?? 0) > 60 ? "…" : ""}</small>
                </td>
                <td>${renderStatusBadge(p.phase || p.status)}</td>
                <td><code>${p.stack}</code></td>
                <td>${p.filesWritten ?? 0}</td>
                <td>${p.testsWritten ?? 0}</td>
                <td>${renderHealthBar(p.buildHealth ?? 0)}</td>
                <td>${p.ownerName || p.ownerId?.slice(0, 8) || "—"}</td>
                <td>${formatDate(p.createdAt)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
      ${renderPaginationControls(paged.page, paged.totalPages, (p) => setPage("dev-projects", p), { totalItems: paged.totalItems })}
    </div>
  `;
}

// ─── Project Detail ───────────────────────────────────────────────

function renderProjectDetail(p: DevProjectDetail, props: DevProjectsProps): TemplateResult {
  return html`
    <div class="republic-view republic-dev">
      <!-- Back Button + Title -->
      <div class="republic-hero republic-hero--dev">
        <div class="republic-hero__header">
          <div style="display:flex;align-items:center;gap:12px">
            <button type="button" class="republic-btn republic-btn--sm" @click=${props.onCloseDetail} title="Back to projects">← Back</button>
            <h2 class="republic-hero__title">${projectTypeIcon(p.projectType)} ${p.name}</h2>
            ${renderStatusBadge(p.phase || p.status)}
          </div>
          <div style="display:flex;gap:8px">
            <span class="republic-badge republic-badge--info" style="font-size:0.75rem">${projectTypeLabel(p.projectType)}</span>
            ${
              props.onDownloadProject
                ? html`<button type="button" class="republic-btn republic-btn--sm republic-btn--success" @click=${() => props.onDownloadProject!(p.id)}>📥 Download</button>`
                : nothing
            }
            <button type="button" class="republic-btn republic-btn--sm" @click=${props.onRefresh}>↻ Refresh</button>
          </div>
        </div>
        <p style="color:var(--muted);margin:4px 0 0 0">${p.description}</p>
      </div>

      <!-- Project Metrics -->
      <div class="republic-metrics republic-metrics--grid">
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${p.filesWritten}</div>
          <div class="republic-metric__label">Files</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${p.linesOfCode.toLocaleString()}</div>
          <div class="republic-metric__label">Lines of Code</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${p.commitCount}</div>
          <div class="republic-metric__label">Commits</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${renderHealthBar(p.buildHealth)}</div>
          <div class="republic-metric__label">${metricLabel(p.projectType, "health")}</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${renderHealthBar(p.codeQuality)}</div>
          <div class="republic-metric__label">${metricLabel(p.projectType, "quality")}</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${((p.testCoverage ?? 0) * 100).toFixed(0)}%</div>
          <div class="republic-metric__label">Test Coverage</div>
        </div>
      </div>

      <!-- Project Info Card -->
      <div class="republic-card republic-card--wide">
        <div class="republic-card__header"><h3>Project Info</h3></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px">
          <div><strong style="color:var(--muted)">Stack:</strong> <code>${p.stack}</code></div>
          <div><strong style="color:var(--muted)">Owner:</strong> ${p.ownerName || p.ownerId || "—"}</div>
          <div><strong style="color:var(--muted)">Created:</strong> ${formatDate(p.createdAt)}</div>
          <div><strong style="color:var(--muted)">Updated:</strong> ${p.updatedAt ? formatDate(p.updatedAt) : "—"}</div>
          ${p.lastDeployedAt ? html`<div><strong style="color:var(--muted)">Last Deployed:</strong> ${formatDate(p.lastDeployedAt)}</div>` : nothing}
          ${
            (p as unknown as { previewUrl?: string }).previewUrl
              ? html`
            <div style="grid-column:1/-1">
              <strong style="color:var(--muted)">Preview URL:</strong>
              <a href="${(p as unknown as { previewUrl?: string }).previewUrl}" target="_blank"
                 style="color:#60a5fa;margin-left:6px">
                ${(p as unknown as { previewUrl?: string }).previewUrl}
              </a>
            </div>`
              : nothing
          }
        </div>
      </div>

      <!-- Live Preview -->
      ${renderLivePreview(p)}

      <!-- Project Chat with Citizen Team -->
      ${renderProjectChat(p, props)}

      <!-- Assigned Citizens -->
      ${renderAssignedCitizens(p.assignedCitizens)}

      <!-- Test Results -->
      ${renderTestResults(p)}

      <!-- Files -->
      ${props.fileContent ? renderFileViewer(props) : renderFileList(p.files, p.id, props)}

      <!-- Deployments -->
      ${renderDeployments(p.deployments)}
    </div>
  `;
}

// ─── Project Chat ─────────────────────────────────────────────────

// Per-project chat state (in-memory, loaded from RPC on first open)
const _projectChatInputs = new Map<string, string>();
const _projectChatMessages = new Map<
  string,
  Array<{
    id: string;
    sender: string;
    senderName: string;
    content: string;
    role?: string;
    timestamp: string;
  }>
>();
const _projectChatLoading = new Map<string, boolean>();

const ROLE_EMOJIS: Record<string, string> = {
  lead_architect: "🏛️",
  frontend_dev: "⚛️",
  backend_dev: "⚙️",
  qa_engineer: "🧪",
  ux_designer: "🎨",
  devops: "🐳",
  researcher: "🔬",
  fullstack_dev: "🖥️",
};

async function sendProjectChatMessage(
  projectId: string,
  message: string,
  onRefresh: () => void,
): Promise<void> {
  if (!message.trim()) {
    return;
  }

  // Optimistic: add user message immediately
  const msgs = _projectChatMessages.get(projectId) ?? [];
  msgs.push({
    id: `u-${Date.now()}`,
    sender: "user",
    senderName: "You",
    content: message,
    timestamp: new Date().toISOString(),
  });
  _projectChatMessages.set(projectId, msgs);
  _projectChatInputs.set(projectId, "");
  _projectChatLoading.set(projectId, true);
  onRefresh();

  try {
    // Call the gateway RPC
    const res = await fetch("/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "republic.project.chat.send",
        params: { projectId, message, userId: "user", userName: "You" },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { result?: { reply?: string; assignedTo?: string } };
      if (data.result?.reply) {
        msgs.push({
          id: `c-${Date.now()}`,
          sender: "citizen",
          senderName: "Citizen Team",
          content: data.result.reply,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch {
    /* ignore - optimistic message already shown */
  }

  _projectChatLoading.set(projectId, false);
  onRefresh();
}

async function loadProjectChatHistory(projectId: string, onRefresh: () => void): Promise<void> {
  if (_projectChatMessages.has(projectId)) {
    return;
  } // already loaded
  try {
    const res = await fetch("/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "republic.project.chat.history",
        params: { projectId, limit: 50 },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        result?: {
          messages?: Array<{
            id: string;
            sender: string;
            senderName: string;
            content: string;
            role?: string;
            timestamp: string;
          }>;
        };
      };
      if (data.result?.messages) {
        _projectChatMessages.set(projectId, data.result.messages);
        onRefresh();
      } else {
        _projectChatMessages.set(projectId, []);
      }
    }
  } catch {
    _projectChatMessages.set(projectId, []);
  }
}

function renderProjectChat(p: DevProjectDetail, props: DevProjectsProps): TemplateResult {
  const projectId = p.id;
  const messages = _projectChatMessages.get(projectId) ?? null;
  const input = _projectChatInputs.get(projectId) ?? "";
  const isLoading = _projectChatLoading.get(projectId) ?? false;

  // Kick off history load (idempotent)
  if (messages === null) {
    void loadProjectChatHistory(projectId, props.onRefresh);
    _projectChatMessages.set(projectId, []); // mark as loading
  }

  return html`
    <div class="republic-card republic-card--wide" style="overflow:hidden">
      <style>
        .proj-chat { display:flex; flex-direction:column; }
        .proj-chat__header { display:flex; justify-content:space-between; align-items:center; padding:14px 18px;
          border-bottom:1px solid rgba(255,255,255,0.06); }
        .proj-chat__header h3 { margin:0; font-size:1rem; }
        .proj-chat__actions { display:flex; gap:8px; }
        .proj-chat__messages { flex:1; min-height:200px; max-height:360px; overflow-y:auto;
          padding:14px 18px; display:flex; flex-direction:column; gap:10px;
          scroll-behavior:smooth; }
        .proj-chat__messages::-webkit-scrollbar { width:4px; }
        .proj-chat__messages::-webkit-scrollbar-thumb { background:rgba(99,102,241,0.3); border-radius:2px; }
        .proj-chat__empty { color:var(--muted); font-size:0.85rem; text-align:center; padding:24px; opacity:0.6; }
        .proj-chat__msg { max-width:80%; display:flex; flex-direction:column; gap:3px; }
        .proj-chat__msg--user { align-self:flex-end; align-items:flex-end; }
        .proj-chat__msg--citizen { align-self:flex-start; align-items:flex-start; }
        .proj-chat__bubble { padding:9px 14px; border-radius:12px; font-size:0.87rem; line-height:1.5; word-break:break-word; }
        .proj-chat__bubble--user { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; border-radius:12px 12px 4px 12px; }
        .proj-chat__bubble--citizen { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:var(--text,#e2e8f0); border-radius:12px 12px 12px 4px; }
        .proj-chat__meta { font-size:0.72rem; color:var(--muted); display:flex; align-items:center; gap:5px; }
        .proj-chat__role { background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3);
          border-radius:6px; padding:2px 7px; font-size:0.68rem; color:#a5b4fc; white-space:nowrap; }
        .proj-chat__input { display:flex; gap:8px; padding:12px 18px;
          border-top:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.1); }
        .proj-chat__input textarea {
          flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
          border-radius:10px; padding:9px 12px; color:var(--text,#e2e8f0); font-family:inherit;
          font-size:0.85rem; resize:none; outline:none; height:42px; max-height:120px;
          transition:border-color 0.15s;
        }
        .proj-chat__input textarea:focus { border-color:rgba(99,102,241,0.5); }
        .proj-chat__send { background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none;
          border-radius:10px; padding:0 16px; color:#fff; cursor:pointer;
          font-size:0.9rem; font-weight:600; transition:all 0.2s; white-space:nowrap;
          display:flex; align-items:center; gap:6px; }
        .proj-chat__send:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(99,102,241,0.3); }
        .proj-chat__send:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
        .proj-chat__loading { display:flex; align-items:center; gap:8px; padding:0 18px 10px;
          color:var(--muted); font-size:0.8rem; }
        .proj-chat__dot { width:6px; height:6px; border-radius:50%; background:#6366f1;
          animation:chatDot 1.2s infinite; }
        .proj-chat__dot:nth-child(2) { animation-delay:0.2s; }
        .proj-chat__dot:nth-child(3) { animation-delay:0.4s; }
        @keyframes chatDot { 0%,80%,100% { opacity:0.3; transform:scale(0.8); } 40% { opacity:1; transform:scale(1.1); } }
      </style>

      <div class="proj-chat">
        <div class="proj-chat__header">
          <h3>💬 Project Chat — Talk to Your Team</h3>
          <div class="proj-chat__actions">
            <button type="button" class="republic-btn republic-btn--sm republic-btn--accent"
              title="Trigger autonomous build pipeline"
              @click=${async () => {
                try {
                  await fetch("/rpc", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      method: "republic.project.build.start",
                      params: { projectId },
                    }),
                  });
                  const msgs2 = _projectChatMessages.get(projectId) ?? [];
                  msgs2.push({
                    id: `sys-${Date.now()}`,
                    sender: "citizen",
                    senderName: "System",
                    content:
                      "🔨 Autonomous build pipeline triggered! The team will research, plan, build, and QA the project. Watch the build log for updates.",
                    timestamp: new Date().toISOString(),
                  });
                  _projectChatMessages.set(projectId, msgs2);
                  props.onRefresh();
                } catch {
                  /* ignore */
                }
              }}>
              🔨 Build
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div class="proj-chat__messages" id="proj-chat-${projectId}">
          ${
            messages === null || messages.length === 0
              ? html`
            <div class="proj-chat__empty">
              ${
                messages === null
                  ? html`
                      Loading chat history…
                    `
                  : html`
                      No messages yet. Say hello to your team! Ask them to build a new feature, fix a bug, or explain
                      their architecture.
                    `
              }
            </div>
          `
              : messages.map(
                  (msg) => html`
            <div class="proj-chat__msg proj-chat__msg--${msg.sender}">
              <div class="proj-chat__meta">
                ${
                  msg.sender === "citizen"
                    ? html`
                  <span>${ROLE_EMOJIS[msg.role ?? ""] ?? "🤖"}</span>
                  <span>${msg.senderName}</span>
                  ${msg.role ? html`<span class="proj-chat__role">${msg.role.replace(/_/g, " ")}</span>` : nothing}
                `
                    : html`
                        <span>You</span>
                      `
                }
                <span style="opacity:0.5">${new Date(msg.timestamp).toLocaleTimeString()}</span>
              </div>
              <div class="proj-chat__bubble proj-chat__bubble--${msg.sender}">
                ${msg.content}
              </div>
            </div>
          `,
                )
          }
        </div>

        ${
          isLoading
            ? html`
                <div class="proj-chat__loading">
                  <div class="proj-chat__dot"></div>
                  <div class="proj-chat__dot"></div>
                  <div class="proj-chat__dot"></div>
                  <span>Team is responding…</span>
                </div>
              `
            : nothing
        }

        <!-- Input -->
        <div class="proj-chat__input">
          <textarea
            placeholder="Ask your team anything… 'Add a leaderboard', 'Fix the login bug', 'How is the architecture designed?'"
            .value=${input}
            @input=${(e: Event) => {
              _projectChatInputs.set(projectId, (e.target as HTMLTextAreaElement).value);
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const msg = _projectChatInputs.get(projectId) ?? "";
                void sendProjectChatMessage(projectId, msg, props.onRefresh);
              }
            }}
          ></textarea>
          <button type="button" class="proj-chat__send"
            ?disabled=${isLoading || !input.trim()}
            @click=${() => {
              const msg = _projectChatInputs.get(projectId) ?? "";
              void sendProjectChatMessage(projectId, msg, props.onRefresh);
            }}>
            Send ↵
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Assigned Citizens ────────────────────────────────────────────

function renderAssignedCitizens(citizens: DevProjectDetail["assignedCitizens"]): TemplateResult {
  if (!citizens || citizens.length === 0) {
    return html`
      <div class="republic-card republic-card--wide">
        <div class="republic-card__header"><h3>👷 Assigned Citizens</h3></div>
        <p class="republic-card__empty">No citizens currently assigned</p>
      </div>
    `;
  }

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>👷 Assigned Citizens</h3>
        <span class="republic-badge">${citizens.length} working</span>
      </div>
      <div class="republic-table-wrap">
        <table class="republic-table">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Activity</th><th>Energy</th></tr>
          </thead>
          <tbody>
            ${citizens.map(
              (c) => html`<tr class="republic-table__row">
                <td><strong>${c.name}</strong></td>
                <td><span class="republic-badge republic-badge--info">${c.specialization}</span></td>
                <td>${c.activity}</td>
                <td>${renderEnergyBar(c.energy)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Test Results ─────────────────────────────────────────────────

function renderTestResults(p: DevProjectDetail): TemplateResult {
  const total = p.testsWritten ?? 0;
  if (total === 0) {
    return html`
      <div class="republic-card republic-card--wide">
        <div class="republic-card__header"><h3>🧪 Tests</h3></div>
        <p class="republic-card__empty">No tests written yet</p>
      </div>
    `;
  }

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>🧪 Tests</h3>
        <span class="republic-badge">${total} total</span>
      </div>
      <div class="republic-metrics republic-metrics--grid" style="padding:12px">
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value republic-text--success">${p.testsPassed ?? 0}</div>
          <div class="republic-metric__label">Passed</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value republic-text--danger">${p.testsFailed ?? 0}</div>
          <div class="republic-metric__label">Failed</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${((p.testCoverage ?? 0) * 100).toFixed(1)}%</div>
          <div class="republic-metric__label">Coverage</div>
        </div>
      </div>
    </div>
  `;
}

// ─── Live Preview ─────────────────────────────────────────────────

let _previewExpanded = false;

function renderLivePreview(p: DevProjectDetail): TemplateResult {
  // Find the first live deployment with a URL
  const liveDeployment = p.deployments?.find(
    (d) => d.url && (d.status === "live" || d.status === "deployed" || d.status === "running"),
  );

  if (!liveDeployment?.url) {
    return html`${nothing}`;
  }

  const previewUrl = liveDeployment.url;

  return html`
    <div class="republic-card republic-card--wide" style="overflow:hidden">
      <div class="republic-card__header" style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:10px">
          <h3>🌐 Live Preview</h3>
          <span class="republic-badge republic-badge--success">Live</span>
          <code style="font-size:0.75rem;color:var(--muted)">${previewUrl}</code>
        </div>
        <div style="display:flex;gap:6px">
          <button type="button" class="republic-btn republic-btn--sm"
            @click=${() => {
              _previewExpanded = !_previewExpanded;
            }}
            title="${_previewExpanded ? "Collapse" : "Expand"} preview">
            ${_previewExpanded ? "🗗 Collapse" : "🗖 Expand"}
          </button>
          <a class="republic-btn republic-btn--sm republic-btn--accent"
             href="${previewUrl}" target="_blank" rel="noopener noreferrer"
             style="text-decoration:none;display:inline-flex;align-items:center">
            ↗ Open in New Tab
          </a>
        </div>
      </div>
      <div style="
        width:100%;
        height:${_previewExpanded ? "80vh" : "500px"};
        background:#0a0a0f;
        border-top:1px solid rgba(255,255,255,0.06);
        position:relative;
        transition:height 0.3s ease;
      ">
        <iframe
          src="${previewUrl}"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          loading="lazy"
          style="
            width:100%;height:100%;border:none;
            background:#fff;border-radius:0 0 12px 12px;
          "
          title="Live preview of ${p.name}"
        ></iframe>
      </div>
    </div>
  `;
}

// ─── File List ────────────────────────────────────────────────────

function renderFileList(
  files: DevProjectDetail["files"],
  projectId: string,
  props: DevProjectsProps,
): TemplateResult {
  if (!files || files.length === 0) {
    return html`
      <div class="republic-card republic-card--wide">
        <div class="republic-card__header"><h3>📁 Files</h3></div>
        <p class="republic-card__empty">No files written yet</p>
      </div>
    `;
  }

  const paged = paginate(files, getPage("dev-files"), 30);

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>📁 Files</h3>
        <span class="republic-badge">${files.length} files</span>
      </div>
      <div class="republic-table-wrap">
        <table class="republic-table">
          <thead>
            <tr><th>Path</th><th>Language</th><th>Lines</th><th>Quality</th><th>Modified</th><th></th></tr>
          </thead>
          <tbody>
            ${paged.items.map(
              (
                f,
              ) => html`<tr class="republic-table__row" style="cursor:pointer" @click=${() => props.onViewFile?.(projectId, f.path)}>
                <td><code style="color:#60a5fa">${f.path}</code></td>
                <td><span class="republic-badge republic-badge--info">${f.language}</span></td>
                <td>${f.linesOfCode}</td>
                <td>${renderHealthBar(f.quality)}</td>
                <td>${f.lastModified ? formatDate(f.lastModified) : "—"}</td>
                <td><button type="button" class="republic-btn republic-btn--sm" @click=${(e: Event) => {
                  e.stopPropagation();
                  props.onViewFile?.(projectId, f.path);
                }} title="View file">👁</button></td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
      ${renderPaginationControls(paged.page, paged.totalPages, (p) => setPage("dev-files", p), { totalItems: paged.totalItems })}
    </div>
  `;
}

// ─── File Viewer ──────────────────────────────────────────────────

function renderFileViewer(props: DevProjectsProps): TemplateResult {
  if (props.fileLoading) {
    return html`
      <div class="republic-card republic-card--wide">
        <div class="republic-card__header">
          <h3>📄 Loading file…</h3>
          <button type="button" class="republic-btn republic-btn--sm" @click=${() => props.onCloseFile?.()}>✕ Close</button>
        </div>
        <div style="padding:2rem;text-align:center;color:var(--muted)">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;
  }

  const file = props.fileContent;
  if (!file) {
    return html``;
  }

  const lines = file.content.split("\n");
  const langLabel = langDisplayName(file.language);
  const langColor = langColor4(file.language);

  return html`
    <div class="republic-card republic-card--wide dev-file-viewer">
      <div class="republic-card__header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <span style="font-size:1.15rem">📄</span>
          <code style="color:#60a5fa;font-size:0.95rem;word-break:break-all">${file.path}</code>
          <span class="republic-badge" style="background:${langColor};color:#fff;font-size:0.7rem">${langLabel}</span>
          <span style="color:var(--muted);font-size:0.8rem">${file.linesOfCode} lines</span>
        </div>
        <div style="display:flex;gap:6px">
          ${
            props.onDownloadFile
              ? html`<button type="button" class="republic-btn republic-btn--sm republic-btn--success" @click=${() => props.onDownloadFile!(file)}>📥 Download</button>`
              : nothing
          }
          <button type="button" class="republic-btn republic-btn--sm" @click=${() => props.onCloseFile?.()}>✕ Close</button>
        </div>
      </div>
      <div class="dev-file-viewer__code">
        <pre class="dev-file-viewer__pre"><code>${lines.map(
          (line, i) =>
            html`<span class="dev-file-viewer__line"><span class="dev-file-viewer__line-num">${String(i + 1).padStart(4, " ")}</span>${line}\n</span>`,
        )}</code></pre>
      </div>
    </div>
  `;
}

function langDisplayName(lang: string): string {
  const map: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TSX",
    js: "JavaScript",
    jsx: "JSX",
    py: "Python",
    python: "Python",
    go: "Go",
    rs: "Rust",
    rust: "Rust",
    css: "CSS",
    html: "HTML",
    json: "JSON",
    md: "Markdown",
    markdown: "Markdown",
    sql: "SQL",
    yaml: "YAML",
    dart: "Dart",
    csharp: "C#",
    protobuf: "Protobuf",
    shell: "Shell",
    text: "Text",
    typescript: "TypeScript",
  };
  return map[lang.toLowerCase()] ?? lang;
}

function langColor4(lang: string): string {
  const map: Record<string, string> = {
    ts: "#3178c6",
    tsx: "#3178c6",
    typescript: "#3178c6",
    js: "#f7df1e",
    jsx: "#f7df1e",
    javascript: "#f7df1e",
    py: "#3776ab",
    python: "#3776ab",
    go: "#00add8",
    rs: "#dea584",
    rust: "#dea584",
    css: "#264de4",
    html: "#e34c26",
    json: "#6d4c41",
    md: "#455a64",
    markdown: "#455a64",
    sql: "#e38c00",
    yaml: "#cb171e",
    dart: "#0175c2",
    csharp: "#239120",
    protobuf: "#5b8930",
    shell: "#4eaa25",
  };
  return map[lang.toLowerCase()] ?? "var(--muted)";
}

// ─── Deployments ──────────────────────────────────────────────────

function renderDeployments(deployments: DevProjectDetail["deployments"]): TemplateResult {
  if (!deployments || deployments.length === 0) {
    return html`
      <div class="republic-card republic-card--wide">
        <div class="republic-card__header"><h3>🚀 Deployments</h3></div>
        <p class="republic-card__empty">No deployments yet</p>
      </div>
    `;
  }

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>🚀 Deployments</h3>
        <span class="republic-badge">${deployments.length} deployments</span>
      </div>
      <div class="republic-table-wrap">
        <table class="republic-table">
          <thead>
            <tr><th>Environment</th><th>Status</th><th>Version</th><th>URL</th><th>Deployed</th></tr>
          </thead>
          <tbody>
            ${deployments.map(
              (d) => html`<tr class="republic-table__row">
                <td><span class="republic-badge">${d.environment}</span></td>
                <td>${renderDeploymentStatus(d.status)}</td>
                <td><code>${d.version}</code></td>
                <td>${d.url ? html`<a href="${d.url}" target="_blank" style="color:#60a5fa">${d.url}</a>` : "—"}</td>
                <td>${formatDate(d.deployedAt)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Helpers ──────────────────────────────────────────────────────

function renderStatusBadge(status: string): TemplateResult {
  const cls =
    status === "completed" || status === "done" || status === "deployed"
      ? "republic-badge--success"
      : status === "active" || status === "in-progress" || status === "scaffolding"
        ? "republic-badge--info"
        : status === "failed"
          ? "republic-badge--danger"
          : status === "testing" || status === "reviewing"
            ? "republic-badge--warning"
            : "";
  return html`<span class="republic-badge ${cls}">${status}</span>`;
}

function renderDeploymentStatus(status: string): TemplateResult {
  const cls =
    status === "live"
      ? "republic-badge--success"
      : status === "failed" || status === "rolled-back"
        ? "republic-badge--danger"
        : status === "building" || status === "deploying"
          ? "republic-badge--warning"
          : "republic-badge--info";
  return html`<span class="republic-badge ${cls}">${status}</span>`;
}

function renderHealthBar(value: number): TemplateResult {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#34d399" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return html`
    <div style="display:flex;align-items:center;gap:6px">
      <div style="width:48px;height:6px;background:#1e293b;border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div>
      </div>
      <span style="font-size:0.75rem;color:${color}">${pct}%</span>
    </div>
  `;
}

function renderEnergyBar(energy: number): TemplateResult {
  const color = energy >= 60 ? "#34d399" : energy >= 30 ? "#f59e0b" : "#ef4444";
  return html`
    <div style="display:flex;align-items:center;gap:6px">
      <div style="width:48px;height:6px;background:#1e293b;border-radius:3px;overflow:hidden">
        <div style="width:${energy}%;height:100%;background:${color};border-radius:3px"></div>
      </div>
      <span style="font-size:0.75rem;color:${color}">${energy}%</span>
    </div>
  `;
}

function formatDate(value: string | number | null | undefined): string {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "—";
  }
}

// ─── Innovations ──────────────────────────────────────────────────

function renderInnovations(innovations: InnovationSummary[]): TemplateResult {
  if (innovations.length === 0) {
    return html`
      <div class="republic-card"><p class="republic-card__empty">No innovations proposed yet</p></div>
    `;
  }

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>Innovation Lab</h3>
        <span class="republic-badge">${innovations.length} proposals</span>
      </div>
      <div class="republic-list">
        ${innovations.map(
          (inn) => html`<div class="republic-list__item">
            <span class="republic-dot" style="background:${inn.implemented ? "#34d399" : "#f59e0b"}"></span>
            <div>
              <strong>${inn.title}</strong>
              <span>${inn.type} — Impact: ${inn.impact.toFixed(2)}</span>
            </div>
            <div class="republic-list__meta">
              <span class="republic-badge ${inn.implemented ? "republic-badge--success" : "republic-badge--warning"}">
                ${inn.implemented ? "✓ Implemented" : "Pending"}
              </span>
            </div>
          </div>`,
        )}
      </div>
    </div>
  `;
}
