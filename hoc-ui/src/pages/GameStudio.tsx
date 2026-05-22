/**
 * Game Studio — Citizen 3D Game Creation Hub
 *
 * Allows citizens to create visually stunning React Three Fiber games.
 * Features:
 *   - 5 game archetype cards with vivid previews
 *   - Citizen assignment for the build team
 *   - Post-generation file browser
 *   - Sandboxed iframe live preview
 *   - Download / copy instructions
 */

import {
  Code2,
  Eye,
  File,
  Gamepad2,
  Globe,
  RefreshCw,
  Rocket,
  Sparkles,
  Triangle,
  Zap,
} from "lucide-react";
import { useState, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  PageHeader,
  RpcStatus,
  StatCard,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ArchetypeMeta {
  id: string;
  title: string;
  description: string;
  stack: string[];
  previewColor: string;
  emoji: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

interface GameProject {
  citizenId: string;
  gameName: string;
  archetype: string | null;
  path: string;
  fileCount: number;
  createdAt: number;
  sizeBytes: number;
}

interface ScaffoldResult {
  ok: boolean;
  archetype: string;
  gameName: string;
  outputDir: string;
  fileCount: number;
  files: string[];
  instructions: string;
  archetypeMeta: ArchetypeMeta;
}

// ─── Archetype Card ────────────────────────────────────────────────────────

const DIFFICULTY_COLOR: Record<string, "success" | "warning" | "danger"> = {
  beginner: "success",
  intermediate: "warning",
  advanced: "danger",
};

const ARCHETYPE_ICON: Record<string, React.ReactNode> = {
  "platformer3d": <Gamepad2 size={28} />,
  "space-shooter": <Rocket size={28} />,
  "puzzle-world": <Triangle size={28} />,
  "rpg-world": <Globe size={28} />,
  "racing-game": <Zap size={28} />,
};

function ArchetypeCard({
  meta,
  selected,
  onClick,
}: {
  meta: ArchetypeMeta;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col gap-3 p-5 rounded-xl border-2 text-left transition-all duration-200 cursor-pointer group
        ${selected
          ? "border-accent shadow-lg shadow-accent/20 bg-bg-card"
          : "border-border hover:border-accent/40 bg-bg-secondary hover:bg-bg-card"
        }`}
    >
      {/* Color stripe */}
      <div
        className="absolute inset-x-0 top-0 h-1 rounded-t-xl transition-opacity"
        style={{ background: meta.previewColor, opacity: selected ? 1 : 0.4 }}
      />

      {/* Icon badge */}
      <div
        className="w-12 h-12 rounded-lg flex items-center justify-center text-white mt-1"
        style={{ background: `${meta.previewColor}40`, color: meta.previewColor }}
      >
        {ARCHETYPE_ICON[meta.id] ?? <Sparkles size={28} />}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-text-heading text-sm">{meta.emoji} {meta.title}</span>
          <Badge variant={DIFFICULTY_COLOR[meta.difficulty] ?? "neutral"}>
            {meta.difficulty}
          </Badge>
        </div>
        <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
          {meta.description}
        </p>
      </div>

      {/* Stack chips */}
      <div className="flex flex-wrap gap-1">
        {meta.stack.slice(0, 3).map((s) => (
          <span
            key={s}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-input border border-border text-text-muted"
          >
            {s}
          </span>
        ))}
        {meta.stack.length > 3 && (
          <span className="px-1.5 py-0.5 text-[10px] text-text-muted">+{meta.stack.length - 3}</span>
        )}
      </div>

      {selected && (
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-accent animate-pulse" />
      )}
    </button>
  );
}

// ─── Generated Project Panel ───────────────────────────────────────────────

function ProjectPanel({ result }: { result: ScaffoldResult }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingFile, setLoadingFile] = useState(false);

  async function openFile(file: string) {
    setSelectedFile(file);
    setLoadingFile(true);
    try {
      const res = await rpc<{ content?: string }>("republic.game.read-file", {
        gameName: result.gameName,
        filePath: file,
      });
      setFileContent(res?.content ?? "// Could not load file");
    } finally {
      setLoadingFile(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="success">
        ✅ <strong>{result.gameName}</strong> scaffolded with {result.fileCount} files!
        Run: <code className="bg-bg-input px-1 rounded text-xs">{result.instructions}</code>
      </Alert>

      {/* Stack tags */}
      <div className="flex flex-wrap gap-2">
        {(result.archetypeMeta?.stack ?? []).map((s) => (
          <span key={s} className="px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent border border-accent/20 font-mono">
            {s}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* File tree */}
        <Card className="lg:col-span-1 p-4">
          <h4 className="text-xs font-semibold text-text-heading mb-3 flex items-center gap-1.5">
            <File size={12} className="text-accent" /> Project Files
          </h4>
          <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto">
            {result.files.map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => openFile(f)}
                className={`text-left flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono transition-colors
                  ${selectedFile === f
                    ? "bg-accent/10 text-accent"
                    : "text-text-muted hover:text-text-primary hover:bg-bg-secondary"
                  }`}
              >
                <File size={9} className="flex-shrink-0 opacity-60" />
                <span className="truncate">{f}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Code viewer */}
        <Card className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-text-muted truncate">
              {selectedFile ?? "Select a file to view"}
            </span>
            {selectedFile && (
              <Badge variant="neutral">
                {selectedFile.split(".").pop()?.toUpperCase() ?? "TXT"}
              </Badge>
            )}
          </div>
          <div className="bg-bg-input rounded-lg p-4 h-64 overflow-auto border border-border/40 font-mono text-[11px] text-success/80 whitespace-pre-wrap">
            {loadingFile ? (
              <span className="text-text-muted animate-pulse">Loading…</span>
            ) : selectedFile ? (
              fileContent
            ) : (
              <span className="text-text-muted">← Click a file to view its source</span>
            )}
          </div>
        </Card>
      </div>

      {/* Run instructions */}
      <Card className="p-4 flex items-start gap-3">
        <Code2 size={16} className="text-accent flex-shrink-0 mt-0.5" />
        <div className="text-xs text-text-secondary leading-relaxed">
          <p className="font-semibold text-text-primary mb-1">How to run your game:</p>
          <code className="block bg-bg-input p-2 rounded text-[11px] font-mono text-success/90 mt-1">
            {result.instructions}
          </code>
          <p className="mt-2 text-text-muted">
            Then open <span className="text-accent">http://localhost:5173</span> — the game runs in any browser, no Unity or Unreal needed.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function GameStudioPage() {
  const {
    data: archetypeData,
    loading: archetypeLoading,
    error: archetypeError,
    refetch,
  } = useRpc<{ ok: boolean; archetypes: ArchetypeMeta[] }>(
    "republic.game.archetypes",
    {},
    [],
    { staleTimeMs: 60_000 },
  );

  const {
    data: projectsData,
    refetch: refetchProjects,
  } = useRpc<{ ok: boolean; games: GameProject[]; total: number }>(
    "republic.game.list",
    {},
    [],
    { staleTimeMs: 10_000, refetchIntervalMs: 15_000 },
  );

  const archetypes = archetypeData?.archetypes ?? [];
  const projects = projectsData?.games ?? [];

  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [gameName, setGameName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ScaffoldResult | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!selectedArchetype) { return; }
    setGenerating(true);
    setResult(null);
    setGenerateError(null);
    try {
      const res = await rpc<ScaffoldResult>("republic.game.scaffold", {
        citizenName: "Studio",
        gameName: gameName || `${selectedArchetype}-${Date.now()}`,
        archetype: selectedArchetype,
        prompt: prompt || `Generate a ${selectedArchetype} 3D React game using React Three Fiber`,
      });
      if (res?.ok) {
        setResult(res);
        void refetchProjects();
      } else {
        setGenerateError("Game scaffold failed. Check gateway logs.");
      }
    } catch (err) {
      setGenerateError(String(err));
    } finally {
      setGenerating(false);
    }
  }, [selectedArchetype, gameName, prompt, refetchProjects]);

  return (
    <div className="flex flex-col gap-6 animate-fade-in p-6">
      <PageHeader
        title="Game Studio"
        description="Generate visually stunning 3D React games with React Three Fiber, Rapier physics, and post-processing — ready to play in your browser"
        icon={<Gamepad2 size={22} className="text-accent" />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={() => { refetch(); refetchProjects(); }}>
            Refresh
          </Button>
        }
      />

      <RpcStatus loading={archetypeLoading} error={archetypeError} onRetry={refetch} />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Archetypes" value={archetypes.length} icon={<Sparkles size={16} className="text-accent" />} sub="game templates" />
        <StatCard label="Games Built" value={projects.length} icon={<Gamepad2 size={16} className="text-success" />} sub="total" />
        <StatCard label="Stack" value="R3F" icon={<Code2 size={16} className="text-warning" />} sub="React Three Fiber" />
        <StatCard label="Physics" value="Rapier" icon={<Zap size={16} className="text-info" />} sub="WASM engine" />
      </div>

      {/* Archetype picker */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-heading mb-1 flex items-center gap-2">
          <Sparkles size={14} className="text-accent" /> Choose Game Archetype
        </h3>
        <p className="text-xs text-text-muted mb-4">
          Each archetype generates a complete, runnable React Three Fiber project with full source code.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {archetypes.map((meta) => (
            <ArchetypeCard
              key={meta.id}
              meta={meta}
              selected={selectedArchetype === meta.id}
              onClick={() => setSelectedArchetype(meta.id)}
            />
          ))}
        </div>
      </Card>

      {/* Build form */}
      {selectedArchetype && (
        <Card className="p-5 animate-fade-in">
          <h3 className="text-sm font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Rocket size={14} className="text-accent" /> Configure Your Game
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Game Name</label>
              <input
                className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                placeholder={`My ${selectedArchetype} game`}
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Creative Prompt (optional)</label>
              <input
                className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                placeholder="A neon-lit cyberpunk platformer with rain effects…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          </div>

          {generateError && (
            <Alert variant="danger" className="mb-4">{generateError}</Alert>
          )}

          <div className="flex items-center gap-3">
            <Button
              icon={<Sparkles size={14} />}
              loading={generating}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "Generating…" : "Generate Game"}
            </Button>
            <p className="text-xs text-text-muted">
              Scaffold takes ~1 second • Zero dependencies needed to start
            </p>
          </div>
        </Card>
      )}

      {/* Result panel */}
      {result && <ProjectPanel result={result} />}

      {/* Existing games library */}
      {projects.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Eye size={14} className="text-accent" /> Previously Generated Games
          </h3>
          <div className="flex flex-col gap-2">
            {projects.map((p) => (
              <div
                key={`${p.citizenId}-${p.gameName}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-bg-secondary border border-border text-sm"
              >
                <Gamepad2 size={14} className="text-accent flex-shrink-0" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-text-primary font-medium truncate font-mono text-xs">{p.gameName}</span>
                  <span className="text-text-muted text-xs">{p.archetype ?? "unknown archetype"} · {p.fileCount} files · {Math.round(p.sizeBytes / 1024)}KB</span>
                </div>
                <span className="text-text-muted text-xs">{new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Info banner */}
      <Alert variant="info">
        <strong>How citizen 3D game production works:</strong> Citizens with <em>GameDeveloper</em>, <em>Engineer</em>, or <em>Researcher</em> specializations request game production. The CPE scheduler queues the job, auto-loads the Open Lovable or Superpowers plugin (if available), or falls back to the built-in scaffold. Generated projects use <strong>React Three Fiber</strong> (declarative Three.js), <strong>@react-three/drei</strong> (helpers), <strong>@react-three/rapier</strong> (WASM Rapier physics), <strong>@react-three/postprocessing</strong> (Bloom, SSAO, ChromaticAberration), and <strong>Zustand</strong> for state — all pinned in a ready-to-run Vite project.
      </Alert>
    </div>
  );
}
