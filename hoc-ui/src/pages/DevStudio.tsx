import {
  Code2,
  Play,
  Eye,
  FolderOpen,
  GitBranch,
  Monitor,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  File,
  ChevronRight,
  Users,
  X,
  Terminal,
  Zap,
} from "lucide-react";
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Card, Badge, Button, StatCard, Tabs, PreviewModal , RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  type: "webapp" | "api" | "script" | "app";
  status: "building" | "ready" | "error" | "idle";
  framework: string;
  lastUpdated: number;
  creator: string;
  previewUrl?: string;
  // Extra workspace info
  fileCount?: number;
  totalSizeBytes?: number;
  assignedCitizens?: string[];
  rootDir?: string;
  description?: string;
}

// ─── Constants ───────────────────────────────────────────────

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  ready: "success",
  building: "warning",
  error: "danger",
  idle: "neutral",
};

const TYPE_EMOJI: Record<string, string> = {
  webapp: "🌐",
  api: "⚡",
  script: "📜",
  app: "📱",
};

const DEV_TABS = [
  { id: "projects", label: "Projects" },
  { id: "editor", label: "File Browser" },
  { id: "terminal", label: "Terminal" },
];

// ─── Team Formation Modal ────────────────────────────────────

function TeamFormationModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { data: citizenData } = useRpc<{
    citizens?: Array<{ id: string; name: string; specialization?: string; status?: string }>;
  }>("republic.citizen.list", {});
  const agents = (citizenData?.citizens ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    specialization: c.specialization ?? "general",
    status: c.status ?? "active",
  }));
  const candidates = agents
    .filter((a) => a.status === "active" || a.status === "idle")
    .filter((a) => !project.assignedCitizens?.includes(a.id))
    .slice(0, 12);

  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [done, setDone] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function assign() {
    if (!selected.length) {
      return;
    }
    setAssigning(true);
    try {
      await rpc("republic.workspace.assign", { projectId: project.id, citizenIds: selected });
      setDone(true);
      setTimeout(onClose, 1200);
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-lg mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-text-heading flex items-center gap-2">
            <Users size={18} /> Assemble Team for "{project.name}"
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-bg-secondary">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <p className="text-success text-center py-4">✅ Team assigned successfully!</p>
        ) : (
          <>
            {project.assignedCitizens && project.assignedCitizens.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1">Currently assigned:</p>
                <div className="flex flex-wrap gap-1">
                  {project.assignedCitizens.map((id) => (
                    <Badge key={id} variant="neutral">
                      {id.slice(0, 10)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <p className="text-sm text-text-muted">Select citizens to add to the team:</p>
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="text-xs text-text-muted col-span-2 text-center py-4">
                  No available citizens found.
                </p>
              ) : (
                candidates.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => toggle(a.id)}
                    className={`flex flex-col items-start p-2 rounded-lg border text-sm transition-all ${
                      selected.includes(a.id)
                        ? "border-accent bg-accent/10 text-text-heading"
                        : "border-border hover:border-accent/40 text-text-secondary"
                    }`}
                  >
                    <span className="font-medium truncate w-full">{a.name}</span>
                    <span className="text-xs text-text-muted">{a.specialization}</span>
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                icon={<Users size={12} />}
                onClick={assign}
                loading={assigning}
                disabled={!selected.length}
              >
                Assign {selected.length > 0 ? `(${selected.length})` : ""}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── File Tree ───────────────────────────────────────────────

function FileTree({
  project,
  onSelectFile,
}: {
  project: Project;
  onSelectFile: (path: string, content: string) => void;
}) {
  const { data, loading, error, refetch } = useRpc<{ files?: Array<{ name: string; type: string; size?: number }> }>("republic.workspace.file.list", {
    projectId: project.id,
  });
  // ALL hooks before any conditional returns (React Error #310)
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const rawFiles = data?.files ?? [];
  // Normalize: backend returns FileEntry objects {name, type, size?}
  // but may also return plain strings in some code paths
  const files = rawFiles.map((f) => (typeof f === "string" ? f : f.name));

  async function openFile(path: string) {
    setLoadingFile(path);
    try {
      const res = await rpc<{ content?: string }>("republic.workspace.file.read", {
        projectId: project.id,
        relativePath: path,
      });
      onSelectFile(path, res?.content ?? "// Could not load file");
    } catch {
      onSelectFile(path, "// Error loading file");
    } finally {
      setLoadingFile(null);
    }
  }

  if (!files.length) {
    return (
      <div className="py-8 text-center space-y-2">
        <FolderOpen size={24} className="text-text-muted/30 mx-auto" />
        <p className="text-xs text-text-muted">No files yet. Citizens will write files here.</p>
        {project.rootDir && (
          <p className="text-xs text-text-muted/60 font-mono">{project.rootDir}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 max-h-72 overflow-y-auto">
      {files.map((f) => (
        <button
          type="button"
          key={f}
          onClick={() => openFile(f)}
          disabled={loadingFile === f}
          className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-bg-secondary text-xs font-mono text-text-secondary hover:text-text-primary transition-colors"
        >
          <File size={12} className="text-accent/60 shrink-0" />
          <span className="truncate">{f}</span>
          {loadingFile === f && <ChevronRight size={10} className="ml-auto animate-spin" />}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export function DevStudioPage() {
  const navigate = useNavigate();
  const { data, loading, refetch } = useRpc<{ projects?: Project[] }>(
    "republic.dev.projects",
    {},
    [],
    { staleTimeMs: 5_000, refetchIntervalMs: 10_000 },
  );
  const projects = data?.projects ?? [];

  const [tab, setTab] = useState("projects");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [previewData, setPreviewData] = useState<{ url: string; title: string } | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);

  // File browser state
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);

  // Terminal output
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "$ Republic Dev Terminal — ready",
    "$ Connect a project to view build output and logs",
  ]);

  const openUrl = useCallback(
    (url?: string, title = "Live Preview") => {
      if (url) {
        setPreviewData({ url, title });
      }
    },
    [setPreviewData],
  );

  const handleBuildAndRun = useCallback(
    async (p: Project) => {
      if (!p.previewUrl) {
        setTerminalLines((prev) => [
          ...prev,
          `$ Starting build for "${p.name}"…`,
          "$ Run deploy_app in a citizen chat to build and get a preview URL.",
        ]);
        setTab("terminal");
        return;
      }
      openUrl(p.previewUrl, p.name);
    },
    [openUrl],
  );

  const filtered = projects
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter(
      (p) =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.creator.toLowerCase().includes(search.toLowerCase()) ||
        (p.framework ?? "").toLowerCase().includes(search.toLowerCase()),
    );

  const readyCount = projects.filter((p) => p.status === "ready").length;
  const buildingCount = projects.filter((p) => p.status === "building").length;
  const contributors = new Set(projects.flatMap((p) => [p.creator, ...(p.assignedCitizens ?? [])]))
    .size;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Dev Studio"
        description="Live AI citizen development environment — real projects, real files, real previews"
        icon={<Code2 size={28} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Sync
            </Button>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => navigate("/lovable")}>
              New Project
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Projects" value={projects.length} icon={<FolderOpen size={16} />} />
        <StatCard label="Live & Ready" value={readyCount} icon={<Monitor size={16} />} />
        <StatCard label="Active Builds" value={buildingCount} icon={<Play size={16} />} />
        <StatCard label="Contributors" value={contributors} icon={<GitBranch size={16} />} />
      </div>

      {projects.length === 0 && !loading && (
        <Card className="py-10 text-center space-y-3">
          <Zap size={32} className="text-accent/40 mx-auto" />
          <p className="text-text-heading font-semibold">No citizen projects yet</p>
          <p className="text-sm text-text-muted max-w-sm mx-auto">
            Ask a citizen to build something! They'll use{" "}
            <code className="bg-bg-secondary px-1 rounded">scaffold_project</code> →{" "}
            <code className="bg-bg-secondary px-1 rounded">write_code</code> →{" "}
            <code className="bg-bg-secondary px-1 rounded">deploy_app</code> and projects will
            appear here in real time.
          </p>
          <Button size="sm" onClick={() => navigate("/chat")}>
            Start a Chat
          </Button>
        </Card>
      )}

      {projects.length > 0 && (
        <>
          <Tabs tabs={DEV_TABS} active={tab} onChange={setTab} />

          {/* Projects Tab */}
          {tab === "projects" && (
            <div className="space-y-4">
              {/* Search + Filter */}
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-48">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                  <input
                    className="w-full pl-9 pr-4 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                    placeholder="Search projects, creators, frameworks…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {(["all", "ready", "building", "idle", "error"] as string[]).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={statusFilter === s ? "primary" : "outline"}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Project list */}
                <div className="lg:col-span-2 space-y-3">
                  {filtered.length === 0 ? (
                    <div className="py-12 text-center">
                      <FolderOpen size={32} className="text-text-muted/30 mx-auto mb-3" />
                      <p className="text-sm text-text-muted">No projects match your filters.</p>
                    </div>
                  ) : (
                    filtered.map((p) => (
                      <Card
                        key={p.id}
                        className={`cursor-pointer hover:border-accent/40 transition-all ${
                          selectedProject?.id === p.id ? "border-accent/60" : ""
                        }`}
                        onClick={() => {
                          setSelectedProject(p);
                          setSelectedFile(null);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{TYPE_EMOJI[p.type] ?? "📦"}</span>
                            <div>
                              <p className="font-semibold text-text-heading font-mono text-sm">
                                {p.name}
                              </p>
                              <p className="text-xs text-text-muted">
                                {p.framework} · by {p.creator}
                                {p.fileCount != null && ` · ${p.fileCount} files`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {p.previewUrl && (
                              <button
                                type="button"
                                className="text-accent/70 hover:text-accent"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openUrl(p.previewUrl, p.name);
                                }}
                                title="Open preview"
                              >
                                <ExternalLink size={14} />
                              </button>
                            )}
                            <Badge variant={STATUS_BADGE[p.status]}>{p.status}</Badge>
                            <span className="text-xs text-text-muted">
                              {new Date(p.lastUpdated).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>

                {/* Detail panel */}
                <div>
                  {selectedProject ? (
                    <Card className="sticky top-20 space-y-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl">
                            {TYPE_EMOJI[selectedProject.type] ?? "📦"}
                          </span>
                          <h3 className="font-bold text-text-heading font-mono text-sm truncate">
                            {selectedProject.name}
                          </h3>
                        </div>
                        <Badge variant={STATUS_BADGE[selectedProject.status]}>
                          {selectedProject.status}
                        </Badge>
                      </div>

                      <div className="space-y-2 text-sm">
                        {[
                          { label: "Framework", value: selectedProject.framework },
                          { label: "Creator", value: selectedProject.creator },
                          {
                            label: "Updated",
                            value: new Date(selectedProject.lastUpdated).toLocaleDateString(),
                          },
                          selectedProject.fileCount != null
                            ? { label: "Files", value: String(selectedProject.fileCount) }
                            : null,
                          selectedProject.assignedCitizens?.length
                            ? {
                                label: "Team",
                                value: `${selectedProject.assignedCitizens.length} citizens`,
                              }
                            : null,
                        ]
                          .filter((row): row is { label: string; value: string } => row !== null)
                          .map((row) => (
                            <div key={row.label} className="flex justify-between">
                              <span className="text-text-muted">{row.label}</span>
                              <span className="text-text-secondary font-medium">{row.value}</span>
                            </div>
                          ))}
                        {selectedProject.previewUrl && (
                          <div className="flex justify-between">
                            <span className="text-text-muted">Preview</span>
                            <button
                              type="button"
                              className="text-accent text-xs hover:underline truncate max-w-28"
                              onClick={() =>
                                openUrl(selectedProject.previewUrl, selectedProject.name)
                              }
                            >
                              {selectedProject.previewUrl}
                            </button>
                          </div>
                        )}
                      </div>

                      {selectedProject.description && (
                        <p className="text-xs text-text-muted border-t border-border pt-2">
                          {selectedProject.description}
                        </p>
                      )}

                      <div className="space-y-2">
                        <Button
                          className="w-full"
                          size="sm"
                          icon={<FolderOpen size={12} />}
                          onClick={() => setTab("editor")}
                        >
                          Browse Files
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full"
                          size="sm"
                          icon={<Users size={12} />}
                          onClick={() => setShowTeamModal(true)}
                        >
                          Assemble Team
                        </Button>
                        {selectedProject.previewUrl ? (
                          <Button
                            variant="success"
                            className="w-full"
                            size="sm"
                            icon={<Eye size={12} />}
                            onClick={() =>
                              openUrl(selectedProject.previewUrl, selectedProject.name)
                            }
                          >
                            Live Preview ↗
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full"
                            size="sm"
                            icon={<Play size={12} />}
                            onClick={() => handleBuildAndRun(selectedProject)}
                          >
                            Build &amp; Run
                          </Button>
                        )}
                      </div>
                    </Card>
                  ) : (
                    <Card className="flex flex-col items-center justify-center py-12 text-center">
                      <FolderOpen size={32} className="text-text-muted/30 mb-3" />
                      <p className="text-sm text-text-muted">Select a project to view details</p>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* File Browser Tab */}
          {tab === "editor" && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* File tree sidebar */}
              <Card className="lg:col-span-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-text-heading">
                    📁 {selectedProject?.name ?? "Select a project"}
                  </h3>
                </div>
                {selectedProject ? (
                  <FileTree
                    project={selectedProject}
                    onSelectFile={(path, content) => setSelectedFile({ path, content })}
                  />
                ) : (
                  <p className="text-xs text-text-muted text-center py-4">
                    Select a project in the Projects tab first.
                  </p>
                )}
              </Card>

              {/* File content viewer */}
              <Card className="lg:col-span-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-text-muted">
                    {selectedFile ? selectedFile.path : "No file selected"}
                  </span>
                  {selectedProject?.previewUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Eye size={12} />}
                      onClick={() => openUrl(selectedProject.previewUrl, selectedProject.name)}
                    >
                      Preview
                    </Button>
                  )}
                </div>
                <div className="bg-bg-secondary rounded-xl p-4 font-mono text-xs text-success/80 h-96 overflow-auto border border-border/30 whitespace-pre-wrap">
                  {selectedFile ? (
                    <code>{selectedFile.content}</code>
                  ) : (
                    <span className="text-text-muted">
                      Click a file in the tree to view its contents.
                    </span>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Terminal Tab */}
          {tab === "terminal" && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Terminal size={16} className="text-accent" />
                <h3 className="font-semibold text-text-heading text-sm">Build & Run Terminal</h3>
              </div>
              <div className="bg-bg-secondary rounded-xl p-4 font-mono text-xs h-72 overflow-auto border border-border/30">
                {terminalLines.map((line, i) => (
                  <p
                    key={i}
                    className={line.startsWith("$") ? "text-accent/80" : "text-text-secondary"}
                  >
                    {line}
                  </p>
                ))}
              </div>
              {selectedProject && (
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<RefreshCw size={12} />}
                    onClick={() =>
                      setTerminalLines((prev) => [
                        ...prev,
                        `$ republic.workspace.exec ${selectedProject.id} — use citizen chat to run build`,
                      ])
                    }
                  >
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    icon={<ExternalLink size={12} />}
                    onClick={() => navigate("/cicd")}
                  >
                    Go to CI/CD
                  </Button>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Team Formation Modal */}
      {showTeamModal && selectedProject && (
        <TeamFormationModal project={selectedProject} onClose={() => setShowTeamModal(false)} />
      )}

      {/* Preview Modal */}
      {previewData && (
        <PreviewModal
          url={previewData.url}
          title={previewData.title}
          onClose={() => setPreviewData(null)}
        />
      )}
    </div>
  );
}
