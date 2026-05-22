/**
 * Preview Shared — Reusable layout components for preview pages
 *
 * Provides the common iframe panel, device selector, console output,
 * and status indicators used across all three preview engine pages.
 */

import { html, nothing, type TemplateResult } from "lit";

// ─── Types ──────────────────────────────────────────────────────

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export interface PreviewPageProject {
  id: string;
  name: string;
  fileCount: number;
  status: string;
}

export interface PreviewPageSession {
  id: string;
  projectId: string;
  projectName: string;
  engine: string;
  status: string;
  url: string | null;
  port: number | null;
  logs: string[];
  error: string | null;
  startedAt: string;
  stoppedAt: string | null;
  generatedHtml: string | null;
  workspaceDir: string | null;
  resolvedDeps: Record<string, string>;
}

export interface PreviewPageProps {
  loading: boolean;
  projects: PreviewPageProject[];
  selectedProjectId: string | null;
  session: PreviewPageSession | null;
  device: PreviewDevice;
  consoleOpen: boolean;
  engineLabel: string;
  engineIcon: string;
  engineDescription: string;
  onSelectProject: (projectId: string) => void;
  onStart: () => void;
  onStop: () => void;
  onDeviceChange: (device: PreviewDevice) => void;
  onToggleConsole: () => void;
}

// ─── Device Widths ──────────────────────────────────────────────

const DEVICE_WIDTHS: Record<PreviewDevice, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

// ─── Status Badge ───────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case "running": return "var(--ok, #34d399)";
    case "starting": case "installing": case "preparing": return "var(--warn, #fbbf24)";
    case "error": return "var(--danger, #f87171)";
    case "stopped": return "var(--muted, #8b949e)";
    default: return "var(--muted, #8b949e)";
  }
}

export function renderStatusBadge(status: string): TemplateResult {
  return html`
    <span style="
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
      background: color-mix(in srgb, ${statusColor(status)} 15%, transparent);
      color: ${statusColor(status)};
    ">
      <span style="width:6px;height:6px;border-radius:50%;background:${statusColor(status)};${
        status === "running" || status === "starting" ? "animation:pulse 1.5s infinite" : ""
      }"></span>
      ${status.toUpperCase()}
    </span>
  `;
}

// ─── Project Selector ───────────────────────────────────────────

export function renderProjectSelector(props: PreviewPageProps): TemplateResult {
  return html`
    <div style="
      display: flex; align-items: center; gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
      background: var(--bg-accent, #111119);
    ">
      <span style="font-size: 22px">${props.engineIcon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;color:var(--text-strong,#e6edf3)">${props.engineLabel}</div>
        <div style="font-size:11px;color:var(--muted,#8b949e);margin-top:2px">${props.engineDescription}</div>
      </div>
      <select
        style="
          padding: 6px 12px;
          background: var(--bg, #0d1117);
          color: var(--text-strong, #e6edf3);
          border: 1px solid var(--border, rgba(255,255,255,0.08));
          border-radius: 6px;
          font-size: 13px;
          min-width: 200px;
          cursor: pointer;
        "
        @change=${(e: Event) => props.onSelectProject((e.target as HTMLSelectElement).value)}
      >
        <option value="" ?selected=${!props.selectedProjectId}>— Select a project —</option>
        ${props.projects.map((p) => html`
          <option value=${p.id} ?selected=${props.selectedProjectId === p.id}>
            ${p.name} (${p.fileCount} files)
          </option>
        `)}
      </select>
      ${props.selectedProjectId
        ? html`
          ${props.session?.status === "running"
            ? html`<button type="button"
                style="
                  padding: 6px 16px; border-radius: 6px; border: none;
                  background: var(--danger, #f87171); color: white;
                  font-size: 13px; font-weight: 600; cursor: pointer;
                  transition: opacity 0.15s;
                "
                @click=${props.onStop}
              >⏹ Stop</button>`
            : html`<button type="button"
                style="
                  padding: 6px 16px; border-radius: 6px; border: none;
                  background: var(--ok, #34d399); color: #0d1117;
                  font-size: 13px; font-weight: 600; cursor: pointer;
                  transition: opacity 0.15s;
                "
                @click=${props.onStart}
                ?disabled=${props.session?.status === "preparing" || props.session?.status === "installing"}
              >▶ Start Preview</button>`
          }
        `
        : nothing
      }
    </div>
  `;
}

// ─── Device Toolbar ─────────────────────────────────────────────

export function renderDeviceToolbar(props: PreviewPageProps): TemplateResult {
  const devices: { id: PreviewDevice; icon: string; label: string }[] = [
    { id: "desktop", icon: "🖥️", label: "Desktop" },
    { id: "tablet", icon: "📱", label: "Tablet" },
    { id: "mobile", icon: "📲", label: "Mobile" },
  ];

  return html`
    <div style="
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
      background: var(--bg-accent, #111119);
    ">
      <div style="display:flex;gap:4px">
        ${devices.map((d) => html`
          <button type="button"
            style="
              padding: 4px 10px; border-radius: 4px; border: none;
              font-size: 12px; cursor: pointer;
              background: ${props.device === d.id ? "var(--info, #818cf8)" : "transparent"};
              color: ${props.device === d.id ? "#fff" : "var(--muted, #8b949e)"};
              transition: all 0.15s;
            "
            @click=${() => props.onDeviceChange(d.id)}
            title=${d.label}
          >${d.icon} ${d.label}</button>
        `)}
      </div>
      <div style="flex:1"></div>
      ${props.session ? renderStatusBadge(props.session.status) : nothing}
      <span style="font-size:11px;color:var(--muted,#8b949e)">
        ${props.session?.url && props.session.url !== "webcontainer://pending"
          ? props.session.url
          : ""}
      </span>
    </div>
  `;
}

// ─── Preview Iframe ─────────────────────────────────────────────

export function renderPreviewIframe(props: PreviewPageProps, blobUrl: string | null): TemplateResult {
  const deviceW = DEVICE_WIDTHS[props.device];

  if (!blobUrl && !props.session?.url) {
    return html`
      <div style="
        flex: 1; display: flex; align-items: center; justify-content: center;
        background: var(--bg, #0d1117);
        color: var(--muted, #8b949e);
        font-size: 14px;
      ">
        <div style="text-align:center;max-width:400px">
          <div style="font-size:48px;margin-bottom:16px">${props.engineIcon}</div>
          <div style="font-size:16px;font-weight:600;color:var(--text-strong,#e6edf3);margin-bottom:8px">
            ${props.engineLabel}
          </div>
          <div style="line-height:1.5">${props.engineDescription}</div>
          ${!props.selectedProjectId
            ? html`<div style="margin-top:16px;color:var(--info,#818cf8)">← Select a project to get started</div>`
            : html`<div style="margin-top:16px;color:var(--info,#818cf8)">Click "Start Preview" to launch</div>`
          }
        </div>
      </div>
    `;
  }

  const src = blobUrl ?? props.session?.url ?? "";

  return html`
    <div style="
      flex: 1;
      display: flex;
      justify-content: center;
      background: var(--bg, #0d1117);
      overflow: auto;
      padding: ${props.device !== "desktop" ? "16px" : "0"};
    ">
      <iframe
        src=${src}
        style="
          width: ${deviceW};
          max-width: 100%;
          height: 100%;
          border: ${props.device !== "desktop" ? "1px solid var(--border, rgba(255,255,255,0.08))" : "none"};
          border-radius: ${props.device !== "desktop" ? "12px" : "0"};
          background: white;
        "
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        allow="clipboard-read; clipboard-write"
      ></iframe>
    </div>
  `;
}

// ─── Console Panel ──────────────────────────────────────────────

export function renderConsolePanel(props: PreviewPageProps): TemplateResult {
  if (!props.consoleOpen) {
    return html`
      <button type="button"
        style="
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px; width: 100%;
          border: none; border-top: 1px solid var(--border, rgba(255,255,255,0.08));
          background: var(--bg-accent, #111119);
          color: var(--muted, #8b949e);
          font-size: 12px; cursor: pointer; text-align: left;
        "
        @click=${props.onToggleConsole}
      >
        ▶ Console ${props.session?.logs.length ? `(${props.session.logs.length})` : ""}
        ${props.session?.error ? html`<span style="color:var(--danger,#f87171)">• Error</span>` : nothing}
      </button>
    `;
  }

  return html`
    <div style="
      height: 200px; overflow: hidden;
      display: flex; flex-direction: column;
      border-top: 1px solid var(--border, rgba(255,255,255,0.08));
    ">
      <button type="button"
        style="
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          border: none; border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
          background: var(--bg-accent, #111119);
          color: var(--muted, #8b949e);
          font-size: 12px; cursor: pointer; text-align: left;
        "
        @click=${props.onToggleConsole}
      >
        ▼ Console ${props.session?.logs.length ? `(${props.session.logs.length})` : ""}
      </button>
      <div style="
        flex: 1; overflow-y: auto;
        padding: 8px 12px;
        background: var(--bg, #0d1117);
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 12px; line-height: 1.6;
        color: var(--ok, #a3e635);
      ">
        ${props.session?.logs.length
          ? props.session.logs.map((line) => html`<div>${line}</div>`)
          : html`<div style="color:var(--muted,#8b949e)">No logs yet.</div>`
        }
        ${props.session?.error
          ? html`<div style="color:var(--danger,#f87171);margin-top:8px">❌ ${props.session.error}</div>`
          : nothing
        }
      </div>
    </div>
  `;
}

// ─── Dependencies Panel ─────────────────────────────────────────

export function renderDependenciesPanel(session: PreviewPageSession | null): TemplateResult {
  if (!session || Object.keys(session.resolvedDeps).length === 0) {return html``;}

  const deps = Object.entries(session.resolvedDeps);
  return html`
    <div style="
      padding: 12px 16px;
      border-top: 1px solid var(--border, rgba(255,255,255,0.08));
      background: var(--bg-accent, #111119);
      max-height: 150px; overflow-y: auto;
    ">
      <div style="font-size:11px;font-weight:600;color:var(--muted,#8b949e);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">
        Dependencies (${deps.length})
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${deps.map(([name]) => html`
          <span style="
            display:inline-block; padding:2px 8px;
            border-radius:4px; font-size:11px;
            background:rgba(99,102,241,0.15);
            color:var(--info,#818cf8);
          ">${name}</span>
        `)}
      </div>
    </div>
  `;
}

// ─── Full Page Layout ───────────────────────────────────────────

/**
 * Render the complete preview page layout.
 * Used by all three engine-specific pages.
 */
export function renderPreviewPage(props: PreviewPageProps, blobUrl: string | null): TemplateResult {
  return html`
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    </style>
    <div style="
      display: flex; flex-direction: column;
      height: calc(100vh - 130px);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      background: var(--bg, #0d1117);
    ">
      ${renderProjectSelector(props)}
      ${renderDeviceToolbar(props)}
      ${renderPreviewIframe(props, blobUrl)}
      ${renderDependenciesPanel(props.session)}
      ${renderConsolePanel(props)}
    </div>
  `;
}
