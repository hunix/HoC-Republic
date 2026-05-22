/**
 * WebContainer Preview Page
 *
 * Full Node.js runtime in the browser via StackBlitz WebContainer API.
 * Supports npm install, Vite dev server, Express backend, and HMR.
 * Requires COOP/COEP headers for cross-origin isolation.
 */

import { html, nothing, type TemplateResult } from "lit";
import {
  renderPreviewPage,
  renderStatusBadge,
  type PreviewPageProps,
  type PreviewPageSession,
  type PreviewDevice,
  type PreviewPageProject,
} from "./preview-shared.js";

// ─── Props ──────────────────────────────────────────────────────

export interface WebContainerPreviewProps {
  loading: boolean;
  projects: PreviewPageProject[];
  selectedProjectId: string | null;
  session: PreviewPageSession | null;
  device: PreviewDevice;
  consoleOpen: boolean;
  /** Whether WebContainer is available (cross-origin isolation) */
  webcontainerAvailable: boolean;
  onSelectProject: (projectId: string) => void;
  onStart: () => void;
  onStop: () => void;
  onDeviceChange: (device: PreviewDevice) => void;
  onToggleConsole: () => void;
}

// ─── COOP/COEP Warning ──────────────────────────────────────────

function renderIsolationWarning(): TemplateResult {
  return html`
    <div style="
      margin: 0 20px; padding: 16px 20px;
      border-radius: 8px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: var(--warn, #fbbf24);
      font-size: 13px; line-height: 1.6;
    ">
      <div style="font-weight:600;margin-bottom:6px">⚠️ Cross-Origin Isolation Required</div>
      <div>WebContainer requires COOP/COEP headers to be set on the server. 
      The gateway needs to send these response headers:</div>
      <code style="
        display: block; margin-top: 8px; padding: 10px;
        background: rgba(0,0,0,0.3); border-radius: 6px;
        font-size: 12px; color: var(--text-strong, #e6edf3);
      ">Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp</code>
      <div style="margin-top:8px;color:var(--muted,#8b949e)">
        Until these headers are configured, use the <strong>ESM CDN</strong> or <strong>Local Dev Server</strong> preview instead.
      </div>
    </div>
  `;
}

// ─── Render ─────────────────────────────────────────────────────

export function renderWebContainerPreview(props: WebContainerPreviewProps): TemplateResult {
  const pageProps: PreviewPageProps = {
    loading: props.loading,
    projects: props.projects,
    selectedProjectId: props.selectedProjectId,
    session: props.session,
    device: props.device,
    consoleOpen: props.consoleOpen,
    engineLabel: "WebContainer Preview",
    engineIcon: "🐳",
    engineDescription: "Full Node.js in the browser via StackBlitz WebContainer. Supports npm install, Vite HMR, Express backend, and real file system — the Lovable AI experience.",
    onSelectProject: props.onSelectProject,
    onStart: props.onStart,
    onStop: props.onStop,
    onDeviceChange: props.onDeviceChange,
    onToggleConsole: props.onToggleConsole,
  };

  // For WebContainer, the session URL is from the WebContainer server-ready event
  const previewUrl = props.session?.status === "running" && props.session.url !== "webcontainer://pending"
    ? props.session.url
    : null;

  return html`
    <div style="padding: 0 20px 20px 20px">
      ${!props.webcontainerAvailable ? renderIsolationWarning() : nothing}
      <div style="margin-top: ${!props.webcontainerAvailable ? "12px" : "0"}">
        ${renderPreviewPage(pageProps, previewUrl)}
      </div>
      ${props.session ? html`
        <div style="
          margin-top: 12px; padding: 12px 16px;
          border-radius: 8px;
          background: var(--bg-accent, #111119);
          border: 1px solid var(--border, rgba(255,255,255,0.08));
          display: flex; align-items: center; gap: 12px;
          font-size: 12px; color: var(--muted, #8b949e);
        ">
          <span>🐳 WebContainer</span>
          ${renderStatusBadge(props.session.status)}
          <span style="flex:1"></span>
          <span>Files: ${props.session.resolvedDeps ? Object.keys(props.session.resolvedDeps).length : 0} deps</span>
        </div>
      ` : nothing}
    </div>
  `;
}
