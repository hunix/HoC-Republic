/**
 * PluginDrawer — Slide-over drawer for plugin detail panels.
 *
 * Maps each plugin ID to its studio page, opening it with the plugin pre-selected.
 * Falls back to GenericPluginPanel for plugins without a dedicated studio.
 */

import { X, Puzzle, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, lazy, Suspense } from "react";
import { GenericPluginPanel, type PluginManifest } from "./GenericPluginPanel";

// ─── Lazy-load each studio page ────────────────────────────────────

const AudioStudioPage = lazy(() =>
  import("./AudioStudio").then((m) => ({ default: m.AudioStudioPage })),
);
const ImageStudioPage = lazy(() =>
  import("./ImageStudio").then((m) => ({ default: m.ImageStudioPage })),
);
const AvatarStudioPage = lazy(() =>
  import("./AvatarStudio").then((m) => ({ default: m.AvatarStudioPage })),
);
const VideoStudioPage = lazy(() =>
  import("./VideoStudio").then((m) => ({ default: m.VideoStudioPage })),
);
const MusicStudioPage = lazy(() =>
  import("./MusicStudio").then((m) => ({ default: m.MusicStudioPage })),
);
const AgentStudioPage = lazy(() =>
  import("./AgentStudio").then((m) => ({ default: m.AgentStudioPage })),
);
const DevStudioPage = lazy(() => import("./DevStudio").then((m) => ({ default: m.DevStudioPage })));
const SecurityStudioPage = lazy(() =>
  import("./SecurityStudio").then((m) => ({ default: m.SecurityStudioPage })),
);
const OpsStudioPage = lazy(() =>
  import("./OpsStudio").then((m) => ({ default: m.OpsStudioPage })),
);

// ─── Plugin ID → studio page + defaultPlugin ──────────────────────

type StudioEntry = {
  Page: React.ComponentType<{ defaultPlugin?: string }>;
  studioLabel: string;
};

const PLUGIN_STUDIO_MAP: Record<string, StudioEntry> = {
  // Audio
  "hoc-plugin-bark": { Page: AudioStudioPage, studioLabel: "Audio Studio" },
  "hoc-plugin-chatterbox": { Page: AudioStudioPage, studioLabel: "Audio Studio" },
  "hoc-plugin-qwen3-tts": { Page: AudioStudioPage, studioLabel: "Audio Studio" },
  "hoc-plugin-mmaudio": { Page: AudioStudioPage, studioLabel: "Audio Studio" },
  // Image
  "hoc-plugin-omnigen": { Page: ImageStudioPage, studioLabel: "Image Studio" },
  "hoc-plugin-glm-image": { Page: ImageStudioPage, studioLabel: "Image Studio" },
  "hoc-plugin-switti": { Page: ImageStudioPage, studioLabel: "Image Studio" },
  "hoc-plugin-kv-edit": { Page: ImageStudioPage, studioLabel: "Image Studio" },
  "hoc-plugin-storydiffusion": { Page: ImageStudioPage, studioLabel: "Image Studio" },
  // Avatar
  "hoc-plugin-deepfacelab": { Page: AvatarStudioPage, studioLabel: "Avatar Studio" },
  "hoc-plugin-facefusion": { Page: AvatarStudioPage, studioLabel: "Avatar Studio" },
  "hoc-plugin-dgm": { Page: AvatarStudioPage, studioLabel: "Avatar Studio" },
  "hoc-plugin-stable-avatar": { Page: AvatarStudioPage, studioLabel: "Avatar Studio" },
  "hoc-plugin-magicanimate": { Page: AvatarStudioPage, studioLabel: "Avatar Studio" },
  // Video
  "hoc-plugin-deforum": { Page: VideoStudioPage, studioLabel: "Video Studio" },
  "hoc-plugin-cogvideox": { Page: VideoStudioPage, studioLabel: "Video Studio" },
  "hoc-plugin-hunyuan-video": { Page: VideoStudioPage, studioLabel: "Video Studio" },
  "hoc-plugin-ltx-video": { Page: VideoStudioPage, studioLabel: "Video Studio" },
  "hoc-plugin-skyreels": { Page: VideoStudioPage, studioLabel: "Video Studio" },
  "hoc-plugin-wan-video": { Page: VideoStudioPage, studioLabel: "Video Studio" },
  "hoc-plugin-lingbot-world": { Page: VideoStudioPage, studioLabel: "Video Studio" },
  "hoc-plugin-easyvolcap": { Page: VideoStudioPage, studioLabel: "Video Studio" },
  "hoc-plugin-sparc3d": { Page: VideoStudioPage, studioLabel: "Video Studio" },
  // Music
  "hoc-plugin-funmusic": { Page: MusicStudioPage, studioLabel: "Music Studio" },
  // Agents
  "hoc-plugin-a2a": { Page: AgentStudioPage, studioLabel: "Agent Studio" },
  "hoc-plugin-autogpt": { Page: AgentStudioPage, studioLabel: "Agent Studio" },
  "hoc-plugin-magentic-one": { Page: AgentStudioPage, studioLabel: "Agent Studio" },
  "hoc-plugin-openmanus-rl": { Page: AgentStudioPage, studioLabel: "Agent Studio" },
  "hoc-plugin-ai-scientist": { Page: AgentStudioPage, studioLabel: "Agent Studio" },
  // Dev
  "hoc-plugin-open-lovable": { Page: DevStudioPage, studioLabel: "Dev Studio" },
  "hoc-plugin-uiux-promax": { Page: DevStudioPage, studioLabel: "Dev Studio" },
  "hoc-plugin-awesome-claude-code": { Page: DevStudioPage, studioLabel: "Dev Studio" },
  "hoc-plugin-superpowers": { Page: DevStudioPage, studioLabel: "Dev Studio" },
  // Security
  "hoc-plugin-blackeye": { Page: SecurityStudioPage, studioLabel: "Security Studio" },
  "hoc-plugin-pentagi": { Page: SecurityStudioPage, studioLabel: "Security Studio" },
  // Ops
  "hoc-plugin-paperclip": { Page: OpsStudioPage, studioLabel: "Ops Studio" },
  "hoc-plugin-echo": { Page: OpsStudioPage, studioLabel: "Ops Studio" },
  // Agents (addendum)
  "hoc-plugin-agenthub": { Page: AgentStudioPage, studioLabel: "Agent Studio" },
};

function PanelLoading() {
  return (
    <div className="flex items-center justify-center py-24 gap-3 text-text-muted text-sm">
      <Loader2 size={18} className="animate-spin text-accent" />
      Loading plugin panel…
    </div>
  );
}

// ─── Drawer ────────────────────────────────────────────────────────

interface PluginDrawerProps {
  plugin: PluginManifest | null;
  onClose: () => void;
}

export function PluginDrawer({ plugin, onClose }: PluginDrawerProps) {
  useEffect(() => {
    if (!plugin) {
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plugin, onClose]);

  if (!plugin) {
    return null;
  }

  const entry = plugin.id ? PLUGIN_STUDIO_MAP[plugin.id] : undefined;
  const hasDedicatedUI = !!entry;

  let content: React.ReactNode;
  if (entry) {
    const { Page } = entry;
    content = (
      <Suspense fallback={<PanelLoading />}>
        <Page defaultPlugin={plugin.id} />
      </Suspense>
    );
  } else {
    content = <GenericPluginPanel plugin={plugin} />;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer — wider to accommodate studio layout sidebar */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full lg:w-[900px] xl:w-[1040px] bg-bg-primary border-l border-border flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/50 bg-bg-secondary flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <Puzzle size={15} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text-heading truncate">{plugin.name}</h2>
              {hasDedicatedUI ? (
                <span className="text-[10px] font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                  ✦ Full UI — {entry.studioLabel}
                </span>
              ) : (
                <span className="text-[10px] text-text-muted opacity-60">Generic panel</span>
              )}
            </div>
            <p className="text-[10px] text-text-muted">
              {plugin.id} · v{plugin.version ?? "1.0.0"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {plugin.sourceRepo && (
              <a
                href={plugin.sourceRepo}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-bg-card transition-colors"
                title="Source repo"
              >
                <ExternalLink size={14} />
              </a>
            )}
            <button
type="button"               onClick={onClose}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content — full studio layout or generic panel */}
        <div className="flex-1 overflow-hidden">{content}</div>
      </div>
    </>
  );
}
