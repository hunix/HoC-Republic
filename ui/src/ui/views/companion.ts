/**
 * Companion Management View
 *
 * Renders the companion apps management page with sections for:
 * - React + Supabase PWA
 * - Chrome Extension
 * - Windows Companion Service
 * - Any future companion integrations
 */

import { html, nothing, type TemplateResult } from "lit";
import type { CompanionApp, CompanionStatus } from "../controllers/companion.ts";
import { icon } from "../icons.js";

// ─── Props ──────────────────────────────────────────────────────

interface CompanionProps {
  loading: boolean;
  error: string | null;
  status: CompanionStatus | null;
  onRefresh: () => void;
  onPing: (appId: string) => void;
}

// ─── Main Render ────────────────────────────────────────────────

export function renderCompanion(props: CompanionProps): TemplateResult {
  const { loading, error, status } = props;

  if (loading && !status) {
    return html`
      <div class="card center-text"><span class="loader"></span> Loading companion status…</div>
    `;
  }

  if (error && !status) {
    return html`
      <div class="card card--error">
        <div class="card-header">
          ${icon("zap")} Connection Error
        </div>
        <p>${error}</p>
        <button type="button" class="btn btn--sm" @click=${props.onRefresh}>Retry</button>
      </div>
    `;
  }

  const apps = status?.apps ?? [];

  return html`
    <div class="companion-grid">
      ${apps.map((app) => renderCompanionCard(app, props))}
      ${
        apps.length === 0
          ? html`
              <div class="card center-text muted">No companion apps registered.</div>
            `
          : nothing
      }
    </div>
    <style>
      .companion-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        gap: 1rem;
      }
      .companion-card {
        border: 1px solid var(--border-color, var(--border, rgba(0,0,0,0.12)));
        border-radius: 12px;
        padding: 1.25rem;
        background: var(--surface-1, var(--card-bg, rgba(0,0,0,0.03)));
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .companion-card:hover {
        border-color: var(--accent-color, var(--accent, #6c63ff));
        box-shadow: 0 0 12px rgba(108, 99, 255, 0.15);
      }
      .companion-card__header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
      }
      .companion-card__icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        flex-shrink: 0;
      }
      .companion-card__icon--pwa {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
      }
      .companion-card__icon--chrome-extension {
        background: linear-gradient(135deg, #f6d365, #fda085);
        color: #333;
      }
      .companion-card__icon--windows-service {
        background: linear-gradient(135deg, #0078d4, #00bcf2);
        color: white;
      }
      .companion-card__icon--other {
        background: linear-gradient(135deg, #a8edea, #fed6e3);
        color: #333;
      }
      .companion-card__title {
        font-weight: 600;
        font-size: 1rem;
        line-height: 1.3;
        color: var(--text-color, inherit);
      }
      .companion-card__status {
        font-size: 0.75rem;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        margin-top: 0.15rem;
        color: var(--text-secondary, var(--text-muted, inherit));
      }
      .companion-card__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }
      .companion-card__dot--connected { background: #4ade80; }
      .companion-card__dot--disconnected { background: #f87171; }
      .companion-card__dot--error { background: #fbbf24; }
      .companion-card__dot--unknown { background: var(--text-muted, #999); }
      .companion-card__body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: var(--text-secondary, var(--text-muted, #666));
      }
      .companion-card__caps {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.25rem;
      }
      .companion-card__cap {
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        background: var(--badge-bg, rgba(108, 99, 255, 0.1));
        color: var(--accent-color, var(--badge-text, #6c63ff));
        white-space: nowrap;
      }
      .companion-card__actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
    </style>
  `;
}

// ─── App Card ───────────────────────────────────────────────────

function renderCompanionCard(app: CompanionApp, props: CompanionProps): TemplateResult {
  const typeIcon = getTypeIcon(app.type);
  const statusLabel = app.status.charAt(0).toUpperCase() + app.status.slice(1);

  return html`
    <div class="companion-card">
      <div class="companion-card__header">
        <div class="companion-card__icon companion-card__icon--${app.type}">
          ${typeIcon}
        </div>
        <div>
          <div class="companion-card__title">${app.name}</div>
          <div class="companion-card__status">
            <span class="companion-card__dot companion-card__dot--${app.status}"></span>
            ${statusLabel}
            ${app.version ? html` · v${app.version}` : nothing}
          </div>
        </div>
      </div>

      <div class="companion-card__body">
        ${
          app.endpoint
            ? html`<div>Endpoint: <code>${app.endpoint}</code></div>`
            : html`
                <div class="muted">No endpoint configured</div>
              `
        }

        ${
          app.lastSeen
            ? html`<div>Last seen: ${formatTimestamp(app.lastSeen)}</div>`
            : html`
                <div class="muted">Never connected</div>
              `
        }

        ${
          app.capabilities.length > 0
            ? html`
              <div class="companion-card__caps">
                ${app.capabilities.map(
                  (cap) => html`<span class="companion-card__cap">${cap}</span>`,
                )}
              </div>
            `
            : nothing
        }
      </div>

      <div class="companion-card__actions">
        <button type="button" class="btn btn--sm" @click=${() => props.onPing(app.id)}>
          ${icon("radio")} Ping
        </button>
        <button type="button" class="btn btn--sm" @click=${props.onRefresh}>
          ${icon("loader")} Refresh
        </button>
      </div>
    </div>
  `;
}

// ─── Helpers ────────────────────────────────────────────────────

function getTypeIcon(type: CompanionApp["type"]): string {
  switch (type) {
    case "pwa":
      return "📱";
    case "chrome-extension":
      return "🧩";
    case "windows-service":
      return "🖥️";
    default:
      return "🔌";
  }
}

function formatTimestamp(ms: number): string {
  const ago = Date.now() - ms;
  if (ago < 60_000) {return "just now";}
  if (ago < 3_600_000) {return `${Math.floor(ago / 60_000)}m ago`;}
  if (ago < 86_400_000) {return `${Math.floor(ago / 3_600_000)}h ago`;}
  return new Date(ms).toLocaleDateString();
}
