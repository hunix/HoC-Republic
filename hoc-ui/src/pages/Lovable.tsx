import {
  Heart,
  Eye,
  ExternalLink,
  Code2,
  RefreshCw,
  Sparkles,
  Globe,
  Gamepad2,
  Play,
  Download,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { useState, useRef } from "react";
import { PageHeader, Card, Button, Alert, StatCard , RpcStatus } from "@/components/ui";
import { rpc, useRpc } from "@/lib/rpc";

const GATEWAY_PORT = window.location.port || "19001";
const GATEWAY_BASE = `${window.location.protocol}//${window.location.hostname}:${GATEWAY_PORT}`;

interface ProductionFile {
  name: string;
  path: string;
  size: number;
  category: string;
  isDir?: boolean;
}

/** Modal to embed a site or game in an iframe */
function IframePreview({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-accent" />
          <span className="text-sm font-semibold text-text-heading truncate max-w-md">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<ExternalLink size={12} />}
            onClick={() => window.open(url, "_blank")}
          >
            Open Tab
          </Button>
          <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={onClose} />
        </div>
      </div>
      <iframe
        src={url}
        title={title}
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-top-navigation-by-user-activation"
        allow="accelerometer; camera; encrypted-media; gamepad; gyroscope; fullscreen"
      />
    </div>
  );
}

/** Card for a single project file */
function ProjectCard({
  file,
  onPreview,
}: {
  file: ProductionFile;
  onPreview: (f: ProductionFile) => void;
}) {
  const fileUrl = `${GATEWAY_BASE}/${file.path}`;
  const isGame = file.category === "games" || file.isDir;
  const isWebsite = file.category === "websites";
  const displayName = file.name
    .replace(/_/g, " ")
    .replace(/\.html?$/i, "")
    .replace(/\.json$/i, "")
    .slice(0, 60);

  return (
    <Card
      className="space-y-3 hover:border-pink-500/40 transition-all group cursor-pointer"
      onClick={() => onPreview(file)}
    >
      {/* Thumbnail area */}
      <div className="h-28 rounded-xl bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-blue-500/10 flex flex-col items-center justify-center gap-2 relative overflow-hidden">
        <div className="text-3xl">{isGame ? "🎮" : isWebsite ? "🌐" : "📄"}</div>
        <p className="text-xs text-text-muted">{file.category}</p>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Button
            size="sm"
            icon={<Eye size={12} />}
            onClick={(e) => {
              e.stopPropagation();
              onPreview(file);
            }}
          >
            Preview
          </Button>
        </div>
      </div>

      <div>
        <p className="font-semibold text-text-heading text-sm truncate">{displayName}</p>
        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
          <Clock size={10} />
          <span>{(file.size / 1024).toFixed(1)} KB</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          icon={<Play size={12} />}
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(file);
          }}
        >
          {isGame ? "Play" : "Preview"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<ExternalLink size={12} />}
          onClick={(e) => {
            e.stopPropagation();
            window.open(fileUrl, "_blank");
          }}
        />
        <a href={fileUrl} download={file.name}>
          <Button
            size="sm"
            variant="ghost"
            icon={<Download size={12} />}
            onClick={(e) => e.stopPropagation()}
          />
        </a>
      </div>
    </Card>
  );
}

const PAGE_SIZE = 20;
const TABS = [
  { id: "websites", label: "🌐 Websites", cat: "websites" },
  { id: "games", label: "🎮 Games", cat: "games" },
  { id: "all", label: "All Projects", cat: "" },
];

export function LovablePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("websites");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [previewFile, setPreviewFile] = useState<ProductionFile | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Load websites from republic-output
  const { data: websiteData, refetch: refetchWebsites, loading, error } = useRpc<{
    ok?: boolean;
    files?: ProductionFile[];
  }>("republic.productions.files", { category: "websites" });
  const { data: gameData, refetch: refetchGames } = useRpc<{
    ok?: boolean;
    files?: ProductionFile[];
  }>("republic.productions.files", { category: "games" });

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetchWebsites} />;
  }

  const websites = websiteData?.files ?? [];
  const games = gameData?.files ?? [];
  const allProjects =
    activeTab === "websites" ? websites : activeTab === "games" ? games : [...websites, ...games];

  const filtered = allProjects.filter(
    (f) => !search || f.name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const pageFiles = filtered.slice(pageClamped * PAGE_SIZE, (pageClamped + 1) * PAGE_SIZE);

  const liveCount = allProjects.filter(
    (f) => !f.isDir && (f.name.endsWith(".html") || f.name.endsWith(".htm")),
  ).length;

  async function generate() {
    if (!prompt.trim()) {return;}
    setGenerating(true);
    setGenerateError(null);
    try {
      await rpc("lovable.generate", { prompt });
      setPrompt("");
      setTimeout(() => {
        refetchWebsites();
        refetchGames();
      }, 3000);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "AI generation failed — check gateway logs");
    } finally {
      setGenerating(false);
    }
  }

  const previewUrl = previewFile ? `${GATEWAY_BASE}/${previewFile.path}` : "";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {generateError && <Alert variant="danger">{generateError}</Alert>}
      <PageHeader
        title="Lovable"
        description="AI-powered full-stack app builder — browse and play citizen-created websites & games"
        icon={<Heart size={28} />}
        actions={
          <Button
            icon={<RefreshCw size={14} />}
            variant="outline"
            size="sm"
            onClick={() => {
              refetchWebsites();
              refetchGames();
            }}
          >
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Websites"
          value={websites.length}
          sub="In republic-output/websites"
          icon={<Globe size={16} />}
        />
        <StatCard
          label="Games"
          value={games.length}
          sub="In republic-output/games"
          icon={<Gamepad2 size={16} />}
        />
        <StatCard
          label="HTML Pages"
          value={liveCount}
          sub="Playable now"
          icon={<Play size={16} />}
        />
        <StatCard
          label="Total"
          value={websites.length + games.length}
          sub="All projects"
          icon={<Code2 size={16} />}
        />
      </div>

      {/* Prompt builder */}
      <Card className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 border-pink-500/30">
        <div className="flex items-start gap-3">
          <Heart className="text-pink-400 mt-1 flex-shrink-0" size={20} />
          <div className="flex-1">
            <h3 className="font-semibold text-text-heading mb-2">Build with AI</h3>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                className="flex-1 px-4 py-2.5 bg-bg-card border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                placeholder="Describe the website or game you want to build..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
              />
              <Button
                icon={<Sparkles size={14} />}
                disabled={!prompt.trim() || generating}
                onClick={generate}
              >
                {generating ? "Generating…" : "Generate"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-bg-secondary rounded-xl p-1">
          {TABS.map((t) => (
            <button
type="button"               key={t.id}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === t.id ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              onClick={() => {
                setActiveTab(t.id);
                setPage(0);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full bg-bg-input border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Globe size={40} className="text-text-muted/30" />
            <p className="text-text-muted text-sm">
              {allProjects.length === 0
                ? "No projects found in republic-output. Citizens are still building!"
                : "No projects match your search."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pageFiles.map((f) => (
              <ProjectCard key={f.path} file={f} onPreview={setPreviewFile} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                icon={<ChevronLeft size={14} />}
                disabled={pageClamped === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Prev
              </Button>
              <span className="text-xs text-text-muted">
                Page {pageClamped + 1} / {totalPages} · {filtered.length} projects
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pageClamped >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Preview modal */}
      {previewFile && (
        <IframePreview
          url={previewUrl}
          title={previewFile.name.replace(/_/g, " ")}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
