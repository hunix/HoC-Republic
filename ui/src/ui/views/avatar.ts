import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";
import type {
  AvatarMessage,
  AvatarSessionInfo,
  AvatarFaceState,
  AvatarPersonality,
  AvatarDiagnosticsInfo,
  AvatarSection,
} from "../controllers/avatar.ts";

// ─── Props ───────────────────────────────────────────────────────

export interface AvatarProps {
  loading: boolean;
  section: AvatarSection;
  sessions: AvatarSessionInfo[];
  activeSessionId: string | null;
  messages: AvatarMessage[];
  draft: string;
  faceState: AvatarFaceState | null;
  personality: AvatarPersonality | null;
  diagnostics: AvatarDiagnosticsInfo | null;
  sending: boolean;
  onSectionChange: (s: AvatarSection) => void;
  onCreateSession: () => void;
  onEndSession: (id: string) => void;
  onSelectSession: (id: string) => void;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onPersonalityChange: (trait: string, value: number) => void;
  onPersonalitySave: () => void;
  onRefresh: () => void;
}

// ─── Emotion Emojis ──────────────────────────────────────────────

const EMOTION_EMOJI: Record<string, string> = {
  neutral: "😐",
  joy: "😊",
  sadness: "😢",
  anger: "😠",
  surprise: "😲",
  fear: "😨",
  disgust: "🤢",
  contempt: "😏",
  thinking: "🤔",
  concern: "😟",
};

const INTENT_COLORS: Record<string, string> = {
  plan: "#6366f1",
  execute: "#10b981",
  clarify: "#f59e0b",
  report: "#3b82f6",
  cancel: "#ef4444",
  confirm: "#22c55e",
  question: "#8b5cf6",
  idle: "#6b7280",
};

// ─── Main Render ─────────────────────────────────────────────────

export function renderAvatar(props: AvatarProps): TemplateResult {
  if (props.loading && !props.diagnostics) {
    return html`<div class="republic-loading">
      <div class="republic-loading__spinner"></div>
      <p>Loading avatar engine…</p>
    </div>`;
  }

  const sections: { id: AvatarSection; label: string; icon: string }[] = [
    { id: "conversation", label: "Conversation", icon: "💬" },
    { id: "facemesh", label: "Face Mesh", icon: "🎭" },
    { id: "personality", label: "Personality", icon: "🧠" },
    { id: "diagnostics", label: "Diagnostics", icon: "📊" },
  ];

  return html`
    <div class="republic-view avatar-view">
      <!-- Section Nav -->
      <div class="avatar-section-nav">
        ${sections.map(
          (s) => html`
            <button type="button"
              class="avatar-section-btn ${props.section === s.id ? "avatar-section-btn--active" : ""}"
              @click=${() => props.onSectionChange(s.id)}
            >
              <span class="avatar-section-btn__icon">${s.icon}</span>
              <span class="avatar-section-btn__label">${s.label}</span>
            </button>
          `,
        )}
        <button type="button" class="republic-btn republic-btn--sm" style="margin-left:auto" @click=${props.onRefresh}>
          ${icon("loader")} Refresh
        </button>
      </div>

      ${props.section === "conversation" ? renderConversation(props) : nothing}
      ${props.section === "facemesh" ? renderFaceMesh(props) : nothing}
      ${props.section === "personality" ? renderPersonality(props) : nothing}
      ${props.section === "diagnostics" ? renderDiagnosticsSection(props) : nothing}
    </div>
  `;
}

// ─── Conversation ────────────────────────────────────────────────

function renderConversation(props: AvatarProps): TemplateResult {
  const emotion = props.faceState?.emotion ?? "neutral";
  const emoji = EMOTION_EMOJI[emotion] ?? "😐";
  const viseme = props.faceState?.viseme ?? null;

  return html`
    <div class="avatar-conversation-layout">
      <!-- Session Bar -->
      <div class="avatar-session-bar">
        <div class="avatar-session-bar__left">
          <select
            class="republic-select republic-select--sm"
            @change=${(e: Event) => {
              const val = (e.target as HTMLSelectElement).value;
              if (val) {props.onSelectSession(val);}
            }}
          >
            <option value="" ?selected=${!props.activeSessionId}>Select session…</option>
            ${props.sessions.map(
              (s) => html`
                <option value=${s.sessionId} ?selected=${s.sessionId === props.activeSessionId}>
                  ${s.userId} (${s.turnCount} turns)
                </option>
              `,
            )}
          </select>
          <button type="button" class="republic-btn republic-btn--primary republic-btn--sm" @click=${props.onCreateSession}>
            + New Session
          </button>
          ${props.activeSessionId
            ? html`<button type="button"
                class="republic-btn republic-btn--danger republic-btn--sm"
                @click=${() => props.onEndSession(props.activeSessionId!)}
              >
                End Session
              </button>`
            : nothing}
        </div>
        <div class="avatar-session-bar__right">
          <span class="avatar-emotion-badge" title=${`Emotion: ${emotion}`}>
            <span class="avatar-emotion-badge__emoji">${emoji}</span>
            <span class="avatar-emotion-badge__label">${emotion}</span>
          </span>
          ${viseme
            ? html`<span class="avatar-viseme" title="Active viseme">👄 ${viseme}</span>`
            : nothing}
        </div>
      </div>

      <!-- Chat Transcript -->
      <div class="avatar-transcript" id="avatar-transcript">
        ${props.messages.length === 0
          ? html`
              <div class="avatar-transcript__empty">
                <div class="avatar-transcript__empty-icon">🤖</div>
                <p>Start a conversation with the avatar.</p>
                <p style="color:var(--text-tertiary);font-size:0.85rem">
                  ${props.activeSessionId
                    ? "Type a message below to begin."
                    : "Create a session to get started."}
                </p>
              </div>
            `
          : props.messages.map((msg) => renderMessage(msg))}
        ${props.sending
          ? html`<div class="avatar-message avatar-message--avatar avatar-message--typing">
              <div class="avatar-message__bubble">
                <span class="avatar-typing-dots">
                  <span></span><span></span><span></span>
                </span>
              </div>
            </div>`
          : nothing}
      </div>

      <!-- Input Bar -->
      <div class="avatar-input-bar">
        <input
          class="avatar-input-bar__input"
          type="text"
          placeholder=${props.activeSessionId
            ? "Type a message…"
            : "Create a session first…"}
          .value=${props.draft}
          ?disabled=${!props.activeSessionId || props.sending}
          @input=${(e: Event) => props.onDraftChange((e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey && props.draft.trim()) {
              e.preventDefault();
              props.onSend();
            }
          }}
        />
        <button type="button"
          class="republic-btn republic-btn--primary"
          ?disabled=${!props.activeSessionId || !props.draft.trim() || props.sending}
          @click=${props.onSend}
        >
          ${props.sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  `;
}

function renderMessage(msg: AvatarMessage): TemplateResult {
  const isUser = msg.role === "user";
  const emoji = isUser ? "" : EMOTION_EMOJI[msg.emotion ?? "neutral"] ?? "";
  const intentColor = msg.intent ? INTENT_COLORS[msg.intent] ?? "#6b7280" : null;

  return html`
    <div class="avatar-message ${isUser ? "avatar-message--user" : "avatar-message--avatar"}">
      <div class="avatar-message__bubble">
        ${!isUser && emoji
          ? html`<span class="avatar-message__emotion">${emoji}</span>`
          : nothing}
        <span class="avatar-message__text">${msg.text}</span>
        ${msg.intent
          ? html`<span class="avatar-intent-chip" style="--intent-color:${intentColor}">${msg.intent}</span>`
          : nothing}
      </div>
      <time class="avatar-message__time">
        ${new Date(msg.timestamp).toLocaleTimeString()}
      </time>
    </div>
  `;
}

// ─── Face Mesh ───────────────────────────────────────────────────

const BLENDSHAPE_GROUPS = [
  {
    label: "Eyes",
    keys: ["eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight",
           "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
           "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
           "eyeWideLeft", "eyeWideRight"],
  },
  {
    label: "Brows",
    keys: ["browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight"],
  },
  {
    label: "Mouth",
    keys: ["mouthClose", "mouthFunnel", "mouthPucker", "mouthLeft", "mouthRight",
           "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight",
           "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft", "mouthStretchRight",
           "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper",
           "mouthPressLeft", "mouthPressRight", "mouthLowerDownLeft", "mouthLowerDownRight",
           "mouthUpperUpLeft", "mouthUpperUpRight"],
  },
  {
    label: "Jaw & Cheeks",
    keys: ["jawForward", "jawLeft", "jawRight", "jawOpen",
           "cheekPuff", "cheekSquintLeft", "cheekSquintRight"],
  },
  {
    label: "Nose & Tongue",
    keys: ["noseSneerLeft", "noseSneerRight", "tongueOut"],
  },
];

function renderFaceMesh(props: AvatarProps): TemplateResult {
  const bs = props.faceState?.blendshapes ?? {};
  const emotion = props.faceState?.emotion ?? "neutral";
  const confidence = props.faceState?.confidence ?? 0;
  const viseme = props.faceState?.viseme ?? "sil";

  return html`
    <div class="avatar-facemesh">
      <!-- Emotion Header -->
      <div class="republic-hero republic-hero--sim">
        <div class="republic-hero__header">
          <h2 class="republic-hero__title">
            ${EMOTION_EMOJI[emotion] ?? "😐"} ${emotion.charAt(0).toUpperCase() + emotion.slice(1)}
          </h2>
          <span class="republic-hero__badge republic-hero__badge--live">
            Confidence: ${(confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div class="republic-metrics" style="margin-top:0.75rem">
          <div class="republic-metric republic-metric--card">
            <div class="republic-metric__value">${Object.keys(bs).length}</div>
            <div class="republic-metric__label">Active Blendshapes</div>
          </div>
          <div class="republic-metric republic-metric--card">
            <div class="republic-metric__value">👄 ${viseme}</div>
            <div class="republic-metric__label">Current Viseme</div>
          </div>
        </div>
      </div>

      <!-- Blendshape Groups -->
      ${BLENDSHAPE_GROUPS.map(
        (group) => html`
          <div class="republic-card republic-card--wide">
            <div class="republic-card__header">
              <h3>${group.label}</h3>
              <span class="republic-badge">${group.keys.length} shapes</span>
            </div>
            <div class="avatar-blendshape-grid">
              ${group.keys.map((key) => {
                const val = bs[key] ?? 0;
                const pct = Math.round(val * 100);
                const hue = val > 0.5 ? 30 - (val - 0.5) * 60 : 120 - val * 180;
                return html`
                  <div class="avatar-blendshape-item">
                    <span class="avatar-blendshape-item__name">${key.replace(/([A-Z])/g, " $1").trim()}</span>
                    <div class="avatar-blendshape-item__bar">
                      <div
                        class="avatar-blendshape-item__fill"
                        style="width:${pct}%;background:hsl(${hue},70%,50%)"
                      ></div>
                    </div>
                    <span class="avatar-blendshape-item__val">${pct}%</span>
                  </div>
                `;
              })}
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

// ─── Personality ─────────────────────────────────────────────────

const PERSONALITY_TRAITS: { key: keyof AvatarPersonality; label: string; emoji: string; desc: string }[] = [
  { key: "formality", label: "Formality", emoji: "🎩", desc: "Casual ← → Formal" },
  { key: "proactivity", label: "Proactivity", emoji: "⚡", desc: "Reactive ← → Proactive" },
  { key: "verbosity", label: "Verbosity", emoji: "📝", desc: "Terse ← → Verbose" },
  { key: "empathy", label: "Empathy", emoji: "💕", desc: "Analytical ← → Empathetic" },
  { key: "humor", label: "Humor", emoji: "😄", desc: "Serious ← → Playful" },
  { key: "confidence", label: "Confidence", emoji: "💪", desc: "Cautious ← → Bold" },
];

function renderPersonality(props: AvatarProps): TemplateResult {
  const p = props.personality;

  return html`
    <div class="avatar-personality">
      <div class="republic-hero republic-hero--sim">
        <div class="republic-hero__header">
          <h2 class="republic-hero__title">🧠 Personality Core</h2>
          <button type="button"
            class="republic-btn republic-btn--primary republic-btn--sm"
            @click=${props.onPersonalitySave}
          >
            Save Personality
          </button>
        </div>
        <p style="color:var(--text-secondary);margin-top:0.5rem">
          Adjust the avatar's personality traits to shape conversation tone and style.
        </p>
      </div>

      <div class="avatar-trait-grid">
        ${PERSONALITY_TRAITS.map((trait) => {
          const val = p?.[trait.key] ?? 0.5;
          return html`
            <div class="avatar-trait-card">
              <div class="avatar-trait-card__header">
                <span class="avatar-trait-card__emoji">${trait.emoji}</span>
                <span class="avatar-trait-card__label">${trait.label}</span>
                <span class="avatar-trait-card__value">${(val * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                class="avatar-trait-slider"
                min="0"
                max="1"
                step="0.05"
                .value=${String(val)}
                @input=${(e: Event) =>
                  props.onPersonalityChange(trait.key, Number((e.target as HTMLInputElement).value))}
              />
              <div class="avatar-trait-card__desc">${trait.desc}</div>
            </div>
          `;
        })}
      </div>

      ${p
        ? html`
            <div class="republic-card republic-card--wide" style="margin-top:1rem">
              <div class="republic-card__header"><h3>Trait Summary</h3></div>
              <div class="avatar-trait-summary">
                ${PERSONALITY_TRAITS.map((trait) => {
                  const val = p[trait.key] ?? 0.5;
                  const pct = Math.round(val * 100);
                  return html`
                    <div class="avatar-trait-summary__row">
                      <span class="avatar-trait-summary__label">${trait.emoji} ${trait.label}</span>
                      <div class="avatar-trait-summary__bar">
                        <div
                          class="avatar-trait-summary__fill"
                          style="width:${pct}%;background:hsl(${220 + pct * 1.2},70%,55%)"
                        ></div>
                      </div>
                      <span class="avatar-trait-summary__pct">${pct}%</span>
                    </div>
                  `;
                })}
              </div>
            </div>
          `
        : nothing}
    </div>
  `;
}

// ─── Diagnostics ─────────────────────────────────────────────────

function renderDiagnosticsSection(props: AvatarProps): TemplateResult {
  const d = props.diagnostics;

  if (!d) {
    return html`<div class="republic-card republic-card--wide">
      <p class="republic-card__empty">No diagnostics data available. Click Refresh to load.</p>
    </div>`;
  }

  return html`
    <div class="avatar-diagnostics">
      <div class="republic-metrics republic-metrics--grid">
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${d.activeSessions}</div>
          <div class="republic-metric__label">Active Sessions</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${d.totalInteractions.toLocaleString()}</div>
          <div class="republic-metric__label">Total Interactions</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${d.blendshapeCount}</div>
          <div class="republic-metric__label">Blendshapes</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${formatUptime(d.uptime)}</div>
          <div class="republic-metric__label">Uptime</div>
        </div>
      </div>

      <div class="republic-card republic-card--wide">
        <div class="republic-card__header"><h3>Supported Emotions</h3></div>
        <div class="avatar-emotion-grid">
          ${d.supportedEmotions.map(
            (e) => html`
              <span class="avatar-emotion-tag">
                ${EMOTION_EMOJI[e] ?? "❓"} ${e}
              </span>
            `,
          )}
        </div>
      </div>

      <div class="republic-card republic-card--wide">
        <div class="republic-card__header"><h3>Active Sessions</h3></div>
        ${props.sessions.length > 0
          ? html`
              <div class="republic-list">
                ${props.sessions.map(
                  (s) => html`
                    <div class="republic-list__item">
                      <span class="republic-dot" style="background:#10b981"></span>
                      <div>
                        <strong>${s.userId}</strong>
                        <span style="color:var(--text-secondary)">
                          · ${s.turnCount} turns
                          · ${new Date(s.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <button type="button"
                        class="republic-btn republic-btn--danger republic-btn--sm"
                        @click=${() => props.onEndSession(s.sessionId)}
                      >
                        End
                      </button>
                    </div>
                  `,
                )}
              </div>
            `
          : html`<p class="republic-card__empty">No active sessions</p>`}
      </div>

      ${d.personality
        ? html`
            <div class="republic-card republic-card--wide">
              <div class="republic-card__header"><h3>Current Personality Snapshot</h3></div>
              <div class="republic-metrics" style="flex-wrap:wrap">
                ${Object.entries(d.personality).map(
                  ([k, v]) => html`
                    <div class="republic-metric republic-metric--card" style="min-width:120px">
                      <div class="republic-metric__value">${((v as number) * 100).toFixed(0)}%</div>
                      <div class="republic-metric__label">${k}</div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}
    </div>
  `;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) {return `${seconds}s`;}
  if (seconds < 3600) {return `${Math.floor(seconds / 60)}m`;}
  if (seconds < 86400) {return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;}
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
