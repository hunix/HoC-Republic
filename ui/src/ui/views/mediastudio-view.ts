/**
 * Republic View — Media Studio
 *
 * Unified UI for accessing GPU plugin capabilities:
 * - Image generation (OmniGen, GLM, Switti, KV-Edit, Deforum, StoryDiffusion)
 * - Video generation (Deforum, StoryDiffusion, StableAvatar, MagicAnimate)
 * - Audio generation (MMAudio, Bark, FunMusic)
 * - Music generation (FunMusic)
 * - Voice generation (Chatterbox, Bark, Qwen3-TTS)
 * - 3D generation (SPARC3D)
 */

import { html, nothing, type TemplateResult } from "lit";

// ─── Types ───────────────────────────────────────────────────────

export interface MediaCapabilityInfo {
  availableCapabilities: string[];
  pluginsByCapability: Record<string, string[]>;
  totalMediaPlugins: number;
}

export interface MediaGeneration {
  id: string;
  type: string;
  prompt: string;
  status: "pending" | "complete" | "error";
  result: {
    success?: boolean;
    provider?: string;
    base64?: string;
    outputPath?: string;
    jobId?: string;
    error?: string;
  } | null;
  createdAt: number;
  completedAt: number | null;
  error: string | null;
}

export interface MediaStudioProps {
  loading: boolean;
  capabilities: MediaCapabilityInfo | null;
  history: MediaGeneration[];
  generating: boolean;
  selectedType: string;
  prompt: string;
  error: string | null;
  onRefresh: () => void;
  onGenerate: (type: string, prompt: string, options?: Record<string, unknown>) => void;
  onTypeChange: (type: string) => void;
  onPromptChange: (prompt: string) => void;
}

// ─── Constants ───────────────────────────────────────────────────

interface MediaTypeInfo {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  capabilities: string[];
}

const MEDIA_TYPES: MediaTypeInfo[] = [
  {
    key: "image",
    label: "Image",
    icon: "🎨",
    color: "#a855f7",
    description: "Generate images from text prompts using diffusion models",
    capabilities: ["text-to-image", "image-generation"],
  },
  {
    key: "video",
    label: "Video",
    icon: "🎬",
    color: "#ef4444",
    description: "Create videos from text or image inputs",
    capabilities: ["text-to-video", "image-to-video"],
  },
  {
    key: "audio",
    label: "Audio",
    icon: "🔊",
    color: "#f97316",
    description: "Generate sound effects and audio from text",
    capabilities: ["audio-generation", "video-to-audio"],
  },
  {
    key: "music",
    label: "Music",
    icon: "🎵",
    color: "#06b6d4",
    description: "Compose music tracks from text descriptions",
    capabilities: ["text-to-music"],
  },
  {
    key: "voice",
    label: "Voice",
    icon: "🗣️",
    color: "#10b981",
    description: "Generate speech from text with various voices",
    capabilities: ["text-to-speech"],
  },
  {
    key: "3d",
    label: "3D Model",
    icon: "🧊",
    color: "#6366f1",
    description: "Generate 3D models from text or images",
    capabilities: ["text-to-3d", "image-to-3d"],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────

function isAvailable(type: MediaTypeInfo, caps: MediaCapabilityInfo | null): boolean {
  if (!caps) {return false;}
  return type.capabilities.some((c) => caps.availableCapabilities.includes(c));
}

function getPluginsForType(type: MediaTypeInfo, caps: MediaCapabilityInfo | null): string[] {
  if (!caps) {return [];}
  const plugins: string[] = [];
  for (const cap of type.capabilities) {
    const p = caps.pluginsByCapability[cap];
    if (p) {plugins.push(...p);}
  }
  return [...new Set(plugins)];
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) {return "just now";}
  const m = Math.floor(s / 60);
  if (m < 60) {return `${m}m ago`;}
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ─── Render ──────────────────────────────────────────────────────

export function renderMediaStudio(props: MediaStudioProps): TemplateResult {
  if (props.loading && !props.capabilities) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading Media Studio…</p>
      </div>
    `;
  }

  const availableCount = MEDIA_TYPES.filter((t) => isAvailable(t, props.capabilities)).length;

  return html`
    <div class="republic-view" style="max-width:1200px;margin:0 auto">

      <!-- Header -->
      <div class="republic-card" style="margin-bottom:1rem;background:linear-gradient(135deg,rgba(168,85,247,0.1),rgba(99,102,241,0.1));border-color:rgba(168,85,247,0.3)">
        <div class="republic-card__body" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <h2 style="margin:0 0 4px 0;font-size:1.2rem;display:flex;align-items:center;gap:8px">
              🎛️ Media Studio
            </h2>
            <p style="margin:0;font-size:0.82rem;color:var(--text-secondary)">
              Generate images, videos, audio, music, voice, and 3D models using GPU plugins
            </p>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:0.78rem;color:var(--text-muted)">
              ${availableCount}/${MEDIA_TYPES.length} capabilities online
            </span>
            <button type="button" class="republic-btn republic-btn--sm" @click=${props.onRefresh}>↻ Refresh</button>
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="republic-metrics republic-metrics--grid" style="margin-bottom:1rem">
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value" style="color:#a855f7">${props.capabilities?.totalMediaPlugins ?? 0}</div>
          <div class="republic-metric__label">Media Plugins</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value" style="color:#10b981">${availableCount}</div>
          <div class="republic-metric__label">Available Types</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value" style="color:#06b6d4">${props.capabilities?.availableCapabilities.length ?? 0}</div>
          <div class="republic-metric__label">Capabilities</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value" style="color:#f97316">${props.history.length}</div>
          <div class="republic-metric__label">Generations</div>
        </div>
      </div>

      <!-- Capability Cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.75rem;margin-bottom:1.5rem">
        ${MEDIA_TYPES.map((type) => {
          const available = isAvailable(type, props.capabilities);
          const plugins = getPluginsForType(type, props.capabilities);
          const selected = props.selectedType === type.key;
          return html`
            <div class="republic-card"
              style="cursor:pointer;border-color:${selected ? type.color : available ? type.color + "40" : "var(--border-color)"};
                     background:${selected ? type.color + "15" : "var(--bg-card,#1a1a2e)"};
                     transition:all 0.2s;opacity:${available ? 1 : 0.5}"
              @click=${() => available && props.onTypeChange(type.key)}>
              <div style="padding:1rem;text-align:center">
                <div style="font-size:2rem;margin-bottom:0.5rem">${type.icon}</div>
                <div style="font-weight:700;font-size:0.9rem;margin-bottom:0.3rem">${type.label}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.5rem">${type.description}</div>
                ${
                  available
                    ? html`<span class="republic-badge" style="background:${type.color}20;color:${type.color};font-size:0.65rem">
                      ${plugins.length} plugin${plugins.length !== 1 ? "s" : ""} ready
                    </span>`
                    : html`
                        <span class="republic-badge" style="background: #6b728020; color: #6b7280; font-size: 0.65rem"
                          >No plugins active</span
                        >
                      `
                }
              </div>
            </div>
          `;
        })}
      </div>

      <!-- Generation Form -->
      ${props.selectedType ? renderGenerationForm(props) : nothing}

      <!-- Error -->
      ${
        props.error
          ? html`
        <div class="republic-card" style="margin-bottom:1rem;border-color:#ef4444">
          <div class="republic-card__body" style="color:#ef4444;font-size:0.85rem">
            ⚠️ ${props.error}
          </div>
        </div>
      `
          : nothing
      }

      <!-- Generation History -->
      ${props.history.length > 0 ? renderHistory(props) : nothing}
    </div>
  `;
}

// ─── Generation Form ─────────────────────────────────────────────

function renderGenerationForm(props: MediaStudioProps): TemplateResult {
  const type = MEDIA_TYPES.find((t) => t.key === props.selectedType);
  if (!type) {return html``;}

  return html`
    <div class="republic-card" style="margin-bottom:1.5rem;border-color:${type.color}40">
      <div class="republic-card__body">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:1rem">
          <span style="font-size:1.5rem">${type.icon}</span>
          <h3 style="margin:0;font-size:1rem">Generate ${type.label}</h3>
          <button type="button" class="republic-btn republic-btn--sm" style="margin-left:auto;font-size:0.7rem"
            @click=${() => props.onTypeChange("")}>✕ Close</button>
        </div>

        <div style="display:flex;gap:0.75rem;align-items:stretch">
          <textarea
            placeholder="Describe what you want to generate…"
            .value=${props.prompt}
            @input=${(e: Event) => props.onPromptChange((e.target as HTMLTextAreaElement).value)}
            style="flex:1;min-height:80px;padding:0.75rem;border:1px solid var(--border-color,#333);border-radius:8px;
                   background:var(--bg-secondary,#0f0f23);color:var(--text-primary,#fff);font-family:inherit;font-size:0.88rem;
                   resize:vertical"
            ?disabled=${props.generating}
          ></textarea>
          <button type="button"
            class="republic-btn"
            style="padding:0 1.5rem;font-size:0.9rem;background:${type.color}20;border-color:${type.color};color:${type.color};
                   min-width:120px;font-weight:700;letter-spacing:0.5px"
            ?disabled=${props.generating || !props.prompt.trim()}
            @click=${() => props.onGenerate(props.selectedType, props.prompt.trim())}
          >
            ${
              props.generating
                ? html`
                    <span style="animation: spin 1s linear infinite; display: inline-block">⏳</span> Working…
                  `
                : html`${type.icon} Generate`
            }
          </button>
        </div>

        <!-- Type-specific hints -->
        <div style="margin-top:0.75rem;font-size:0.75rem;color:var(--text-muted)">
          ${
            type.key === "image"
              ? html`
                  💡 <strong>Tip:</strong> Be descriptive — include style, lighting, composition, and subject details.
                `
              : nothing
          }
          ${
            type.key === "video"
              ? html`
                  💡 <strong>Tip:</strong> Describe the scene, motion, and transitions you want.
                `
              : nothing
          }
          ${
            type.key === "audio"
              ? html`
                  💡 <strong>Tip:</strong> Describe the sound effect or audio atmosphere.
                `
              : nothing
          }
          ${
            type.key === "music"
              ? html`
                  💡 <strong>Tip:</strong> Specify genre, mood, tempo, and instruments.
                `
              : nothing
          }
          ${
            type.key === "voice"
              ? html`
                  💡 <strong>Tip:</strong> Write the text to be spoken. The system will select an appropriate voice.
                `
              : nothing
          }
          ${
            type.key === "3d"
              ? html`
                  💡 <strong>Tip:</strong> Describe the 3D object — shape, material, color, and style.
                `
              : nothing
          }
        </div>
      </div>
    </div>
  `;
}

// ─── History ─────────────────────────────────────────────────────

function renderHistory(props: MediaStudioProps): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__body">
        <h3 style="margin:0 0 1rem 0;font-size:0.95rem;display:flex;align-items:center;gap:6px">
          📋 Generation History
          <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400">(${props.history.length})</span>
        </h3>

        <div style="display:flex;flex-direction:column;gap:0.5rem">
          ${props.history.slice(0, 20).map((gen) => {
            const type = MEDIA_TYPES.find((t) => t.key === gen.type);
            const statusColor =
              gen.status === "complete"
                ? "#10b981"
                : gen.status === "error"
                  ? "#ef4444"
                  : "#fbbf24";
            const statusIcon =
              gen.status === "complete" ? "✅" : gen.status === "error" ? "❌" : "⏳";
            return html`
              <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0.75rem;border-radius:8px;
                          background:var(--bg-secondary,#0f0f23);border:1px solid var(--border-color,#222)">
                <span style="font-size:1.2rem;flex-shrink:0">${type?.icon ?? "🔌"}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:0.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${gen.prompt}
                  </div>
                  <div style="font-size:0.72rem;color:var(--text-muted);display:flex;gap:8px;margin-top:2px">
                    <span style="color:${type?.color ?? "#999"}">${type?.label ?? gen.type}</span>
                    <span>${timeAgo(gen.createdAt)}</span>
                    ${gen.result?.provider ? html`<span>via ${gen.result.provider}</span>` : nothing}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                  <span style="font-size:0.75rem;color:${statusColor}">${statusIcon} ${gen.status}</span>
                  ${
                    gen.result?.outputPath
                      ? html`
                    <a href="${gen.result.outputPath}" target="_blank" rel="noopener"
                       style="font-size:0.72rem;color:#60a5fa;text-decoration:none">📁 Open</a>
                  `
                      : nothing
                  }
                  ${
                    gen.result?.base64
                      ? html`
                          <span style="font-size: 0.72rem; color: #10b981">📷 Preview</span>
                        `
                      : nothing
                  }
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    </div>
  `;
}
