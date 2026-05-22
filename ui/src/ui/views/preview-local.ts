/**
 * Local Dev Server Preview Page
 *
 * Real Node.js dev server running on the host machine via workspace-manager.
 * Writes project files to disk, runs npm install + vite dev server,
 * and proxies the localhost URL into the preview iframe.
 */

import { html, type TemplateResult } from "lit";
import {
  renderPreviewPage,
  type PreviewPageProps,
  type PreviewPageSession,
  type PreviewDevice,
  type PreviewPageProject,
} from "./preview-shared.js";

// ─── Props ──────────────────────────────────────────────────────

export interface LocalPreviewProps {
  loading: boolean;
  projects: PreviewPageProject[];
  selectedProjectId: string | null;
  session: PreviewPageSession | null;
  device: PreviewDevice;
  consoleOpen: boolean;
  onSelectProject: (projectId: string) => void;
  onStart: () => void;
  onStop: () => void;
  onDeviceChange: (device: PreviewDevice) => void;
  onToggleConsole: () => void;
}

// ─── Render ─────────────────────────────────────────────────────

export function renderLocalPreview(props: LocalPreviewProps): TemplateResult {
  const pageProps: PreviewPageProps = {
    loading: props.loading,
    projects: props.projects,
    selectedProjectId: props.selectedProjectId,
    session: props.session,
    device: props.device,
    consoleOpen: props.consoleOpen,
    engineLabel: "Local Dev Server",
    engineIcon: "🖥️",
    engineDescription: "Real Node.js dev server on your machine. Runs npm install + Vite, supports all npm packages, full hot-reload, and real database connections.",
    onSelectProject: props.onSelectProject,
    onStart: props.onStart,
    onStop: props.onStop,
    onDeviceChange: props.onDeviceChange,
    onToggleConsole: props.onToggleConsole,
  };

  // For local preview, the URL comes from the session (localhost:PORT)
  const previewUrl = props.session?.status === "running" ? props.session.url : null;

  return html`
    <div style="padding: 0 20px 20px 20px">
      ${renderPreviewPage(pageProps, previewUrl)}
    </div>
  `;
}
