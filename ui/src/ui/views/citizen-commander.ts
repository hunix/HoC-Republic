/**
 * Citizen Commander — Direct Order Interface
 *
 * Enables the user to instruct individual citizens or groups directly:
 * - Individual mode: click citizen → command panel → type instruction
 * - Group mode: select multiple → broadcast → parallel execution
 * - Quick commands: pre-built action buttons
 * - Response feed: real-time streaming with avatar + voice
 */

import { html, nothing, type TemplateResult } from "lit";
import { renderCitizenAvatar, type AvatarAppearance } from "./citizen-avatar.ts";
import { speak, stopAll, toggleMute, isMuted, type VoiceProfile } from "./citizen-voice.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface CommandTarget {
  citizenId: string;
  citizenName: string;
  specialization: string;
  appearance: AvatarAppearance | null;
  voiceProfile: VoiceProfile | null;
  mood?: string;
}

export interface CommandResult {
  citizenId: string;
  citizenName: string;
  instruction: string;
  response: string;
  success: boolean;
  action?: string;
  timestamp: number;
}

export type CommandMode = "individual" | "group";

export interface QuickCommand {
  label: string;
  icon: string;
  instruction: string;
  category: "research" | "code" | "analyze" | "general";
}

export interface CommanderProps {
  /** Currently selected targets */
  targets: CommandTarget[];
  /** Mode: single citizen or group broadcast */
  mode: CommandMode;
  /** Results from previous commands */
  results: CommandResult[];
  /** Whether a command is currently executing */
  executing: boolean;
  /** Send a command to the backend */
  onSendCommand: (citizenIds: string[], instruction: string) => void;
  /** Select/deselect a citizen */
  onToggleTarget: (citizenId: string) => void;
  /** Clear all selections */
  onClearTargets: () => void;
  /** Switch mode */
  onModeChange: (mode: CommandMode) => void;
}

// ─── Quick Commands ─────────────────────────────────────────────

const QUICK_COMMANDS: QuickCommand[] = [
  {
    label: "Research",
    icon: "🔬",
    instruction:
      "Research the latest developments on the assigned topic and provide a comprehensive report.",
    category: "research",
  },
  {
    label: "Write Code",
    icon: "💻",
    instruction: "Write clean, well-documented code for the current assigned task.",
    category: "code",
  },
  {
    label: "Analyze",
    icon: "📊",
    instruction:
      "Perform a detailed analysis of the current situation and provide actionable insights.",
    category: "analyze",
  },
  {
    label: "Report",
    icon: "📝",
    instruction: "Write a concise status report on current progress and blockers.",
    category: "general",
  },
  {
    label: "Collaborate",
    icon: "🤝",
    instruction: "Find the most relevant citizens to collaborate with and propose a joint project.",
    category: "general",
  },
  {
    label: "Innovate",
    icon: "💡",
    instruction: "Propose an innovative solution or improvement to the republic's infrastructure.",
    category: "research",
  },
];

// ─── Main Render ────────────────────────────────────────────────

export function renderCitizenCommander(props: CommanderProps): TemplateResult {
  return html`
    <div class="commander">
      <!-- Header -->
      <div class="commander__header">
        <h3 class="commander__title">
          ⚡ Citizen Commander
          <span class="commander__badge">${props.targets.length} selected</span>
        </h3>
        <div class="commander__controls">
          <button type="button"
            class="commander__mode-btn ${props.mode === "individual" ? "commander__mode-btn--active" : ""}"
            @click=${() => props.onModeChange("individual")}
          >👤 Individual</button>
          <button type="button"
            class="commander__mode-btn ${props.mode === "group" ? "commander__mode-btn--active" : ""}"
            @click=${() => props.onModeChange("group")}
          >👥 Group</button>
          ${
            props.targets.length > 0
              ? html`
            <button type="button" class="commander__clear-btn" @click=${props.onClearTargets}>✕ Clear</button>
          `
              : nothing
          }
        </div>
      </div>

      <!-- Selected Citizens -->
      ${
        props.targets.length > 0
          ? renderSelectedTargets(props)
          : html`
              <div class="commander__empty">
                Select citizens to command. Click a citizen avatar or use group mode to select multiple.
              </div>
            `
      }

      <!-- Quick Commands -->
      ${props.targets.length > 0 ? renderQuickCommands(props) : nothing}

      <!-- Custom Command Input -->
      ${props.targets.length > 0 ? renderCommandInput(props) : nothing}

      <!-- Results Feed -->
      ${props.results.length > 0 ? renderResultsFeed(props) : nothing}
    </div>
  `;
}

// ─── Selected Targets ───────────────────────────────────────────

function renderSelectedTargets(props: CommanderProps): TemplateResult {
  return html`
    <div class="commander__targets">
      ${props.targets.map(
        (t) => html`
          <div class="commander__target" @click=${() => props.onToggleTarget(t.citizenId)}>
            ${renderCitizenAvatar({
              citizenId: t.citizenId,
              citizenName: t.citizenName,
              appearance: t.appearance,
              mood: t.mood,
              size: "sm",
            })}
            <div class="commander__target-info">
              <span class="commander__target-name">${t.citizenName}</span>
              <span class="commander__target-spec">${t.specialization}</span>
            </div>
            ${
              t.voiceProfile
                ? html`<button type="button"
                  class="commander__mute-btn ${isMuted(t.citizenId) ? "commander__mute-btn--muted" : ""}"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    toggleMute(t.citizenId);
                  }}
                  title="${isMuted(t.citizenId) ? "Unmute" : "Mute"}"
                >${isMuted(t.citizenId) ? "🔇" : "🔊"}</button>`
                : nothing
            }
          </div>
        `,
      )}
    </div>
  `;
}

// ─── Quick Commands ─────────────────────────────────────────────

function renderQuickCommands(props: CommanderProps): TemplateResult {
  return html`
    <div class="commander__quick">
      <span class="commander__quick-label">Quick commands:</span>
      <div class="commander__quick-grid">
        ${QUICK_COMMANDS.map(
          (cmd) => html`
            <button type="button"
              class="commander__quick-btn commander__quick-btn--${cmd.category}"
              ?disabled=${props.executing}
              @click=${() => {
                const ids = props.targets.map((t) => t.citizenId);
                props.onSendCommand(ids, cmd.instruction);
              }}
            >${cmd.icon} ${cmd.label}</button>
          `,
        )}
      </div>
    </div>
  `;
}

// ─── Custom Command Input ───────────────────────────────────────

function renderCommandInput(props: CommanderProps): TemplateResult {
  return html`
    <div class="commander__input">
      <textarea
        id="commander-instruction"
        class="commander__textarea"
        placeholder="Type a direct instruction for ${props.targets.length === 1 ? props.targets[0].citizenName : `${props.targets.length} citizens`}..."
        rows="3"
        ?disabled=${props.executing}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            const textarea = e.target as HTMLTextAreaElement;
            const instruction = textarea.value.trim();
            if (instruction) {
              const ids = props.targets.map((t) => t.citizenId);
              props.onSendCommand(ids, instruction);
              textarea.value = "";
            }
          }
        }}
      ></textarea>
      <div class="commander__input-actions">
        <span class="commander__input-hint">Ctrl+Enter to send</span>
        <button type="button"
          class="commander__send-btn"
          ?disabled=${props.executing}
          @click=${() => {
            const textarea = document.getElementById(
              "commander-instruction",
            ) as HTMLTextAreaElement;
            const instruction = textarea?.value.trim();
            if (instruction) {
              const ids = props.targets.map((t) => t.citizenId);
              props.onSendCommand(ids, instruction);
              textarea.value = "";
            }
          }}
        >${props.executing ? "⏳ Executing..." : "▶ Send Command"}</button>
      </div>
    </div>
  `;
}

// ─── Results Feed ───────────────────────────────────────────────

function renderResultsFeed(props: CommanderProps): TemplateResult {
  return html`
    <div class="commander__feed">
      <div class="commander__feed-header">
        <h4>Response Feed</h4>
        <button type="button" class="commander__stop-btn" @click=${() => stopAll()}>■ Stop All Speech</button>
      </div>
      <div class="commander__feed-list">
        ${props.results.map((r) => {
          const target = props.targets.find((t) => t.citizenId === r.citizenId);
          return html`
            <div class="commander__result ${r.success ? "commander__result--success" : "commander__result--fail"}">
              <div class="commander__result-header">
                ${
                  target
                    ? renderCitizenAvatar({
                        citizenId: r.citizenId,
                        citizenName: r.citizenName,
                        appearance: target.appearance,
                        mood: target.mood,
                        speaking: false,
                        size: "sm",
                      })
                    : nothing
                }
                <div class="commander__result-meta">
                  <strong>${r.citizenName}</strong>
                  <span class="commander__result-time">${formatTime(r.timestamp)}</span>
                </div>
                ${
                  target?.voiceProfile
                    ? html`<button type="button"
                      class="commander__speak-btn"
                      @click=${() => {
                        speak({
                          citizenId: r.citizenId,
                          citizenName: r.citizenName,
                          text: r.response,
                          voiceProfile: target.voiceProfile!,
                        });
                      }}
                    >🔊 Speak</button>`
                    : nothing
                }
              </div>
              <div class="commander__result-instruction">
                <em>📋 ${r.instruction.substring(0, 100)}${r.instruction.length > 100 ? "…" : ""}</em>
              </div>
              <div class="commander__result-response">${r.response}</div>
              ${r.action ? html`<div class="commander__result-action">⚡ Action: ${r.action}</div>` : nothing}
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── CSS Styles ─────────────────────────────────────────────────

export function getCommanderStyles(): string {
  return `
    .commander {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px;
      background: var(--bg-card, #1a1a2e);
      border-radius: 16px;
      border: 1px solid var(--border, #2a2a4a);
    }

    .commander__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }

    .commander__title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .commander__badge {
      font-size: 11px;
      font-weight: 500;
      background: var(--accent, #4fc3f7);
      color: #000;
      padding: 2px 8px;
      border-radius: 10px;
    }

    .commander__controls {
      display: flex;
      gap: 6px;
    }

    .commander__mode-btn {
      padding: 6px 12px;
      border: 1px solid var(--border, #2a2a4a);
      border-radius: 8px;
      background: transparent;
      color: var(--text, #e0e0e0);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .commander__mode-btn--active {
      background: var(--accent, #4fc3f7);
      color: #000;
      border-color: var(--accent, #4fc3f7);
    }

    .commander__clear-btn {
      padding: 6px 10px;
      border: 1px solid #ff5252;
      border-radius: 8px;
      background: transparent;
      color: #ff5252;
      font-size: 12px;
      cursor: pointer;
    }

    .commander__empty {
      padding: 24px;
      text-align: center;
      color: var(--text-muted, #888);
      font-size: 13px;
      border: 1px dashed var(--border, #2a2a4a);
      border-radius: 12px;
    }

    .commander__targets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .commander__target {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px 6px 6px;
      background: var(--bg-surface, #16213e);
      border: 1px solid var(--border, #2a2a4a);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .commander__target:hover {
      border-color: #ff5252;
      background: rgba(255, 82, 82, 0.1);
    }

    .commander__target-name {
      font-size: 13px;
      font-weight: 600;
    }

    .commander__target-spec {
      font-size: 11px;
      color: var(--text-muted, #888);
    }

    .commander__target-info {
      display: flex;
      flex-direction: column;
    }

    .commander__mute-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      padding: 2px;
    }

    .commander__mute-btn--muted { opacity: 0.4; }

    .commander__quick {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .commander__quick-label {
      font-size: 12px;
      color: var(--text-muted, #888);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .commander__quick-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 6px;
    }

    .commander__quick-btn {
      padding: 8px 10px;
      border: 1px solid var(--border, #2a2a4a);
      border-radius: 8px;
      background: var(--bg-surface, #16213e);
      color: var(--text, #e0e0e0);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .commander__quick-btn:hover:not(:disabled) {
      border-color: var(--accent, #4fc3f7);
      background: rgba(79, 195, 247, 0.1);
    }

    .commander__quick-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .commander__quick-btn--research:hover:not(:disabled) { border-color: #ab47bc; }
    .commander__quick-btn--code:hover:not(:disabled) { border-color: #66bb6a; }
    .commander__quick-btn--analyze:hover:not(:disabled) { border-color: #ffa726; }

    .commander__input {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .commander__textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid var(--border, #2a2a4a);
      border-radius: 12px;
      background: var(--bg-surface, #16213e);
      color: var(--text, #e0e0e0);
      font-size: 13px;
      font-family: inherit;
      resize: vertical;
      line-height: 1.5;
    }

    .commander__textarea:focus {
      outline: none;
      border-color: var(--accent, #4fc3f7);
      box-shadow: 0 0 0 2px rgba(79, 195, 247, 0.2);
    }

    .commander__input-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .commander__input-hint {
      font-size: 11px;
      color: var(--text-muted, #888);
    }

    .commander__send-btn {
      padding: 8px 20px;
      border: none;
      border-radius: 10px;
      background: linear-gradient(135deg, #4fc3f7, #0288d1);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .commander__send-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(79, 195, 247, 0.4);
    }

    .commander__send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .commander__feed {
      border-top: 1px solid var(--border, #2a2a4a);
      padding-top: 16px;
    }

    .commander__feed-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .commander__feed-header h4 {
      margin: 0;
      font-size: 14px;
    }

    .commander__stop-btn {
      padding: 4px 10px;
      border: 1px solid #ff5252;
      border-radius: 6px;
      background: transparent;
      color: #ff5252;
      font-size: 11px;
      cursor: pointer;
    }

    .commander__feed-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 400px;
      overflow-y: auto;
    }

    .commander__result {
      padding: 12px;
      border-radius: 12px;
      border: 1px solid var(--border, #2a2a4a);
      background: var(--bg-surface, #16213e);
    }

    .commander__result--success { border-left: 3px solid #66bb6a; }
    .commander__result--fail { border-left: 3px solid #ff5252; }

    .commander__result-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .commander__result-meta {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .commander__result-meta strong { font-size: 13px; }

    .commander__result-time {
      font-size: 11px;
      color: var(--text-muted, #888);
    }

    .commander__speak-btn {
      padding: 4px 10px;
      border: 1px solid var(--accent, #4fc3f7);
      border-radius: 6px;
      background: transparent;
      color: var(--accent, #4fc3f7);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .commander__speak-btn:hover {
      background: rgba(79, 195, 247, 0.1);
    }

    .commander__result-instruction {
      font-size: 12px;
      color: var(--text-muted, #888);
      margin-bottom: 6px;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 6px;
    }

    .commander__result-response {
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .commander__result-action {
      margin-top: 8px;
      font-size: 12px;
      color: var(--accent, #4fc3f7);
      font-weight: 600;
    }
  `;
}
