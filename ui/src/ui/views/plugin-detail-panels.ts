/**
 * Plugin Detail Panels — Per-Plugin Interactive UIs
 *
 * Renders rich, specialized UI panels for each of the 29 HoC plugins.
 * Each plugin gets a full-featured control panel with:
 * - Dynamic forms for tool invocation
 * - Job queue status monitoring
 * - Plugin-specific configuration
 * - Output previews (images, audio, video, 3D)
 *
 * Categories:
 *   Creative (11): FaceFusion, DeepFaceLab, MagicAnimate, StoryDiffusion,
 *                  StableAvatar, Deforum, OmniGen, GLM-Image, Switti, KV-Edit, SPARC3D
 *   Audio (5): Chatterbox, Bark, Qwen3-TTS, FunMusic, MMAudio
 *   Agentic (7): AutoGPT, OpenManus-RL, Magentic-One, DGM, A2A, AI-Scientist, Claude-Code
 *   Builder (3): Open-Lovable, UI/UX Pro Max, LingBot-World
 *   Core (1): Superpowers
 *   Other (2): EasyVolCap, Echo
 */

import { html, nothing, type TemplateResult } from "lit";

// ─── Shared Types ────────────────────────────────────────────────

export interface PluginPanelCallbacks {
  onInvokeTool: (pluginId: string, toolName: string, params: Record<string, unknown>) => void;
  onCallGateway: (method: string, params: Record<string, unknown>) => void;
}

// ─── Panel Registry ──────────────────────────────────────────────

const PANEL_REGISTRY: Record<string, (cbs: PluginPanelCallbacks) => TemplateResult> = {
  // Creative
  "hoc-plugin-omnigen": (cbs) =>
    renderImageGenPanel(
      "OmniGen",
      "omnigen_generate",
      "Multi-modal image generation — supports text-to-image and reference-guided generation",
      cbs,
      { supportsRefImages: true },
    ),
  "hoc-plugin-glm-image": (cbs) =>
    renderImageGenPanel(
      "GLM-Image",
      "glm_generate_image",
      "High-quality image generation and editing from CogView/GLM family",
      cbs,
      { supportsEdit: true, editTool: "glm_edit_image" },
    ),
  "hoc-plugin-switti": (cbs) =>
    renderImageGenPanel(
      "Switti",
      "switti_generate",
      "Fast scale-wise transformer for text-to-image (CVPR 2025)",
      cbs,
      {},
    ),
  "hoc-plugin-kv-edit": (cbs) => renderImageEditPanel(cbs),
  "hoc-plugin-deforum": (cbs) =>
    renderVideoGenPanel(
      "Deforum",
      "deforum_generate",
      "AI-driven animation — animated sequences from text with camera motion, zoom, pan, and transitions",
      cbs,
    ),
  "hoc-plugin-storydiffusion": (cbs) => renderStoryDiffusionPanel(cbs),
  "hoc-plugin-magicanimate": (cbs) =>
    renderAnimationPanel(
      "MagicAnimate",
      "magicanimate_animate",
      "Temporally consistent human animation — bring images to life with motion sequences",
      cbs,
    ),
  "hoc-plugin-stable-avatar": (cbs) => renderTalkingHeadPanel(cbs),
  "hoc-plugin-facefusion": (cbs) => renderFaceFusionPanel(cbs),
  "hoc-plugin-deepfacelab": (cbs) => renderDeepFaceLabPanel(cbs),
  "hoc-plugin-sparc3d": (cbs) => render3DGenPanel(cbs),
  // Audio
  "hoc-plugin-chatterbox": (cbs) =>
    renderTTSPanel(
      "Chatterbox",
      "chatterbox_speak",
      "Expressive TTS with voice cloning from reference audio (0.5s sample)",
      cbs,
      { supportsCloning: false },
    ),
  "hoc-plugin-bark": (cbs) =>
    renderTTSPanel(
      "Bark",
      "bark_generate",
      "Multi-language audio — speech, music, sound effects, and nonverbal cues",
      cbs,
      { supportsMusic: true },
    ),
  "hoc-plugin-qwen3-tts": (cbs) => renderQwen3TTSPanel(cbs),
  "hoc-plugin-funmusic": (cbs) => renderMusicGenPanel(cbs),
  "hoc-plugin-mmaudio": (cbs) => renderMMAudioPanel(cbs),
  // Agentic
  "hoc-plugin-autogpt": (cbs) =>
    renderAgenticPanel(
      "AutoGPT",
      "Autonomous AI agent — set objectives, let the agent plan and execute tasks independently",
      cbs,
      "autogpt",
    ),
  "hoc-plugin-openmanus-rl": (cbs) =>
    renderAgenticPanel(
      "OpenManus RL",
      "Reinforcement learning agent training — train and evaluate AI agents on custom tasks",
      cbs,
      "openmanus",
    ),
  "hoc-plugin-magentic-one": (cbs) =>
    renderAgenticPanel(
      "Magentic-One",
      "Multi-agent orchestration — coordinate specialized agents for complex problem-solving",
      cbs,
      "magentic",
    ),
  "hoc-plugin-dgm": (cbs) =>
    renderAgenticPanel(
      "DGM",
      "Dynamic Graph Memory — persistent graph-based memory for agents with relationship tracking",
      cbs,
      "dgm",
    ),
  "hoc-plugin-a2a": (cbs) =>
    renderAgenticPanel(
      "A2A Protocol",
      "Agent-to-Agent communication — Google's protocol for inter-agent collaboration",
      cbs,
      "a2a",
    ),
  "hoc-plugin-ai-scientist": (cbs) =>
    renderAgenticPanel(
      "AI-Scientist",
      "Automated scientific research — hypothesis generation, experiment design, paper writing",
      cbs,
      "ai-scientist",
    ),
  "hoc-plugin-awesome-claude-code": (cbs) => renderClaudeCodePanel(cbs),
  // Builder
  "hoc-plugin-open-lovable": (cbs) =>
    renderBuilderPanel(
      "Open Lovable",
      "Website cloning — replicate any website's design with a URL",
      cbs,
      "lovable",
    ),
  "hoc-plugin-uiux-promax": (cbs) => renderUIUXPanel(cbs),
  "hoc-plugin-lingbot-world": (cbs) => renderLingBotPanel(cbs),
  // Core
  "hoc-plugin-superpowers": (cbs) => renderSuperpowersPanel(cbs),
  // Other
  "hoc-plugin-easyvolcap": (cbs) =>
    renderGenericPluginPanel(
      "EasyVolCap",
      "Volumetric video capture — reconstruct 3D scenes from multi-view video",
      cbs,
    ),
  "hoc-plugin-echo": (cbs) => renderEchoPanel(cbs),
};

/**
 * Get the specialized panel renderer for a given plugin ID.
 * Returns null if no specialized panel exists.
 */
export function getPluginPanel(
  pluginId: string,
  callbacks: PluginPanelCallbacks,
): TemplateResult | null {
  const renderer = PANEL_REGISTRY[pluginId];
  if (!renderer) {
    return null;
  }
  return renderer(callbacks);
}

/**
 * Check if a plugin has a specialized interactive panel.
 */
export function hasPluginPanel(pluginId: string): boolean {
  return pluginId in PANEL_REGISTRY;
}

// ─── Shared Form Helpers ─────────────────────────────────────────

function inputField(id: string, label: string, placeholder: string, type = "text"): TemplateResult {
  return html`
    <div style="margin-bottom:0.6rem">
      <label for="${id}" style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem">${label}</label>
      <input id="${id}" type="${type}" placeholder="${placeholder}"
        style="width:100%;padding:0.5rem;border:1px solid var(--border-color,#333);border-radius:6px;
               background:var(--bg-secondary,#0f0f23);color:var(--text-primary,#fff);font-size:0.82rem;box-sizing:border-box" />
    </div>
  `;
}

function textareaField(id: string, label: string, placeholder: string, rows = 3): TemplateResult {
  return html`
    <div style="margin-bottom:0.6rem">
      <label for="${id}" style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem">${label}</label>
      <textarea id="${id}" rows="${rows}" placeholder="${placeholder}"
        style="width:100%;padding:0.5rem;border:1px solid var(--border-color,#333);border-radius:6px;
               background:var(--bg-secondary,#0f0f23);color:var(--text-primary,#fff);font-size:0.82rem;
               resize:vertical;font-family:inherit;box-sizing:border-box"></textarea>
    </div>
  `;
}

function selectField(
  id: string,
  label: string,
  options: { value: string; label: string }[],
): TemplateResult {
  return html`
    <div style="margin-bottom:0.6rem">
      <label for="${id}" style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem">${label}</label>
      <select id="${id}"
        style="width:100%;padding:0.5rem;border:1px solid var(--border-color,#333);border-radius:6px;
               background:var(--bg-secondary,#0f0f23);color:var(--text-primary,#fff);font-size:0.82rem;box-sizing:border-box">
        ${options.map((o) => html`<option value="${o.value}">${o.label}</option>`)}
      </select>
    </div>
  `;
}

function numberField(
  id: string,
  label: string,
  defaultVal: number,
  min?: number,
  max?: number,
  step?: number,
): TemplateResult {
  return html`
    <div style="margin-bottom:0.6rem">
      <label for="${id}" style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem">${label}</label>
      <input id="${id}" type="number" .value="${String(defaultVal)}"
        min="${min ?? ""}" max="${max ?? ""}" step="${step ?? 1}"
        style="width:100%;padding:0.5rem;border:1px solid var(--border-color,#333);border-radius:6px;
               background:var(--bg-secondary,#0f0f23);color:var(--text-primary,#fff);font-size:0.82rem;box-sizing:border-box" />
    </div>
  `;
}

function actionButton(
  label: string,
  color: string,
  onClick: () => void,
  icon = "▶",
): TemplateResult {
  return html`
    <button type="button" class="republic-btn republic-btn--sm"
      style="background:${color}20;border-color:${color};color:${color};font-weight:600;padding:0.4rem 1rem"
      @click=${onClick}>
      ${icon} ${label}
    </button>
  `;
}

function sectionHeader(title: string, emoji: string): TemplateResult {
  return html`
    <div style="font-size:0.88rem;font-weight:700;margin:0.75rem 0 0.5rem;display:flex;align-items:center;gap:6px">
      <span>${emoji}</span> ${title}
    </div>
  `;
}

function panelWrapper(title: string, description: string, content: TemplateResult): TemplateResult {
  return html`
    <div style="margin-top:0.75rem;padding:0.75rem;background:var(--bg-secondary,#0f0f23);border-radius:8px;border:1px solid var(--border-color,#222)">
      <div style="font-size:0.85rem;font-weight:700;margin-bottom:0.25rem">${title}</div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.75rem">${description}</div>
      ${content}
    </div>
  `;
}

function getInputValue(id: string): string {
  const el = document.getElementById(id) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | null;
  return el?.value ?? "";
}

function getNumericValue(id: string, fallback: number): number {
  const v = parseFloat(getInputValue(id));
  return isNaN(v) ? fallback : v;
}

// ═══════════════════════════════════════════════════════════════════
// CREATIVE PANELS
// ═══════════════════════════════════════════════════════════════════

function renderImageGenPanel(
  name: string,
  toolName: string,
  description: string,
  cbs: PluginPanelCallbacks,
  opts: { supportsRefImages?: boolean; supportsEdit?: boolean; editTool?: string },
): TemplateResult {
  const pfx = toolName.replace(/_/g, "-");
  return panelWrapper(
    `${name} — Image Generation`,
    description,
    html`
    ${textareaField(`${pfx}-prompt`, "Prompt", "Describe the image you want to generate…")}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${numberField(`${pfx}-width`, "Width", 1024, 256, 4096, 64)}
      ${numberField(`${pfx}-height`, "Height", 1024, 256, 4096, 64)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${numberField(`${pfx}-steps`, "Steps", 30, 1, 150)}
      ${numberField(`${pfx}-guidance`, "Guidance Scale", 7.5, 1, 30, 0.5)}
    </div>
    ${numberField(`${pfx}-seed`, "Seed (0 = random)", 0, 0)}
    ${
      opts.supportsRefImages
        ? html`
      ${inputField(`${pfx}-ref`, "Reference Image Path (optional)", "/path/to/reference.png")}
    `
        : nothing
    }
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Generate",
        "#a855f7",
        () => {
          const params: Record<string, unknown> = {
            prompt: getInputValue(`${pfx}-prompt`),
            width: getNumericValue(`${pfx}-width`, 1024),
            height: getNumericValue(`${pfx}-height`, 1024),
            steps: getNumericValue(`${pfx}-steps`, 30),
            guidance_scale: getNumericValue(`${pfx}-guidance`, 7.5),
            seed: getNumericValue(`${pfx}-seed`, 0) || undefined,
          };
          if (opts.supportsRefImages) {
            const ref = getInputValue(`${pfx}-ref`);
            if (ref) {
              params.input_images = [ref];
            }
          }
          cbs.onInvokeTool("", toolName, params);
        },
        "🎨",
      )}
      ${
        opts.supportsEdit && opts.editTool
          ? actionButton(
              "Edit Image",
              "#06b6d4",
              () => {
                cbs.onInvokeTool("", opts.editTool!, {
                  prompt: getInputValue(`${pfx}-prompt`),
                  input_images: [getInputValue(`${pfx}-ref`) || ""],
                });
              },
              "✏️",
            )
          : nothing
      }
    </div>
  `,
  );
}

function renderImageEditPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "KV-Edit — Image Editing & Inpainting",
    "Precision image editing with key-value attention manipulation — inpainting, style transfer, and localized edits",
    html`
    ${textareaField("kvedit-prompt", "Edit Prompt", "Describe what you want to change in the image…")}
    ${inputField("kvedit-input", "Input Image Path", "/path/to/input.png")}
    ${inputField("kvedit-mask", "Mask Image Path (for inpainting)", "/path/to/mask.png")}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${numberField("kvedit-width", "Width", 1024, 256, 4096, 64)}
      ${numberField("kvedit-height", "Height", 1024, 256, 4096, 64)}
    </div>
    ${selectField("kvedit-mode", "Edit Mode", [
      { value: "inpaint", label: "Inpaint (fill masked region)" },
      { value: "edit", label: "Edit (modify entire image)" },
      { value: "style", label: "Style Transfer" },
    ])}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Generate",
        "#a855f7",
        () => {
          cbs.onInvokeTool("", "kv_edit_generate", {
            prompt: getInputValue("kvedit-prompt"),
            input_image: getInputValue("kvedit-input"),
            width: getNumericValue("kvedit-width", 1024),
            height: getNumericValue("kvedit-height", 1024),
          });
        },
        "🎨",
      )}
      ${actionButton(
        "Inpaint",
        "#10b981",
        () => {
          cbs.onInvokeTool("", "kv_edit_inpaint", {
            prompt: getInputValue("kvedit-prompt"),
            input_image: getInputValue("kvedit-input"),
            mask_image: getInputValue("kvedit-mask"),
          });
        },
        "🖌️",
      )}
    </div>
  `,
  );
}

// ─── Video Generation Panels ─────────────────────────────────────

function renderVideoGenPanel(
  name: string,
  toolName: string,
  description: string,
  cbs: PluginPanelCallbacks,
): TemplateResult {
  const pfx = toolName.replace(/_/g, "-");
  return panelWrapper(
    `${name} — Video Generation`,
    description,
    html`
    ${textareaField(`${pfx}-prompt`, "Prompt", "Describe the video scene, motion, and transitions…")}
    ${inputField(`${pfx}-input-img`, "Input Image (optional)", "/path/to/starting-frame.png")}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem">
      ${numberField(`${pfx}-frames`, "Frames", 60, 10, 300)}
      ${numberField(`${pfx}-fps`, "FPS", 24, 12, 60)}
      ${numberField(`${pfx}-steps`, "Steps", 30, 10, 100)}
    </div>
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Generate Video",
        "#ef4444",
        () => {
          cbs.onInvokeTool("", toolName, {
            prompt: getInputValue(`${pfx}-prompt`),
            input_image: getInputValue(`${pfx}-input-img`) || undefined,
            num_frames: getNumericValue(`${pfx}-frames`, 60),
            fps: getNumericValue(`${pfx}-fps`, 24),
            steps: getNumericValue(`${pfx}-steps`, 30),
          });
        },
        "🎬",
      )}
    </div>

    ${sectionHeader("Job Management", "📡")}
    ${inputField(`${pfx}-job-id`, "Job ID", "job-id-here")}
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      ${actionButton(
        "Job Status",
        "#10b981",
        () => {
          cbs.onCallGateway(`${name.toLowerCase().replace(/\s+/g, "")}.job-status`, {
            jobId: getInputValue(`${pfx}-job-id`),
          });
        },
        "🔍",
      )}
      ${actionButton(
        "Queue",
        "#06b6d4",
        () => {
          cbs.onCallGateway(`${name.toLowerCase().replace(/\s+/g, "")}.queue-status`, {});
        },
        "📊",
      )}
      ${actionButton(
        "Cancel",
        "#ef4444",
        () => {
          cbs.onCallGateway(`${name.toLowerCase().replace(/\s+/g, "")}.cancel`, {
            jobId: getInputValue(`${pfx}-job-id`),
          });
        },
        "⏹",
      )}
    </div>
  `,
  );
}

function renderStoryDiffusionPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "StoryDiffusion — Story & Comic Generation",
    "Character-consistent story sequences, comic panels, and animated videos (NeurIPS 2024)",
    html`
    ${textareaField("story-prompt", "Story Description", "Describe the story, characters, and scenes…")}
    ${numberField("story-panels", "Number of Panels", 4, 2, 12)}
    ${selectField("story-style", "Visual Style", [
      { value: "comic", label: "Comic Book" },
      { value: "manga", label: "Manga" },
      { value: "realistic", label: "Realistic" },
      { value: "watercolor", label: "Watercolor" },
      { value: "3d-render", label: "3D Render" },
    ])}
    ${selectField("story-output", "Output Type", [
      { value: "comic", label: "Comic Strip (Image Sequence)" },
      { value: "video", label: "Animated Video" },
    ])}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Generate Comic",
        "#a855f7",
        () => {
          cbs.onInvokeTool("", "storydiffusion_generate_comic", {
            prompt: getInputValue("story-prompt"),
            num_panels: getNumericValue("story-panels", 4),
            style: getInputValue("story-style"),
          });
        },
        "📖",
      )}
      ${actionButton(
        "Generate Video",
        "#ef4444",
        () => {
          cbs.onInvokeTool("", "storydiffusion_generate_video", {
            prompt: getInputValue("story-prompt"),
            style: getInputValue("story-style"),
          });
        },
        "🎬",
      )}
    </div>
  `,
  );
}

function renderAnimationPanel(
  name: string,
  toolName: string,
  description: string,
  cbs: PluginPanelCallbacks,
): TemplateResult {
  const pfx = toolName.replace(/_/g, "-");
  return panelWrapper(
    `${name} — Animation`,
    description,
    html`
    ${inputField(`${pfx}-source`, "Source Image", "/path/to/character.png")}
    ${inputField(`${pfx}-motion`, "Motion Reference (video or pose sequence)", "/path/to/motion.mp4")}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${numberField(`${pfx}-frames`, "Frames", 60, 10, 300)}
      ${numberField(`${pfx}-fps`, "FPS", 24, 12, 60)}
    </div>
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Animate",
        "#ef4444",
        () => {
          cbs.onInvokeTool("", toolName, {
            source_image: getInputValue(`${pfx}-source`),
            motion_reference: getInputValue(`${pfx}-motion`),
            num_frames: getNumericValue(`${pfx}-frames`, 60),
            fps: getNumericValue(`${pfx}-fps`, 24),
          });
        },
        "🎭",
      )}
    </div>
  `,
  );
}

function renderTalkingHeadPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "StableAvatar — Talking Head Video",
    "Audio-driven avatar video — infinite-length lip-sync from a single reference image + audio",
    html`
    ${inputField("avatar-ref", "Reference Image", "/path/to/face.png")}
    ${inputField("avatar-audio", "Driving Audio", "/path/to/speech.wav")}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${numberField("avatar-fps", "FPS", 25, 12, 60)}
      ${selectField("avatar-quality", "Quality", [
        { value: "fast", label: "Fast (lower quality)" },
        { value: "balanced", label: "Balanced" },
        { value: "best", label: "Best (slower)" },
      ])}
    </div>
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Generate Talking Head",
        "#ef4444",
        () => {
          cbs.onInvokeTool("", "stableavatar_generate", {
            reference_image: getInputValue("avatar-ref"),
            audio: getInputValue("avatar-audio"),
            fps: getNumericValue("avatar-fps", 25),
            quality: getInputValue("avatar-quality"),
          });
        },
        "🗣️",
      )}
    </div>
  `,
  );
}

function renderFaceFusionPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "FaceFusion — Face Processing Suite",
    "Real-time face swap, enhance, video processing — 8 tools with GPU acceleration",
    html`
    ${sectionHeader("Face Swap", "👤")}
    ${inputField("ff-source", "Source Image/Video", "/path/to/source.png")}
    ${inputField("ff-target", "Target Face Image", "/path/to/target-face.png")}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Swap Face",
        "#a855f7",
        () => {
          cbs.onInvokeTool("", "ff_swap_face", {
            source: getInputValue("ff-source"),
            target: getInputValue("ff-target"),
          });
        },
        "👤",
      )}
      ${actionButton(
        "Enhance Face",
        "#10b981",
        () => {
          cbs.onInvokeTool("", "ff_enhance_face", {
            source: getInputValue("ff-source"),
          });
        },
        "✨",
      )}
      ${actionButton(
        "Enhance Video",
        "#06b6d4",
        () => {
          cbs.onInvokeTool("", "ff_enhance_video", {
            source: getInputValue("ff-source"),
          });
        },
        "🎬",
      )}
    </div>

    ${sectionHeader("Job Queue", "📋")}
    <div style="display:flex;gap:0.5rem">
      ${actionButton(
        "Submit Job",
        "#f97316",
        () => {
          cbs.onInvokeTool("", "ff_submit_job", {
            source: getInputValue("ff-source"),
            target: getInputValue("ff-target"),
          });
        },
        "📤",
      )}
      ${actionButton(
        "Queue Status",
        "#06b6d4",
        () => {
          cbs.onCallGateway("facefusion.queue", {});
        },
        "📊",
      )}
      ${actionButton(
        "GPU Status",
        "#10b981",
        () => {
          cbs.onCallGateway("facefusion.gpuStatus", {});
        },
        "🖥️",
      )}
      ${actionButton(
        "List Processors",
        "#6366f1",
        () => {
          cbs.onInvokeTool("", "ff_list_processors", {});
        },
        "📋",
      )}
    </div>

    ${sectionHeader("Job Management", "⚙️")}
    ${inputField("ff-job-id", "Job ID", "job-id-here")}
    <div style="display:flex;gap:0.5rem">
      ${actionButton(
        "Check Status",
        "#10b981",
        () => {
          cbs.onCallGateway("facefusion.status", { jobId: getInputValue("ff-job-id") });
        },
        "🔍",
      )}
      ${actionButton(
        "Cancel Job",
        "#ef4444",
        () => {
          cbs.onCallGateway("facefusion.cancel", { jobId: getInputValue("ff-job-id") });
        },
        "⏹",
      )}
      ${actionButton(
        "Config",
        "#6366f1",
        () => {
          cbs.onCallGateway("facefusion.config", {});
        },
        "⚙️",
      )}
    </div>
  `,
  );
}

function renderDeepFaceLabPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "DeepFaceLab — Professional Face Pipeline",
    "Full pipeline: extract faces → train model → merge — 10 tools with GPU training",
    html`
    ${sectionHeader("Pipeline Management", "🔧")}
    ${inputField("dfl-name", "Pipeline Name", "my-face-project")}
    ${inputField("dfl-source", "Source Video/Images", "/path/to/source.mp4")}
    ${inputField("dfl-target", "Target Video/Images", "/path/to/target.mp4")}
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem">
      ${actionButton(
        "Create Pipeline",
        "#a855f7",
        () => {
          cbs.onInvokeTool("", "dfl_create_pipeline", {
            name: getInputValue("dfl-name"),
            source: getInputValue("dfl-source"),
            target: getInputValue("dfl-target"),
          });
        },
        "🆕",
      )}
      ${actionButton(
        "Start Pipeline",
        "#10b981",
        () => {
          cbs.onInvokeTool("", "dfl_start_pipeline", { name: getInputValue("dfl-name") });
        },
        "▶",
      )}
      ${actionButton(
        "List Pipelines",
        "#06b6d4",
        () => {
          cbs.onInvokeTool("", "dfl_list_pipelines", {});
        },
        "📋",
      )}
    </div>

    ${sectionHeader("Individual Steps", "📊")}
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      ${actionButton(
        "Extract Faces",
        "#f97316",
        () => {
          cbs.onInvokeTool("", "dfl_extract_faces", { source: getInputValue("dfl-source") });
        },
        "🔍",
      )}
      ${actionButton(
        "Train Model",
        "#ef4444",
        () => {
          cbs.onInvokeTool("", "dfl_train_model", { name: getInputValue("dfl-name") });
        },
        "🎓",
      )}
      ${actionButton(
        "Merge Faces",
        "#a855f7",
        () => {
          cbs.onInvokeTool("", "dfl_merge_faces", { name: getInputValue("dfl-name") });
        },
        "🔀",
      )}
    </div>

    ${sectionHeader("Status & Models", "📡")}
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      ${actionButton(
        "Pipeline Status",
        "#10b981",
        () => {
          cbs.onCallGateway("deepfacelab.status", { name: getInputValue("dfl-name") });
        },
        "📊",
      )}
      ${actionButton(
        "List Models",
        "#06b6d4",
        () => {
          cbs.onInvokeTool("", "dfl_list_models", {});
        },
        "📋",
      )}
      ${actionButton(
        "GPU Status",
        "#6366f1",
        () => {
          cbs.onCallGateway("deepfacelab.gpuStatus", {});
        },
        "🖥️",
      )}
      ${actionButton(
        "Cancel",
        "#ef4444",
        () => {
          cbs.onCallGateway("deepfacelab.cancel", { name: getInputValue("dfl-name") });
        },
        "⏹",
      )}
      ${actionButton(
        "Stages",
        "#f97316",
        () => {
          cbs.onCallGateway("deepfacelab.stages", {});
        },
        "📈",
      )}
      ${actionButton(
        "Config",
        "#6366f1",
        () => {
          cbs.onCallGateway("deepfacelab.config", {});
        },
        "⚙️",
      )}
    </div>
  `,
  );
}

function render3DGenPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "SPARC3D — 3D Model Generation",
    "High-resolution 3D shape modeling via sparse representation — text-to-3D and image-to-3D at 1024³ resolution",
    html`
    ${textareaField("sparc3d-prompt", "3D Object Description", "Describe the 3D object — shape, material, color, and style…")}
    ${inputField("sparc3d-input-img", "Input Image (optional, for image-to-3D)", "/path/to/reference.png")}
    ${selectField("sparc3d-format", "Output Format", [
      { value: "glb", label: "GLB (GLTF Binary)" },
      { value: "obj", label: "OBJ + MTL" },
      { value: "ply", label: "PLY (Point Cloud)" },
      { value: "stl", label: "STL (3D Print)" },
    ])}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${numberField("sparc3d-resolution", "Resolution", 256, 64, 1024, 64)}
      ${numberField("sparc3d-steps", "Diffusion Steps", 50, 10, 200)}
    </div>
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Generate 3D",
        "#6366f1",
        () => {
          cbs.onInvokeTool("", "sparc3d_generate", {
            prompt: getInputValue("sparc3d-prompt"),
            input_image: getInputValue("sparc3d-input-img") || undefined,
            output_format: getInputValue("sparc3d-format"),
            resolution: getNumericValue("sparc3d-resolution", 256),
            steps: getNumericValue("sparc3d-steps", 50),
          });
        },
        "🧊",
      )}
    </div>
  `,
  );
}

// ═══════════════════════════════════════════════════════════════════
// AUDIO PANELS
// ═══════════════════════════════════════════════════════════════════

function renderTTSPanel(
  name: string,
  toolName: string,
  description: string,
  cbs: PluginPanelCallbacks,
  opts: { supportsCloning?: boolean; cloneTool?: string; supportsMusic?: boolean },
): TemplateResult {
  const pfx = toolName.replace(/_/g, "-");
  return panelWrapper(
    `${name} — Speech Synthesis`,
    description,
    html`
    ${textareaField(`${pfx}-text`, "Text to Speak", "Enter the text you want to convert to speech…")}
    ${
      opts.supportsCloning
        ? html`
      ${sectionHeader("Voice Cloning", "🎙️")}
      ${inputField(`${pfx}-ref-audio`, "Reference Audio (for voice cloning)", "/path/to/voice_sample.wav")}
    `
        : nothing
    }
    ${selectField(`${pfx}-lang`, "Language", [
      { value: "en", label: "English" },
      { value: "es", label: "Spanish" },
      { value: "fr", label: "French" },
      { value: "de", label: "German" },
      { value: "zh", label: "Chinese" },
      { value: "ja", label: "Japanese" },
      { value: "ko", label: "Korean" },
      { value: "ar", label: "Arabic" },
    ])}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Synthesize",
        "#10b981",
        () => {
          cbs.onInvokeTool("", toolName, {
            text: getInputValue(`${pfx}-text`),
            language: getInputValue(`${pfx}-lang`),
            reference_audio: opts.supportsCloning
              ? getInputValue(`${pfx}-ref-audio`) || undefined
              : undefined,
          });
        },
        "🗣️",
      )}
      ${
        opts.supportsCloning && opts.cloneTool
          ? actionButton(
              "Clone Voice",
              "#06b6d4",
              () => {
                cbs.onInvokeTool("", opts.cloneTool!, {
                  audio_path: getInputValue(`${pfx}-ref-audio`),
                  text: getInputValue(`${pfx}-text`),
                });
              },
              "🎙️",
            )
          : nothing
      }
      ${
        opts.supportsMusic
          ? actionButton(
              "Generate Audio",
              "#f97316",
              () => {
                cbs.onInvokeTool("", toolName, {
                  text: getInputValue(`${pfx}-text`),
                  mode: "music",
                });
              },
              "🎵",
            )
          : nothing
      }
    </div>
  `,
  );
}

function renderQwen3TTSPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "Qwen3-TTS — Voice Synthesis & Cloning",
    "Alibaba Qwen3-TTS — preset voices, voice design from text descriptions, and voice cloning from reference audio",
    html`
    ${sectionHeader("Text-to-Speech", "🗣️")}
    ${textareaField("qwen3-text", "Text to Speak", "Enter text for speech synthesis…")}
    ${inputField("qwen3-voice", "Voice Preset", "default")}
    ${selectField("qwen3-lang", "Language", [
      { value: "en", label: "English" },
      { value: "zh", label: "Chinese" },
      { value: "multilingual", label: "Multilingual" },
    ])}
    ${actionButton(
      "Speak",
      "#10b981",
      () => {
        cbs.onCallGateway("qwen3tts.speak", {
          text: getInputValue("qwen3-text"),
          voice: getInputValue("qwen3-voice"),
          language: getInputValue("qwen3-lang"),
        });
      },
      "🗣️",
    )}

    ${sectionHeader("Voice Design", "🎨")}
    ${textareaField("qwen3-voice-desc", "Voice Description", "Describe the voice — age, gender, tone, accent, emotion…")}
    ${actionButton(
      "Design Voice",
      "#a855f7",
      () => {
        cbs.onCallGateway("qwen3tts.design", {
          description: getInputValue("qwen3-voice-desc"),
        });
      },
      "🎨",
    )}

    ${sectionHeader("Voice Cloning", "🎙️")}
    ${inputField("qwen3-clone-audio", "Reference Audio", "/path/to/voice_sample.wav")}
    ${inputField("qwen3-clone-name", "Voice Name", "my-cloned-voice")}
    ${actionButton(
      "Clone Voice",
      "#06b6d4",
      () => {
        cbs.onCallGateway("qwen3tts.clone", {
          audio_path: getInputValue("qwen3-clone-audio"),
          name: getInputValue("qwen3-clone-name"),
        });
      },
      "🎙️",
    )}
  `,
  );
}

function renderMusicGenPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "FunMusic — AI Music Composition",
    "Generate music tracks from text descriptions — specify genre, mood, tempo, instruments, and duration",
    html`
    ${textareaField("funmusic-prompt", "Music Description", "Describe the music — genre, mood, tempo, instruments, and atmosphere…")}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${selectField("funmusic-genre", "Genre", [
        { value: "ambient", label: "Ambient" },
        { value: "electronic", label: "Electronic" },
        { value: "jazz", label: "Jazz" },
        { value: "classical", label: "Classical" },
        { value: "rock", label: "Rock" },
        { value: "pop", label: "Pop" },
        { value: "hiphop", label: "Hip Hop" },
        { value: "lofi", label: "Lo-Fi" },
        { value: "cinematic", label: "Cinematic" },
        { value: "custom", label: "Custom (use prompt)" },
      ])}
      ${numberField("funmusic-duration", "Duration (seconds)", 30, 5, 300)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${numberField("funmusic-bpm", "BPM", 120, 40, 240)}
      ${selectField("funmusic-mood", "Mood", [
        { value: "happy", label: "Happy" },
        { value: "sad", label: "Sad" },
        { value: "energetic", label: "Energetic" },
        { value: "calm", label: "Calm" },
        { value: "dark", label: "Dark" },
        { value: "epic", label: "Epic" },
        { value: "mysterious", label: "Mysterious" },
      ])}
    </div>
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Compose",
        "#06b6d4",
        () => {
          cbs.onInvokeTool("", "funmusic_generate", {
            prompt: getInputValue("funmusic-prompt"),
            genre: getInputValue("funmusic-genre"),
            duration: getNumericValue("funmusic-duration", 30),
            bpm: getNumericValue("funmusic-bpm", 120),
            mood: getInputValue("funmusic-mood"),
          });
        },
        "🎵",
      )}
    </div>
  `,
  );
}

function renderMMAudioPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "MMAudio — Multi-Modal Audio Generation",
    "Generate synchronized audio for video — sound effects, ambient audio, and Foley from video input",
    html`
    ${inputField("mmaudio-video", "Input Video", "/path/to/video.mp4")}
    ${textareaField("mmaudio-prompt", "Audio Description (optional)", "Describe additional audio elements — sound effects, ambient sounds…")}
    ${selectField("mmaudio-mode", "Generation Mode", [
      { value: "video-to-audio", label: "Video → Audio (auto-detect sounds)" },
      { value: "guided", label: "Guided (video + text prompt)" },
      { value: "sound-effect", label: "Sound Effect (text only)" },
    ])}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Generate Audio",
        "#f97316",
        () => {
          cbs.onInvokeTool("", "mmaudio_generate", {
            video: getInputValue("mmaudio-video"),
            prompt: getInputValue("mmaudio-prompt") || undefined,
            mode: getInputValue("mmaudio-mode"),
          });
        },
        "🔊",
      )}
    </div>
  `,
  );
}

// ═══════════════════════════════════════════════════════════════════
// AGENTIC PANELS
// ═══════════════════════════════════════════════════════════════════

function renderAgenticPanel(
  name: string,
  description: string,
  cbs: PluginPanelCallbacks,
  prefix: string,
): TemplateResult {
  return panelWrapper(
    `${name} — Agent Control`,
    description,
    html`
    ${sectionHeader("Task Assignment", "📋")}
    ${textareaField(`${prefix}-objective`, "Objective / Task", "Describe the task for the agent to accomplish…")}
    ${selectField(`${prefix}-priority`, "Priority", [
      { value: "low", label: "Low" },
      { value: "normal", label: "Normal" },
      { value: "high", label: "High" },
      { value: "critical", label: "Critical" },
    ])}
    ${numberField(`${prefix}-timeout`, "Timeout (minutes)", 30, 1, 1440)}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Launch Agent",
        "#f97316",
        () => {
          cbs.onCallGateway(`${prefix}.launch`, {
            objective: getInputValue(`${prefix}-objective`),
            priority: getInputValue(`${prefix}-priority`),
            timeout_minutes: getNumericValue(`${prefix}-timeout`, 30),
          });
        },
        "🚀",
      )}
      ${actionButton(
        "Queue Status",
        "#06b6d4",
        () => {
          cbs.onCallGateway(`${prefix}.queue-status`, {});
        },
        "📊",
      )}
    </div>

    ${sectionHeader("Agent Status", "📡")}
    <div style="display:flex;gap:0.5rem">
      ${actionButton(
        "Check Status",
        "#10b981",
        () => {
          cbs.onCallGateway(`${prefix}.status`, {});
        },
        "🔍",
      )}
      ${actionButton(
        "Cancel Active",
        "#ef4444",
        () => {
          cbs.onCallGateway(`${prefix}.cancel`, {});
        },
        "⏹",
      )}
    </div>
  `,
  );
}

// ═══════════════════════════════════════════════════════════════════
// BUILDER PANELS
// ═══════════════════════════════════════════════════════════════════

function renderBuilderPanel(
  name: string,
  description: string,
  cbs: PluginPanelCallbacks,
  prefix: string,
): TemplateResult {
  return panelWrapper(
    `${name} — Builder`,
    description,
    html`
    ${sectionHeader("Project Creation", "🏗️")}
    ${inputField(`${prefix}-url`, "Source URL or Template", "https://example.com")}
    ${textareaField(`${prefix}-desc`, "Project Description", "Describe what you want to build…")}
    ${selectField(`${prefix}-framework`, "Framework", [
      { value: "react", label: "React" },
      { value: "vue", label: "Vue" },
      { value: "nextjs", label: "Next.js" },
      { value: "vanilla", label: "Vanilla HTML/CSS/JS" },
      { value: "auto", label: "Auto-detect" },
    ])}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Start Build",
        "#10b981",
        () => {
          cbs.onCallGateway(`${prefix}.clone`, {
            url: getInputValue(`${prefix}-url`),
            description: getInputValue(`${prefix}-desc`),
            framework: getInputValue(`${prefix}-framework`),
          });
        },
        "🏗️",
      )}
      ${actionButton(
        "Queue Status",
        "#06b6d4",
        () => {
          cbs.onCallGateway(`${prefix}.queue-status`, {});
        },
        "📊",
      )}
    </div>
  `,
  );
}

function renderUIUXPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "UI/UX Pro Max — Design Intelligence",
    "67 UI styles, 96 color palettes, 57 font pairings, 100 industry rules — AI-powered design system generation",
    html`
    ${sectionHeader("Design System Generator", "🎨")}
    ${textareaField("uiux-desc", "Project Description", "Describe the project's purpose, target audience, and design preferences…")}
    ${selectField("uiux-industry", "Industry", [
      { value: "tech", label: "Technology" },
      { value: "healthcare", label: "Healthcare" },
      { value: "finance", label: "Finance" },
      { value: "education", label: "Education" },
      { value: "ecommerce", label: "E-Commerce" },
      { value: "gaming", label: "Gaming" },
      { value: "media", label: "Media" },
      { value: "saas", label: "SaaS" },
      { value: "creative", label: "Creative Agency" },
    ])}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${selectField("uiux-theme", "Theme", [
        { value: "dark", label: "Dark Mode" },
        { value: "light", label: "Light Mode" },
        { value: "both", label: "Both" },
      ])}
      ${selectField("uiux-stack", "Tech Stack", [
        { value: "react-tailwind", label: "React + Tailwind" },
        { value: "react-styled", label: "React + Styled Components" },
        { value: "vue-css", label: "Vue + CSS" },
        { value: "html-css", label: "HTML + CSS" },
        { value: "auto", label: "Auto-detect" },
      ])}
    </div>
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Generate Design System",
        "#a855f7",
        () => {
          cbs.onCallGateway("uiux.designSystem", {
            description: getInputValue("uiux-desc"),
            industry: getInputValue("uiux-industry"),
            theme: getInputValue("uiux-theme"),
            stack: getInputValue("uiux-stack"),
          });
        },
        "🎨",
      )}
    </div>

    ${sectionHeader("Search Assets", "🔍")}
    ${inputField("uiux-search-q", "Search Query", "modern dashboard cards glassmorphism")}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Styles",
        "#06b6d4",
        () => {
          cbs.onCallGateway("uiux.search", {
            type: "styles",
            query: getInputValue("uiux-search-q"),
          });
        },
        "🎭",
      )}
      ${actionButton(
        "Colors",
        "#10b981",
        () => {
          cbs.onCallGateway("uiux.search", {
            type: "colors",
            query: getInputValue("uiux-search-q"),
          });
        },
        "🎨",
      )}
      ${actionButton(
        "Fonts",
        "#f97316",
        () => {
          cbs.onCallGateway("uiux.search", {
            type: "fonts",
            query: getInputValue("uiux-search-q"),
          });
        },
        "🔤",
      )}
      ${actionButton(
        "Charts",
        "#ef4444",
        () => {
          cbs.onInvokeTool("", "uiux_search_charts", { query: getInputValue("uiux-search-q") });
        },
        "📊",
      )}
      ${actionButton(
        "UX Rules",
        "#6366f1",
        () => {
          cbs.onInvokeTool("", "uiux_ux_guidelines", { query: getInputValue("uiux-search-q") });
        },
        "📏",
      )}
    </div>

    ${sectionHeader("Management", "⚙️")}
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      ${actionButton(
        "Status",
        "#10b981",
        () => {
          cbs.onCallGateway("uiux.status", {});
        },
        "📊",
      )}
      ${actionButton(
        "Stacks",
        "#06b6d4",
        () => {
          cbs.onCallGateway("uiux.stacks", {});
        },
        "🧱",
      )}
      ${actionButton(
        "Persist",
        "#a855f7",
        () => {
          cbs.onCallGateway("uiux.persist", {});
        },
        "💾",
      )}
      ${actionButton(
        "Config",
        "#6366f1",
        () => {
          cbs.onCallGateway("uiux.config", {});
        },
        "⚙️",
      )}
    </div>
  `,
  );
}

// ═══════════════════════════════════════════════════════════════════
// CORE & OTHER PANELS
// ═══════════════════════════════════════════════════════════════════

function renderSuperpowersPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "Superpowers — Agentic Skills Framework",
    "60k+ stars — structured cognitive methodologies for brainstorming, TDD, debugging, plan writing, code review, and git worktrees",
    html`
    ${sectionHeader("Skills Browser", "📚")}
    ${inputField("sp-search", "Search Skills", "brainstorming, debugging, TDD…")}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "List All Skills",
        "#6366f1",
        () => {
          cbs.onCallGateway("superpowers.listSkills", {});
        },
        "📋",
      )}
      ${actionButton(
        "Search",
        "#06b6d4",
        () => {
          cbs.onCallGateway("superpowers.matchSkills", { query: getInputValue("sp-search") });
        },
        "🔍",
      )}
      ${actionButton(
        "Status",
        "#10b981",
        () => {
          cbs.onCallGateway("superpowers.status", {});
        },
        "📊",
      )}
    </div>

    ${sectionHeader("Skill Details", "🔧")}
    ${inputField("sp-skill-name", "Skill Name", "brainstorming")}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "View Skill",
        "#a855f7",
        () => {
          cbs.onCallGateway("superpowers.getSkill", { name: getInputValue("sp-skill-name") });
        },
        "👁️",
      )}
    </div>

    ${sectionHeader("Management", "⚙️")}
    <div style="display:flex;gap:0.5rem">
      ${actionButton(
        "Install/Update Repo",
        "#10b981",
        () => {
          cbs.onCallGateway("superpowers.install", {});
        },
        "📥",
      )}
      ${actionButton(
        "Update Skills",
        "#f97316",
        () => {
          cbs.onCallGateway("superpowers.update", {});
        },
        "🔄",
      )}
    </div>
  `,
  );
}

function renderClaudeCodePanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "Awesome Claude Code — Agentic Coding Skills",
    "5 tools for structured coding methodologies — resources, search, category browsing, and skill matching",
    html`
    ${sectionHeader("Browse Resources", "📚")}
    ${inputField("acc-search-q", "Search Query", "debugging, testing, code review…")}
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem">
      ${actionButton(
        "List All",
        "#6366f1",
        () => {
          cbs.onCallGateway("acc.listResources", {});
        },
        "📋",
      )}
      ${actionButton(
        "Search",
        "#06b6d4",
        () => {
          cbs.onCallGateway("acc.search", { query: getInputValue("acc-search-q") });
        },
        "🔍",
      )}
      ${actionButton(
        "Status",
        "#10b981",
        () => {
          cbs.onCallGateway("acc.status", {});
        },
        "📊",
      )}
      ${actionButton(
        "Refresh",
        "#f97316",
        () => {
          cbs.onCallGateway("acc.refresh", {});
        },
        "🔄",
      )}
    </div>

    ${sectionHeader("Get Resource", "🔧")}
    ${inputField("acc-resource", "Resource Name", "brainstorming")}
    ${inputField("acc-category", "Category (optional)", "development")}
    <div style="display:flex;gap:0.5rem">
      ${actionButton(
        "Get Resource",
        "#a855f7",
        () => {
          cbs.onInvokeTool("", "acc_get_resource", { name: getInputValue("acc-resource") });
        },
        "👁️",
      )}
      ${actionButton(
        "By Category",
        "#06b6d4",
        () => {
          cbs.onCallGateway("acc.byCategory", { category: getInputValue("acc-category") });
        },
        "🏷️",
      )}
      ${actionButton(
        "Match Skills",
        "#10b981",
        () => {
          cbs.onInvokeTool("", "acc_match_resources", { query: getInputValue("acc-search-q") });
        },
        "🎯",
      )}
    </div>
  `,
  );
}

function renderLingBotPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "LingBot World — World-Model Video Generation",
    "6 tools — generate videos with physics understanding, camera control, and resolution options",
    html`
    ${sectionHeader("Video Generation", "🎬")}
    ${textareaField("lingbot-prompt", "Scene Description", "Describe the world scene with physics and motion…")}
    ${inputField("lingbot-input-img", "Input Image (optional)", "/path/to/starting-frame.png")}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem">
      ${numberField("lingbot-frames", "Frames", 60, 10, 300)}
      ${numberField("lingbot-fps", "FPS", 24, 12, 60)}
      ${numberField("lingbot-steps", "Steps", 30, 10, 100)}
    </div>
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Generate Video",
        "#ef4444",
        () => {
          cbs.onInvokeTool("", "world_generate", {
            prompt: getInputValue("lingbot-prompt"),
            input_image: getInputValue("lingbot-input-img") || undefined,
            num_frames: getNumericValue("lingbot-frames", 60),
            fps: getNumericValue("lingbot-fps", 24),
            steps: getNumericValue("lingbot-steps", 30),
          });
        },
        "🎬",
      )}
      ${actionButton(
        "Camera Control",
        "#a855f7",
        () => {
          cbs.onInvokeTool("", "world_generate_camera", {
            prompt: getInputValue("lingbot-prompt"),
          });
        },
        "📷",
      )}
    </div>

    ${sectionHeader("Status & Management", "📡")}
    ${inputField("lingbot-job-id", "Job ID", "job-id-here")}
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      ${actionButton(
        "Resolutions",
        "#6366f1",
        () => {
          cbs.onInvokeTool("", "world_list_resolutions", {});
        },
        "📐",
      )}
      ${actionButton(
        "Job Status",
        "#10b981",
        () => {
          cbs.onCallGateway("lingbot.status", { jobId: getInputValue("lingbot-job-id") });
        },
        "🔍",
      )}
      ${actionButton(
        "Queue",
        "#06b6d4",
        () => {
          cbs.onCallGateway("lingbot.queue", {});
        },
        "📊",
      )}
      ${actionButton(
        "Cancel",
        "#ef4444",
        () => {
          cbs.onCallGateway("lingbot.cancel", { jobId: getInputValue("lingbot-job-id") });
        },
        "⏹",
      )}
      ${actionButton(
        "Config",
        "#6366f1",
        () => {
          cbs.onCallGateway("lingbot.config", {});
        },
        "⚙️",
      )}
    </div>
  `,
  );
}

function renderEchoPanel(cbs: PluginPanelCallbacks): TemplateResult {
  return panelWrapper(
    "Echo — Diagnostic & Testing Utility",
    "Echo plugin with ping, status check, and message echo for testing plugin connectivity",
    html`
    ${sectionHeader("Echo Test", "📡")}
    ${inputField("echo-msg", "Message", "Hello from HoC!")}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Echo Message",
        "#6366f1",
        () => {
          cbs.onInvokeTool("", "echo_message", { message: getInputValue("echo-msg") });
        },
        "📢",
      )}
      ${actionButton(
        "Ping",
        "#10b981",
        () => {
          cbs.onCallGateway("echo.ping", {});
        },
        "🏓",
      )}
      ${actionButton(
        "Status",
        "#06b6d4",
        () => {
          cbs.onCallGateway("echo.status", {});
        },
        "📊",
      )}
    </div>
  `,
  );
}

function renderGenericPluginPanel(
  name: string,
  description: string,
  cbs: PluginPanelCallbacks,
): TemplateResult {
  return panelWrapper(
    `${name} — Plugin Console`,
    description,
    html`
    ${sectionHeader("Direct Tool Invocation", "🔧")}
    ${inputField("generic-tool", "Tool Name", "tool_name")}
    ${textareaField("generic-params", "Parameters (JSON)", '{ "key": "value" }')}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${actionButton(
        "Invoke Tool",
        "#6366f1",
        () => {
          let params: Record<string, unknown> = {};
          try {
            params = JSON.parse(getInputValue("generic-params") || "{}");
          } catch {
            /* ignore */
          }
          cbs.onInvokeTool("", getInputValue("generic-tool"), params);
        },
        "⚡",
      )}
    </div>
  `,
  );
}
