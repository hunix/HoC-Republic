import {
  Film,
  Music,
  FileText,
  Image,
  Mic,
  Search,
  Play,
  Download,
  RefreshCw,
  Pause,
  Code,
  Gamepad2,
  Globe,
  FlaskConical,
  BookOpen,
  Star,
  Brain,
  Scroll,
  Dumbbell,
  Newspaper,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Folder,
  Sparkles,
  Loader2,
  Cpu,
  DollarSign,
  Zap,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { PageHeader, Card, Badge, StatCard, Button, RpcStatus, Alert } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

const GATEWAY_PORT = window.location.port || "19001";
const GATEWAY_BASE = `${window.location.protocol}//${window.location.hostname}:${GATEWAY_PORT}`;

interface ProductionFile {
  name: string;
  category: string;
  size: number;
  path: string;
  publishedAt?: string;
  isDir?: boolean;
  // Inference metadata (from .meta.json sidecar)
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  estimatedCostUsd?: number;
  visionScore?: number;
  visionDescription?: string;
  citizenName?: string;
}

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  art: <Image size={14} />,
  music: <Music size={14} />,
  video: <Film size={14} />,
  docs: <FileText size={14} />,
  code: <Code size={14} />,
  games: <Gamepad2 size={14} />,
  websites: <Globe size={14} />,
  research: <FlaskConical size={14} />,
  screenplays: <Scroll size={14} />,
  "3d-models": <Brain size={14} />,
  designs: <Star size={14} />,
  podcasts: <Mic size={14} />,
  inventions: <Dumbbell size={14} />,
  journals: <BookOpen size={14} />,
  chronicles: <Newspaper size={14} />,
  dreams: <Star size={14} />,
  "ml-models": <Brain size={14} />,
  datasets: <FlaskConical size={14} />,
  ads: <Newspaper size={14} />,
};

const CATEGORY_BADGE: Record<string, "info" | "warning" | "success" | "purple" | "neutral"> = {
  art: "warning",
  music: "purple",
  video: "warning",
  docs: "neutral",
  code: "info",
  games: "success",
  websites: "info",
  research: "neutral",
  screenplays: "neutral",
  "3d-models": "purple",
  designs: "warning",
  podcasts: "info",
  inventions: "success",
  journals: "neutral",
  chronicles: "neutral",
  dreams: "purple",
  "ml-models": "purple",
  datasets: "neutral",
  ads: "info",
};

const ALL_CATEGORIES = [
  "art",
  "music",
  "video",
  "podcasts",
  "code",
  "games",
  "websites",
  "research",
  "screenplays",
  "docs",
  "3d-models",
  "designs",
  "ml-models",
  "datasets",
  "inventions",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatCost(usd?: number): string | null {
  if (usd === undefined || usd === null) {return null;}
  if (usd === 0) {return "free";}
  if (usd < 0.001) {return `$${(usd * 1000).toFixed(3)}m`;}
  return `$${usd.toFixed(4)}`;
}

function providerBadge(provider?: string): { label: string; variant: "success" | "info" | "warning" | "neutral" } {
  if (!provider || provider === "none") {return { label: "unknown", variant: "neutral" };}
  if (provider === "lmstudio" || provider === "ollama" || provider === "output-manager")
    {return { label: provider === "output-manager" ? "local" : provider, variant: "success" };}
  if (provider === "gemini_flash" || provider === "groq" || provider === "nvidia-nim")
    {return { label: provider.replace("_flash", "").replace("nvidia-", ""), variant: "info" };}
  return { label: provider.replace("_", "-"), variant: "warning" };
}

function getFileExt(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

function agoStr(iso?: string): string {
  if (!iso) {
    return "";
  }
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) {
    return "just now";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }
  if (diff < 7 * 86_400_000) {
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }
  return new Date(iso).toLocaleDateString();
}

function isAudio(name: string): boolean {
  return ["wav", "mp3", "ogg", "flac", "m4a"].includes(getFileExt(name));
}

function isImage(name: string): boolean {
  return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(getFileExt(name));
}

function isVideo(name: string): boolean {
  return ["mp4", "webm", "ogv", "mov"].includes(getFileExt(name));
}

function isText(name: string): boolean {
  // Only render proper document formats as text — not raw source code
  return ["txt", "md", "fountain", "html"].includes(getFileExt(name));
}

function isBrowsable(file: ProductionFile): boolean {
  return (
    !file.isDir &&
    (isImage(file.name) || isText(file.name) || isAudio(file.name) || isVideo(file.name))
  );
}

// Media player state (global singleton to allow cross-card control)
let globalAudio: HTMLAudioElement | null = null;

function FileThumbnail({ file, fileUrl }: { file: ProductionFile; fileUrl: string }) {
  if (file.isDir) {
    return (
      <div className="h-28 rounded-xl bg-gradient-to-br from-accent/10 via-bg-secondary to-purple-500/10 flex flex-col items-center justify-center gap-2">
        <Folder size={32} className="text-accent/60" />
        <span className="text-xs text-text-muted">Project Folder</span>
      </div>
    );
  }
  if (isImage(file.name)) {
    return (
      <div className="h-28 rounded-xl overflow-hidden bg-bg-secondary">
        <img
          src={fileUrl}
          alt={file.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }
  const emoji =
    file.category === "music"
      ? "🎵"
      : file.category === "podcasts"
        ? "🎙️"
        : file.category === "video"
          ? "🎬"
          : file.category === "art"
            ? "🖼️"
            : file.category === "code"
              ? "💻"
              : file.category === "games"
                ? "🎮"
                : file.category === "websites"
                  ? "🌐"
                  : file.category === "research"
                    ? "🔬"
                    : file.category === "dreams"
                      ? "💭"
                      : file.category === "journals"
                        ? "📔"
                        : "📄";
  return (
    <div className="h-28 rounded-xl bg-gradient-to-br from-accent/10 via-bg-secondary to-purple-500/10 flex items-center justify-center">
      <span className="text-4xl opacity-50">{emoji}</span>
    </div>
  );
}

function FileCard({
  file,
  onPreview,
}: {
  file: ProductionFile;
  onPreview: (file: ProductionFile) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileUrl = `${GATEWAY_BASE}/${file.path}`;
  const displayName = file.name
    .replace(/_/g, " ")
    .replace(/\.[^.]+$/, "")
    .slice(0, 50);

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isAudio(file.name)) {
      return;
    }

    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    // Stop global audio
    if (globalAudio && globalAudio !== audioRef.current) {
      globalAudio.pause();
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(fileUrl);
      // eslint-disable-next-line unicorn/prefer-add-event-listener
      audioRef.current.onended = () => setPlaying(false);
    }
    globalAudio = audioRef.current;
    audioRef.current
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }

  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = file.name;
    a.click();
  }

  return (
    <Card
      className="flex flex-col gap-2 cursor-pointer hover:border-accent/40 transition-all group"
      onClick={() => onPreview(file)}
    >
      <FileThumbnail file={file} fileUrl={fileUrl} />

      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="flex-1 min-w-0">
          <p
            className="font-medium text-text-heading text-xs leading-tight truncate"
            title={file.name}
          >
            {displayName}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1.5">
            <span>{formatBytes(file.size)}</span>
            {file.publishedAt && (
              <>
                <span className="opacity-40">·</span>
                <span title={new Date(file.publishedAt).toLocaleString()}>
                  published {agoStr(file.publishedAt)}
                </span>
              </>
            )}
          </p>
          {/* Inference metadata chips */}
          {(file.provider || file.tokensIn !== undefined) && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {file.provider && (() => { const pb = providerBadge(file.provider); return (
                <Badge variant={pb.variant} className="text-[9px] !py-0 !px-1.5">
                  <Cpu size={8} className="mr-0.5" />{pb.label}
                </Badge>
              ); })()}
              {(file.tokensIn !== undefined || file.tokensOut !== undefined) && (
                <span className="text-[9px] text-text-muted flex items-center gap-0.5">
                  <Zap size={8} />{((file.tokensIn ?? 0) + (file.tokensOut ?? 0)).toLocaleString()}tok
                </span>
              )}
              {file.estimatedCostUsd !== undefined && (
                <span className="text-[9px] text-text-muted flex items-center gap-0.5">
                  <DollarSign size={8} />{formatCost(file.estimatedCostUsd)}
                </span>
              )}
              {file.visionScore !== undefined && (
                <span
                  className={`text-[9px] font-medium ${
                    file.visionScore >= 0.7 ? "text-success" :
                    file.visionScore >= 0.45 ? "text-warning" : "text-danger"
                  }`}
                  title={file.visionDescription}
                >
                  👁 {(file.visionScore * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}
        </div>
        <Badge
          variant={CATEGORY_BADGE[file.category] ?? "neutral"}
          className="shrink-0 text-[10px]"
        >
          {file.category}
        </Badge>
      </div>

      <div className="flex gap-1.5 mt-auto">
        {isAudio(file.name) && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 !py-1"
            icon={playing ? <Pause size={11} /> : <Play size={11} />}
            onClick={togglePlay}
          >
            {playing ? "Pause" : "Play"}
          </Button>
        )}
        {isBrowsable(file) && !isAudio(file.name) && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 !py-1"
            icon={<Eye size={11} />}
            onClick={(e) => {
              e.stopPropagation();
              onPreview(file);
            }}
          >
            View
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="!py-1 !px-2"
          icon={<Download size={11} />}
          onClick={handleDownload}
        />
      </div>
    </Card>
  );
}

function FilePreviewModal({ file, onClose }: { file: ProductionFile; onClose: () => void }) {
  const fileUrl = `${GATEWAY_BASE}/${file.path}`;
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isText(file.name) || file.isDir) {
      return;
    }
    const tid = setTimeout(() => setLoading(true), 0);
    fetch(fileUrl)
      .then((r) => r.text())
      .then((t) => {
        setTextContent(t);
        setLoading(false);
      })
      .catch(() => {
        setTextContent("[Failed to load file content]");
        setLoading(false);
      });
    return () => clearTimeout(tid);
  }, [file.name, fileUrl, file.isDir]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-card rounded-2xl border border-border w-full max-w-3xl max-h-[85vh] overflow-auto shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-text-muted">
              {CATEGORY_ICON[file.category] ?? <FileText size={16} />}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-text-heading text-sm truncate">{file.name}</p>
              <p className="text-xs text-text-muted">
                {file.category} · {formatBytes(file.size)}
                {file.citizenName ? ` · by ${file.citizenName}` : ""}
              </p>
              {/* Inference metadata strip in modal header */}
              {(file.provider || file.model) && (
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {file.provider && (() => { const pb = providerBadge(file.provider); return (
                    <Badge variant={pb.variant} className="text-[10px]">
                      <Cpu size={9} className="mr-1" />{pb.label}
                    </Badge>
                  ); })()}
                  {file.model && file.model !== "deterministic-generator" && (
                    <span className="text-[10px] text-text-muted font-mono truncate max-w-48" title={file.model}>
                      {file.model.split("/").pop()}
                    </span>
                  )}
                  {(file.tokensIn !== undefined || file.tokensOut !== undefined) && (
                    <span className="text-[10px] text-text-muted flex items-center gap-1">
                      <Zap size={10} />
                      in:{(file.tokensIn ?? 0).toLocaleString()} out:{(file.tokensOut ?? 0).toLocaleString()}
                    </span>
                  )}
                  {file.estimatedCostUsd !== undefined && (
                    <span className="text-[10px] flex items-center gap-0.5"
                      style={{ color: file.estimatedCostUsd === 0 ? "var(--color-success)" : "var(--color-warning)" }}>
                      <DollarSign size={10} />{formatCost(file.estimatedCostUsd)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              icon={<Download size={12} />}
              onClick={() => {
                const a = document.createElement("a");
                a.href = fileUrl;
                a.download = file.name;
                a.click();
              }}
            >
              Download
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text-primary cursor-pointer p-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-auto">
          {file.isDir && (
            <div className="text-center py-8">
              <Folder size={48} className="text-accent/40 mx-auto mb-3" />
              <p className="text-text-muted text-sm">
                This is a project folder. Download to access its files.
              </p>
            </div>
          )}
          {!file.isDir && isImage(file.name) && (
            <img
              src={fileUrl}
              alt={file.name}
              className="max-w-full max-h-[60vh] mx-auto rounded-xl object-contain"
            />
          )}
          {!file.isDir && isVideo(file.name) && (
            <video src={fileUrl} controls className="w-full max-h-[60vh] rounded-xl" autoPlay />
          )}
          {!file.isDir && isAudio(file.name) && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/20 to-accent/20 flex items-center justify-center">
                <Music size={40} className="text-purple-400" />
              </div>
              <p className="font-medium text-text-heading">
                {file.name.replace(/_/g, " ").replace(/\.[^.]+$/, "")}
              </p>
              <audio src={fileUrl} controls className="w-full" autoPlay />
            </div>
          )}
          {!file.isDir &&
            isText(file.name) &&
            (loading ? (
              <div className="text-text-muted text-sm text-center py-8">Loading...</div>
            ) : (
              <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap bg-bg-secondary p-4 rounded-xl max-h-[50vh] overflow-auto leading-relaxed">
                {textContent}
              </pre>
            ))}
          {!file.isDir &&
            !isImage(file.name) &&
            !isVideo(file.name) &&
            !isAudio(file.name) &&
            !isText(file.name) && (
              <div className="text-center py-8 text-text-muted text-sm">
                <FileText size={40} className="mx-auto mb-3 opacity-30" />
                Preview not available for this file type. Download to open.
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 48;

export function ProductionsPage() {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [previewFile, setPreviewFile] = useState<ProductionFile | null>(null);
  const [genType, setGenType] = useState("audio");
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showGenPanel, setShowGenPanel] = useState(false);

  const {
    data: filesData,
    refetch,
    loading,
    error,
  } = useRpc<{
    ok?: boolean;
    files?: ProductionFile[];
  }>("republic.productions.files", categoryFilter !== "All" ? { category: categoryFilter } : {});

  const allFiles: ProductionFile[] = filesData?.files ?? [];

  const filtered = allFiles.filter((f) => {
    if (!search) {
      return true;
    }
    return (
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.category.toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageFiles = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filter/search changes
  useEffect(() => {
    const tid = setTimeout(() => setPage(0), 0);
    return () => clearTimeout(tid);
  }, [categoryFilter, search]);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const totalCount = allFiles.length;

  const handleGenerate = async () => {
    if (!genPrompt.trim()) { return; }
    setGenerating(true);
    setGenResult(null);
    try {
      const result = await rpc("republic.productions.generate", {
        contentType: genType,
        prompt: genPrompt.trim(),
      }) as { ok?: boolean; job?: { id: string; status: string; pipeline?: { displayName: string } } };
      setGenResult({
        ok: true,
        message: `Job ${result.job?.id} dispatched to ${result.job?.pipeline?.displayName ?? genType}`,
      });
      setGenPrompt("");
    } catch (err) {
      setGenResult({ ok: false, message: String(err) });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Productions"
        description={`${totalCount.toLocaleString()} citizen-generated files — art, music, video, code, games & more`}
        icon={<Film size={28} />}
        actions={
          <div className="flex gap-2">
            <Button
              variant={showGenPanel ? "primary" : "outline"}
              size="sm"
              icon={<Sparkles size={14} />}
              onClick={() => setShowGenPanel((s) => !s)}
            >
              Generate
            </Button>
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Generate Panel */}
      {showGenPanel && (
        <Card className="p-4 space-y-3 border-accent/30">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-heading">
            <Sparkles size={16} className="text-accent" />
            Generate New Content
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={genType}
              onChange={(e) => setGenType(e.target.value)}
              className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="audio">🎵 Audio / Speech</option>
              <option value="video">🎬 Video</option>
              <option value="image">🖼️ Image</option>
              <option value="3d">🧊 3D Model</option>
            </select>
            <input
              className="flex-1 min-w-64 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              placeholder="Describe what you want to generate..."
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !generating && handleGenerate()}
            />
            <Button
              variant="primary"
              size="sm"
              icon={generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              disabled={generating || !genPrompt.trim()}
              onClick={handleGenerate}
            >
              {generating ? "Generating..." : "Generate"}
            </Button>
          </div>
          {genResult && (
            <Alert variant={genResult.ok ? "success" : "danger"}>
              {genResult.message}
            </Alert>
          )}
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Files"
          value={totalCount.toLocaleString()}
          icon={<Film size={16} />}
        />
        <StatCard
          label="Music Tracks"
          value={allFiles.filter((f) => f.category === "music").length.toLocaleString()}
          icon={<Music size={16} />}
        />
        <StatCard
          label="Art Works"
          value={allFiles.filter((f) => f.category === "art").length.toLocaleString()}
          icon={<Image size={16} />}
        />
        <StatCard
          label="Est. AI Cost"
          value={`$${allFiles.reduce((s, f) => s + (f.estimatedCostUsd ?? 0), 0).toFixed(4)}`}
          sub="total across all productions"
          icon={<DollarSign size={16} />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full pl-9 pr-4 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", ...ALL_CATEGORIES].map((cat) => (
            <button
              type="button"
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                categoryFilter === cat
                  ? "bg-accent text-white"
                  : "bg-bg-secondary text-text-muted hover:text-text-primary"
              }`}
            >
              {cat !== "All" && CATEGORY_ICON[cat]}
              {cat === "All" ? "All" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-16 text-text-muted">
          <RefreshCw size={32} className="mx-auto mb-3 animate-spin opacity-50" />
          <p className="text-sm">Loading productions...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <Card className="text-center py-12">
          <Film size={40} className="text-text-muted mx-auto mb-3 opacity-30" />
          <p className="text-text-muted text-sm">
            {search ? `No files match "${search}"` : "No productions in this category yet"}
          </p>
        </Card>
      )}

      {/* File Grid */}
      {!loading && pageFiles.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {pageFiles.map((file) => (
              <FileCard key={file.path} file={file} onPreview={setPreviewFile} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)}{" "}
                of {filtered.length.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<ChevronLeft size={14} />}
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </Button>
                <span className="flex items-center text-xs text-text-muted px-2">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<ChevronRight size={14} />}
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Preview Modal */}
      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}
