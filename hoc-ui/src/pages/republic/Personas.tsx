import {
  UserCircle,
  Plus,
  Trash2,
  MessageSquare,
  Zap,
  RefreshCw,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState, useRef } from "react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  Alert,
  RpcStatus,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useRpc, rpc, invalidateRpcCache } from "@/lib/rpc";

type Persona = {
  id: string;
  name: string;
  status: "active" | "inactive" | "connected";
  agentId?: string;
  prompt?: string;
  createdAt?: number;
};

type ChatMsg = { role: "user" | "persona"; text: string; ts: number };

export function PersonasPage() {
  const { data, loading, error, refetch } = useRpc<{ personas?: Persona[] }>(
    "republic.persona.list",
    {},
    [],
    { staleTimeMs: 8_000 },
  );
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [chatPersona, setChatPersona] = useState<Persona | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const [chatting, setChatting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmPersonaId, setConfirmPersonaId] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const personas = data?.personas ?? [];

  async function createPersona() {
    if (!newName.trim()) {return;}
    setCreating(true);
    setActionError("");
    try {
      await rpc("republic.persona.create", { name: newName.trim(), textPrompt: newPrompt.trim() });
      invalidateRpcCache("republic.persona.list");
      refetch();
      setNewName("");
      setNewPrompt("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function activatePersona(p: Persona) {
    try {
      await rpc("republic.persona.activate", { personaId: p.id });
      invalidateRpcCache("republic.persona.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deletePersona(id: string) {
    setConfirmPersonaId(null);
    try {
      await rpc("republic.persona.delete", { personaId: id });
      invalidateRpcCache("republic.persona.list");
      refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function sendChat() {
    if (!chatPersona || !chatInput.trim()) {return;}
    const msg = chatInput.trim();
    setChatInput("");
    setChatting(true);
    setChatLog((l) => [...l, { role: "user", text: msg, ts: Date.now() }]);
    try {
      const r = await rpc<{ reply?: string }>("republic.persona.chat", {
        personaId: chatPersona.id,
        message: msg,
      });
      setChatLog((l) => [
        ...l,
        { role: "persona", text: r?.reply ?? "(no reply)", ts: Date.now() },
      ]);
      setTimeout(() => chatRef.current?.scrollTo(0, 9999), 100);
    } catch (e) {
      setChatLog((l) => [...l, { role: "persona", text: `Error: ${e}`, ts: Date.now() }]);
    } finally {
      setChatting(false);
    }
  }

  const active = personas.filter((p) => p.status === "active").length;
  const connected = personas.filter((p) => p.status === "connected").length;

  return (
    <>
      <div className="p-6 space-y-6 animate-fade-in">
        <PageHeader
          title="Personas"
          description="AI personas — create, activate, connect to agents, and chat"
          icon={<UserCircle size={28} />}
          actions={
            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetch}>
              Refresh
            </Button>
          }
        />

        {error && <Alert variant="danger">{error}</Alert>}
        {actionError && <Alert variant="danger">{actionError}</Alert>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Total Personas"
            value={personas.length}
            icon={<UserCircle size={16} />}
          />
          <StatCard label="Active" value={active} icon={<Zap size={16} />} />
          <StatCard label="Connected" value={connected} icon={<Wifi size={16} />} />
          <StatCard
            label="Inactive"
            value={personas.length - active - connected}
            icon={<WifiOff size={16} />}
          />
        </div>

        {/* Create Persona */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
            <Plus size={16} /> New Persona
          </h3>
          <div className="flex flex-col gap-3">
            <input
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
              placeholder="Persona name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted h-20 resize-none"
              placeholder="System prompt / personality description..."
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
            />
            <Button onClick={createPersona} loading={creating} disabled={!newName.trim()}>
              Create Persona
            </Button>
          </div>
        </Card>

        {/* Persona List */}
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">🎭 Personas</h3>
          {loading ? (
            <p className="text-sm text-text-muted">Loading...</p>
          ) : personas.length === 0 ? (
            <p className="text-sm text-text-muted">No personas yet. Create one above.</p>
          ) : (
            <div className="space-y-3">
              {personas.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border/30"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.status === "active" ? "bg-success" : p.status === "connected" ? "bg-accent" : "bg-border"}`}
                    />
                    <div>
                      <p className="text-sm font-medium text-text-heading">{p.name}</p>
                      <p className="text-xs text-text-muted">
                        {p.agentId ? `Agent: ${p.agentId}` : "Standalone"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        p.status === "active"
                          ? "success"
                          : p.status === "connected"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {p.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<MessageSquare size={12} />}
                      onClick={() => {
                        setChatPersona(p);
                        setChatLog([]);
                      }}
                    >
                      Chat
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Zap size={12} />}
                      onClick={() => activatePersona(p)}
                    >
                      Activate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={12} />}
                      onClick={() => setConfirmPersonaId(p.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Chat Panel */}
        {chatPersona && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-heading flex items-center gap-2">
                <MessageSquare size={16} /> Chat with {chatPersona.name}
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setChatPersona(null)}>
                ✕ Close
              </Button>
            </div>
            <div
              ref={chatRef}
              className="h-64 overflow-y-auto space-y-2 mb-3 p-3 rounded-lg bg-bg-secondary border border-border/30"
            >
              {chatLog.length === 0 && (
                <p className="text-xs text-text-muted">Send a message to start chatting...</p>
              )}
              {chatLog.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-xs px-3 py-2 rounded-lg text-sm ${m.role === "user" ? "bg-accent text-white" : "bg-bg-secondary border border-border text-text-primary"}`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted"
                placeholder="Message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
              />
              <Button onClick={sendChat} loading={chatting} disabled={!chatInput.trim()}>
                <Radio size={14} />
              </Button>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmPersonaId !== null}
        title="Delete persona?"
        message="Delete this persona permanently? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmPersonaId && void deletePersona(confirmPersonaId)}
        onCancel={() => setConfirmPersonaId(null)}
      />
    </>
  );
}
