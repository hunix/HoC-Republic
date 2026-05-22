/**
 * ESM CDN Preview Page
 *
 * In-browser React/JS preview using Babel Standalone transpilation
 * and esm.sh CDN for npm package resolution.
 * No server-side execution required — everything runs in the browser.
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

export interface EsmPreviewProps {
  loading: boolean;
  projects: PreviewPageProject[];
  selectedProjectId: string | null;
  session: PreviewPageSession | null;
  device: PreviewDevice;
  consoleOpen: boolean;
  blobUrl: string | null;
  onSelectProject: (projectId: string) => void;
  onStart: () => void;
  onStop: () => void;
  onDeviceChange: (device: PreviewDevice) => void;
  onToggleConsole: () => void;
}

// ─── Render ─────────────────────────────────────────────────────

export function renderEsmPreview(props: EsmPreviewProps): TemplateResult {
  const pageProps: PreviewPageProps = {
    loading: props.loading,
    projects: props.projects,
    selectedProjectId: props.selectedProjectId,
    session: props.session,
    device: props.device,
    consoleOpen: props.consoleOpen,
    engineLabel: "ESM CDN Preview",
    engineIcon: "⚡",
    engineDescription: "In-browser preview with Babel transpilation and esm.sh CDN for npm packages. No install needed — packages load directly from CDN.",
    onSelectProject: props.onSelectProject,
    onStart: props.onStart,
    onStop: props.onStop,
    onDeviceChange: props.onDeviceChange,
    onToggleConsole: props.onToggleConsole,
  };

  // If we have a session with generated HTML but no blobUrl yet,
  // the parent component should create a blob URL from session.generatedHtml
  return html`
    <div style="padding: 0 20px 20px 20px">
      ${renderPreviewPage(pageProps, props.blobUrl)}
    </div>
  `;
}
