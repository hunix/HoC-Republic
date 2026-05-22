import {
  FolderOpen,
  File,
  Terminal,
  GitCommit,
  RefreshCw,
  Plus,
  Trash2,
  Edit,
  Layers,
  Rocket,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Button, Alert, Badge, RpcStatus } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type Workspace = {
  id: string;
  name: string;
  path?: string;
  status?: string;
  createdAt?: number;
  fileCount?: number;
};
type FileEntry = { name: string; type: "file" | "dir"; size?: number };
type TemplateInfo = {
  id: string;
  name: string;
  description: string;
  stack: string[];
};

export function WorkspacePage() {
  const { data, loading, error, refetch } = useRpc<{ workspaces?: Workspace[] }>(
    "republic.workspace.list",
    {},
    [],
    { staleTimeMs: 8_000 },
  );
  const { data: templatesData } = useRpc<{ templates?: TemplateInfo[] }>(
    "republic.workspace.templates",
    {},
  );
  const [selected, setSelected] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [execCmd, setExecCmd] = useState("");
  const [execOutput, setExecOutput] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [creating, setCreating] = useState(false);
  const [scaffolding, setScaffolding] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmFile, setConfirmFile] = useState<string | null>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  async function createWorkspace() {
    if (!newName.trim()) {
      return;
    }
    setCreating(true);
    setActionError("");
    try {
      const result = await rpc<{ workspaceId?: string }>("republic.workspace.create", {
        name: newName.trim(),
      });
      // If a template is selected and workspace was created, auto-scaffold
      if (selectedTemplate && result?.workspaceId) {
        try {
          await rpc("republic.workspace.scaffold", {
            projectId: result.workspaceId,
            template: selectedTemplate,
            projectName: newName.trim(),
          });
        } catch {
          // Non-fatal: workspace created but scaffold failed
        }
      }
      invalidateRpcCache("republic.workspace.list");
      setNewName("");
      setSelectedTemplate("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function scaffoldWorkspace() {
    if (!selected || !selectedTemplate) {
      return;
    }
    setScaffolding(true);
    setActionError("");
    try {
      await rpc("republic.workspace.scaffold", {
        projectId: selected.id,
        template: selectedTemplate,
        projectName: selected.name,
      });
      // Refresh files after scaffold
      const r = await rpc<{ files?: FileEntry[] }>("republic.workspace.file.list", {
        workspaceId: selected.id,
      });
      setFiles(r?.files ?? []);
      setSelectedTemplate("");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setScaffolding(false);
    }
  }

  async function selectWorkspace(ws: Workspace) {
    setSelected(ws);
    setOpenFile(null);
    try {
      const r = await rpc<{ files?: FileEntry[] }>("republic.workspace.file.list", {
        workspaceId: ws.id,
      });
      setFiles(r?.files ?? []);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function readFile(name: string) {
    if (!selected) {
      return;
    }
    try {
      const r = await rpc<{ content?: string }>("republic.workspace.file.read", {
        workspaceId: selected.id,
        path: name,
      });
      setOpenFile(name);
      setEditContent(r?.content ?? "");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function writeFile() {
    if (!selected || !openFile) {
      return;
    }
    try {
      await rpc("republic.workspace.file.write", {
        workspaceId: selected.id,
        path: openFile,
        content: editContent,
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteFile(name: string) {
    setConfirmFile(null);
    if (!selected) {
      return;
    }
    try {
      await rpc("republic.workspace.file.delete", { workspaceId: selected.id, path: name });
      setFiles((f) => f.filter((x) => x.name !== name));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function execCommand() {
    if (!selected || !execCmd.trim()) {
      return;
    }
    try {
      const r = await rpc<{ output?: string; exitCode?: number }>("republic.workspace.exec", {
        workspaceId: selected.id,
        command: execCmd.trim(),
      });
      setExecOutput(`[exit: ${r?.exitCode ?? 0}]\n${r?.output ?? ""}`);
    } catch (e) {
      setExecOutput(`Error: ${e}`);
    }
  }

  async function gitCommit() {
    if (!selected) {
      return;
    }
    const msg = prompt("Commit message:");
    if (!msg) {
      return;
    }
    try {
      await rpc("republic.workspace.git.commit", { workspaceId: selected.id, message: msg });
      alert("Committed successfully!");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const workspaces = data?.workspaces ?? [];
  const templates = templatesData?.templates ?? [];
  const isEmptyWorkspace = selected && (selected.fileCount === 0 || files.length === 0);
  const hasFsdStructure = files.some(
    (f) =>
      f.name === "src" ||
      f.name === ".hoc" ||
      f.name === "RULES.md" ||
      f.name === ".eslintrc.json",
  );

  return (
    <>
      <div className="p-6 space-y-6 animate-fade-in">
        <PageHeader
          title="Workspaces"
          description="File browser, code editor, terminal execution, and git integration"
          icon={<FolderOpen size={28} />}
          actions={
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
          }
        />

        {error && <Alert variant="danger">{error}</Alert>}
        {actionError && <Alert variant="danger">{actionError}</Alert>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Workspace List */}
          <div className="space-y-4">
            <Card>
              <h3 className="font-semibold text-text-heading mb-3 flex items-center gap-2">
                <FolderOpen size={16} /> Workspaces
              </h3>

              {/* Create workspace form */}
              <div className="space-y-2 mb-3">
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-2 py-1.5 rounded bg-bg-secondary border border-border text-xs text-text-primary placeholder:text-text-muted"
                    placeholder="New workspace name..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !creating && createWorkspace()}
                  />
                  <Button
                    size="sm"
                    loading={creating}
                    onClick={createWorkspace}
                    icon={<Plus size={12} />}
                    aria-label="Create workspace"
                  />
                </div>

                {/* Template selector */}
                {templates.length > 0 && (
                  <select
                    className="w-full px-2 py-1.5 rounded bg-bg-secondary border border-border text-xs text-text-primary"
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                  >
                    <option value="">No template (empty workspace)</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.description}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {loading ? (
                <p className="text-xs text-text-muted">Loading...</p>
              ) : workspaces.length === 0 ? (
                <p className="text-xs text-text-muted">No workspaces.</p>
              ) : (
                <div className="space-y-2">
                  {workspaces.map((ws) => (
                    <button
                      type="button"
                      key={ws.id}
                      onClick={() => selectWorkspace(ws)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selected?.id === ws.id ? "bg-accent/20 border border-accent/40 text-accent" : "bg-bg-secondary border border-border/30 text-text-secondary hover:bg-bg-secondary/80"}`}
                    >
                      <span className="flex items-center justify-between">
                        <span>{ws.name}</span>
                        {ws.status === "active" && (
                          <Badge variant="success">active</Badge>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* File Browser & Editor */}
          <div className="md:col-span-2 space-y-4">
            {selected && (
              <>
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-text-heading text-sm flex items-center gap-2">
                      <File size={14} /> {selected.name} / Files
                      {hasFsdStructure && (
                        <Badge variant="purple">
                          <Layers size={10} className="mr-1" />
                          FSD
                        </Badge>
                      )}
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<GitCommit size={12} />}
                        onClick={gitCommit}
                      >
                        Git Commit
                      </Button>
                    </div>
                  </div>

                  {/* Scaffold CTA for empty workspaces */}
                  {isEmptyWorkspace && (
                    <div className="mb-3 p-3 rounded-lg bg-accent/5 border border-accent/20">
                      <p className="text-xs text-text-secondary mb-2">
                        <Rocket size={12} className="inline mr-1" />
                        This workspace is empty. Scaffold a project template to get started:
                      </p>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 px-2 py-1.5 rounded bg-bg-secondary border border-border text-xs text-text-primary"
                          value={selectedTemplate}
                          onChange={(e) => setSelectedTemplate(e.target.value)}
                        >
                          <option value="">Select template...</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} — {t.description}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="primary"
                          loading={scaffolding}
                          disabled={!selectedTemplate}
                          onClick={scaffoldWorkspace}
                          icon={<Layers size={12} />}
                        >
                          Scaffold
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {files.length === 0 ? (
                      <p className="text-xs text-text-muted">No files.</p>
                    ) : (
                      files.map((f) => (
                        <div
                          key={f.name}
                          className="flex items-center justify-between px-2 py-1 rounded hover:bg-bg-secondary"
                        >
                          <button
                            type="button"
                            className="text-xs text-text-secondary flex items-center gap-1.5 flex-1"
                            onClick={() => readFile(f.name)}
                          >
                            {f.type === "dir" ? <FolderOpen size={12} /> : <File size={12} />}{" "}
                            {f.name}
                            {f.size != null && (
                              <span className="text-text-muted ml-auto">
                                {(f.size / 1024).toFixed(1)}KB
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmFile(f.name)}
                            className="text-text-muted hover:text-danger ml-2"
                            aria-label={`Delete file ${f.name}`}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {openFile && (
                  <Card>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-accent flex items-center gap-1">
                        <Edit size={12} /> {openFile}
                      </h3>
                      <Button size="sm" onClick={writeFile}>
                        Save
                      </Button>
                    </div>
                    <textarea
                      className="w-full font-mono text-xs bg-bg-secondary border border-border rounded p-3 text-text-primary h-48 resize-none"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                  </Card>
                )}

                <Card>
                  <h3 className="font-semibold text-text-heading mb-3 text-sm flex items-center gap-2">
                    <Terminal size={14} /> Terminal
                  </h3>
                  <div className="flex gap-2 mb-2">
                    <input
                      className="flex-1 font-mono text-xs px-3 py-2 rounded bg-bg-secondary border border-border text-text-primary placeholder:text-text-muted"
                      placeholder="$ command..."
                      value={execCmd}
                      onChange={(e) => setExecCmd(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && execCommand()}
                    />
                    <Button size="sm" onClick={execCommand}>
                      Run
                    </Button>
                  </div>
                  {execOutput && (
                    <pre className="font-mono text-xs bg-bg-secondary rounded p-3 text-text-secondary whitespace-pre-wrap max-h-32 overflow-y-auto border border-border/30">
                      {execOutput}
                    </pre>
                  )}
                </Card>
              </>
            )}
            {!selected && !loading && (
              <Card>
                <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                  <FolderOpen size={40} className="mb-3 opacity-30" />
                  <p className="text-sm">Select a workspace to browse files</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmFile !== null}
        title="Delete file?"
        message={`Delete "${confirmFile}" from this workspace? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => confirmFile && void deleteFile(confirmFile)}
        onCancel={() => setConfirmFile(null)}
      />
    </>
  );
}
