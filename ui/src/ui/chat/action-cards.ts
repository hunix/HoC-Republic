/**
 * Action Card System — Rich interactive cards for chat messages.
 *
 * Action cards are structured data blocks embedded in assistant responses
 * using fenced JSON blocks marked with ```action-card.  They render as
 * visually rich, interactive cards inside the chat stream.
 *
 * Supported card types:
 *   - project-status   Project progress with phase bars and assigned citizens
 *   - citizen          Compact citizen profile with stat gauges
 *   - government       Bill / election card with vote counts
 *   - economy-alert    Market or treasury change notification
 *   - quick-action     Row of command buttons the user can click
 *   - error            Styled error with optional retry
 */

import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons.ts";

// ─── Types ────────────────────────────────────────────────────────

export type ActionCardType =
  | "project-status"
  | "citizen"
  | "government"
  | "economy-alert"
  | "quick-action"
  | "error";

export interface ProjectStatusCard {
  type: "project-status";
  title: string;
  phase?: string;
  progress: number; // 0–100
  assignedCitizens?: string[];
  status?: "active" | "paused" | "completed" | "failed";
  description?: string;
}

export interface CitizenCard {
  type: "citizen";
  id: string;
  name?: string;
  specialization?: string;
  health: number; // 0–100
  energy: number; // 0–100
  happiness: number; // 0–100
  credits?: number;
  activity?: string;
}

export interface GovernmentCard {
  type: "government";
  kind: "bill" | "election" | "law";
  title: string;
  description?: string;
  sponsor?: string;
  votesFor?: number;
  votesAgainst?: number;
  status?: string;
  winner?: string;
  candidates?: string[];
}

export interface EconomyAlertCard {
  type: "economy-alert";
  metric: string;
  value: number;
  change: number; // positive = up, negative = down
  unit?: string;
  severity?: "info" | "warning" | "critical";
  description?: string;
}

export interface QuickActionCard {
  type: "quick-action";
  label?: string;
  actions: Array<{
    id: string;
    label: string;
    command: string;
    icon?: string;
    variant?: "primary" | "danger" | "default";
  }>;
}

export interface ErrorCard {
  type: "error";
  title: string;
  message: string;
  retryCommand?: string;
  dismissible?: boolean;
}

export type ActionCard =
  | ProjectStatusCard
  | CitizenCard
  | GovernmentCard
  | EconomyAlertCard
  | QuickActionCard
  | ErrorCard;

// ─── Extraction ───────────────────────────────────────────────────

const ACTION_CARD_FENCE = /```action-card\s*\n([\s\S]*?)```/g;

/**
 * Extract action card JSON blocks from a markdown text string.
 * Blocks are fenced with ```action-card ... ```
 */
export function extractActionCards(text: string): ActionCard[] {
  const cards: ActionCard[] = [];
  if (!text) {
    return cards;
  }
  let match: RegExpExecArray | null;
  ACTION_CARD_FENCE.lastIndex = 0;
  while ((match = ACTION_CARD_FENCE.exec(text)) !== null) {
    try {
      const raw = JSON.parse(match[1].trim());
      if (isValidActionCard(raw)) {
        cards.push(raw);
      }
    } catch {
      // Malformed JSON — skip
    }
  }
  return cards;
}

/**
 * Strip action card fenced blocks from text so they don't render as code.
 */
export function stripActionCardBlocks(text: string): string {
  return text.replace(ACTION_CARD_FENCE, "").trim();
}

function isValidActionCard(obj: unknown): obj is ActionCard {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  const card = obj as Record<string, unknown>;
  const validTypes: ActionCardType[] = [
    "project-status",
    "citizen",
    "government",
    "economy-alert",
    "quick-action",
    "error",
  ];
  return typeof card.type === "string" && validTypes.includes(card.type as ActionCardType);
}

// ─── Rendering ────────────────────────────────────────────────────

export function renderActionCard(
  card: ActionCard,
  onCommand?: (command: string) => void,
): TemplateResult {
  switch (card.type) {
    case "project-status":
      return renderProjectStatus(card);
    case "citizen":
      return renderCitizen(card);
    case "government":
      return renderGovernment(card);
    case "economy-alert":
      return renderEconomyAlert(card);
    case "quick-action":
      return renderQuickAction(card, onCommand);
    case "error":
      return renderError(card, onCommand);
    default:
      return html`${nothing}`;
  }
}

// ─── Project Status Card ──────────────────────────────────────────

function renderProjectStatus(card: ProjectStatusCard): TemplateResult {
  const statusClass = card.status ?? "active";
  const pct = Math.max(0, Math.min(100, card.progress));

  return html`
    <div class="action-card action-card--project">
      <div class="action-card__header">
        <span class="action-card__icon">${icons.folder}</span>
        <span class="action-card__title">${card.title}</span>
        <span class="action-card__badge action-card__badge--${statusClass}">
          ${statusClass}
        </span>
      </div>
      ${card.phase ? html`<div class="action-card__meta">${card.phase}</div>` : nothing}
      <div class="action-card__progress">
        <div class="action-card__progress-bar">
          <div
            class="action-card__progress-fill action-card__progress-fill--${statusClass}"
            style="width: ${pct}%"
          ></div>
        </div>
        <span class="action-card__progress-label">${pct}%</span>
      </div>
      ${card.description ? html`<div class="action-card__desc">${card.description}</div>` : nothing}
      ${
        card.assignedCitizens?.length
          ? html`
              <div class="action-card__citizens">
                ${icons.users}
                <span>${card.assignedCitizens.join(", ")}</span>
              </div>
            `
          : nothing
      }
    </div>
  `;
}

// ─── Citizen Card ─────────────────────────────────────────────────

function renderCitizen(card: CitizenCard): TemplateResult {
  return html`
    <div class="action-card action-card--citizen">
      <div class="action-card__header">
        <span class="action-card__icon">${icons.users}</span>
        <span class="action-card__title">${card.name ?? card.id}</span>
        ${
          card.specialization
            ? html`<span class="action-card__badge action-card__badge--info">${card.specialization}</span>`
            : nothing
        }
      </div>
      ${card.activity ? html`<div class="action-card__meta">${card.activity}</div>` : nothing}
      <div class="action-card__gauges">
        ${renderGauge("❤️", "Health", card.health, "health")}
        ${renderGauge("⚡", "Energy", card.energy, "energy")}
        ${renderGauge("😊", "Happy", card.happiness, "happiness")}
      </div>
      ${
        card.credits != null
          ? html`
              <div class="action-card__stat">
                ${icons.dollarSign}
                <span>${card.credits.toLocaleString()} credits</span>
              </div>
            `
          : nothing
      }
    </div>
  `;
}

function renderGauge(
  emoji: string,
  label: string,
  value: number,
  variant: string,
): TemplateResult {
  const pct = Math.max(0, Math.min(100, value));
  return html`
    <div class="action-card__gauge">
      <div class="action-card__gauge-label">
        <span>${emoji}</span>
        <span>${label}</span>
      </div>
      <div class="action-card__gauge-bar">
        <div
          class="action-card__gauge-fill action-card__gauge-fill--${variant}"
          style="width: ${pct}%"
        ></div>
      </div>
      <span class="action-card__gauge-value">${pct}</span>
    </div>
  `;
}

// ─── Government Card ──────────────────────────────────────────────

function renderGovernment(card: GovernmentCard): TemplateResult {
  const kindIcon = card.kind === "bill" ? icons.fileText : card.kind === "election" ? icons.users : icons.shield;
  return html`
    <div class="action-card action-card--government">
      <div class="action-card__header">
        <span class="action-card__icon">${kindIcon}</span>
        <span class="action-card__title">${card.title}</span>
        ${
          card.status
            ? html`<span class="action-card__badge action-card__badge--default">${card.status}</span>`
            : nothing
        }
      </div>
      ${card.description ? html`<div class="action-card__desc">${card.description}</div>` : nothing}
      ${card.sponsor ? html`<div class="action-card__meta">Sponsored by ${card.sponsor}</div>` : nothing}
      ${
        card.votesFor != null || card.votesAgainst != null
          ? html`
              <div class="action-card__votes">
                <span class="action-card__vote action-card__vote--for">
                  👍 ${card.votesFor ?? 0}
                </span>
                <span class="action-card__vote action-card__vote--against">
                  👎 ${card.votesAgainst ?? 0}
                </span>
              </div>
            `
          : nothing
      }
      ${
        card.winner
          ? html`<div class="action-card__stat">🏆 Winner: <strong>${card.winner}</strong></div>`
          : nothing
      }
      ${
        card.candidates?.length
          ? html`
              <div class="action-card__meta">
                Candidates: ${card.candidates.join(", ")}
              </div>
            `
          : nothing
      }
    </div>
  `;
}

// ─── Economy Alert Card ───────────────────────────────────────────

function renderEconomyAlert(card: EconomyAlertCard): TemplateResult {
  const severity = card.severity ?? "info";
  const changeSign = card.change >= 0 ? "+" : "";
  const changeClass = card.change >= 0 ? "up" : "down";

  return html`
    <div class="action-card action-card--economy action-card--severity-${severity}">
      <div class="action-card__header">
        <span class="action-card__icon">${icons.dollarSign}</span>
        <span class="action-card__title">${card.metric}</span>
      </div>
      <div class="action-card__economy-value">
        <span class="action-card__big-number">
          ${card.value.toLocaleString()}${card.unit ? ` ${card.unit}` : ""}
        </span>
        <span class="action-card__change action-card__change--${changeClass}">
          ${changeSign}${card.change.toLocaleString()}${card.unit ? ` ${card.unit}` : ""}
        </span>
      </div>
      ${card.description ? html`<div class="action-card__desc">${card.description}</div>` : nothing}
    </div>
  `;
}

// ─── Quick Action Card ────────────────────────────────────────────

function renderQuickAction(
  card: QuickActionCard,
  onCommand?: (command: string) => void,
): TemplateResult {
  return html`
    <div class="action-card action-card--quick">
      ${card.label ? html`<div class="action-card__label">${card.label}</div>` : nothing}
      <div class="action-card__actions">
        ${card.actions.map((action) => {
          const variant = action.variant ?? "default";
          return html`
            <button type="button"
              class="action-card__btn action-card__btn--${variant}"
              @click=${() => onCommand?.(action.command)}
              title=${action.command}
            >
              ${action.label}
            </button>
          `;
        })}
      </div>
    </div>
  `;
}

// ─── Error Card ───────────────────────────────────────────────────

function renderError(
  card: ErrorCard,
  onCommand?: (command: string) => void,
): TemplateResult {
  return html`
    <div class="action-card action-card--error">
      <div class="action-card__header">
        <span class="action-card__icon action-card__icon--error">${icons.bug}</span>
        <span class="action-card__title">${card.title}</span>
      </div>
      <div class="action-card__desc">${card.message}</div>
      ${
        card.retryCommand
          ? html`
              <button type="button"
                class="action-card__btn action-card__btn--primary"
                @click=${() => onCommand?.(card.retryCommand!)}
              >
                Retry
              </button>
            `
          : nothing
      }
    </div>
  `;
}
