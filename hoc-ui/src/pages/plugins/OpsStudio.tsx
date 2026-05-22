import { Settings, Send } from "lucide-react";
/**
 * OpsStudio — Full-featured panels for:
 *   Paperclip (AI Company OS), Echo (demo/reference plugin)
 */
import { useState } from "react";
import { Card, Button, Alert, Badge } from "@/components/ui";
import { rpc } from "@/lib/rpc";
import { PluginShell, type PluginUsageEntry } from "./PluginShell";
import { PluginStudioLayout, type StudioPlugin } from "./PluginStudioLayout";

// ── Paperclip — AI Company OS ──

const PAPERCLIP_MODELS = [
  {
    id: "paperclip-runtime",
    name: "Paperclip Runtime",
    sizeGb: 0.0,
    description: "No model required — RPC-based company OS",
    downloaded: true,
    required: true,
  },
];

const PRIORITIES = ["low", "medium", "high", "critical"];

function PaperclipPanel() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");

  const [listCitizenId, setListCitizenId] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [tickets, setTickets] = useState<string>("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function createTicket() {
    if (!title.trim()) { return; }
    setLoading(true);
    setError("");
    setResult("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "paperclip.create-ticket",
        params: {
          title,
          description,
          assignee_citizen_id: assignee || undefined,
          priority,
        },
      })) as { result?: unknown };
      setResult(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "paperclip.create-ticket", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "paperclip.create-ticket", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function listTickets() {
    setListLoading(true);
    setTickets("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "paperclip.list-tickets",
        params: { citizen_id: listCitizenId || undefined },
      })) as { result?: unknown };
      setTickets(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "paperclip.list-tickets", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setTickets(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "paperclip.list-tickets", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setListLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-paperclip"
      displayName="Paperclip Company OS"
      description="AI Company OS — org charts, ticket assignments, heartbeat scheduling, token budgets, and multi-company governance. Citizens become employees of AI-run companies."
      models={PAPERCLIP_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="info">
          Paperclip integrates a Company OS where AI citizens work as employees. Create tickets,
          review assignments, and manage workloads.
        </Alert>

        {/* Create Ticket */}
        <Card>
          <h3 className="text-xs font-bold text-text-heading mb-3">Create Ticket</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1 uppercase tracking-wide">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Research new LLM architectures"
                className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1 uppercase tracking-wide">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Detailed description of what needs to be done..."
                className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-text-muted mb-1 uppercase tracking-wide">
                  Assignee (Citizen ID)
                </label>
                <input
                  type="text"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-text-muted mb-1 uppercase tracking-wide">
                  Priority
                </label>
                <div className="flex gap-1">
                  {PRIORITIES.map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        priority === p
                          ? "bg-accent text-white"
                          : "bg-bg-secondary text-text-muted"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {error && <Alert variant="danger">{error}</Alert>}

        <Button
          onClick={() => void createTicket()}
          loading={loading}
          icon={<Send size={14} />}
          className="w-full"
          disabled={!title.trim()}
        >
          Create Ticket
        </Button>

        {result && (
          <Card>
            <p className="text-xs font-semibold text-success mb-2">✅ Ticket Created</p>
            <pre className="text-xs text-text-secondary font-mono overflow-auto max-h-48 whitespace-pre-wrap">
              {result}
            </pre>
          </Card>
        )}

        {/* List Tickets */}
        <Card>
          <h3 className="text-xs font-bold text-text-heading mb-3">List Tickets</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={listCitizenId}
              onChange={(e) => setListCitizenId(e.target.value)}
              placeholder="Filter by Citizen ID (optional)"
              className="flex-1 bg-bg-input border border-border rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void listTickets()}
              loading={listLoading}
            >
              Fetch
            </Button>
          </div>
        </Card>

        {tickets && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Tickets</p>
            <pre className="text-xs text-text-secondary font-mono overflow-auto max-h-64 whitespace-pre-wrap">
              {tickets}
            </pre>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── Echo — Demo / Reference Plugin ──

const ECHO_MODELS = [
  {
    id: "echo-v1",
    name: "Echo v1",
    sizeGb: 0.0,
    description: "Local echo provider — no model download needed",
    downloaded: true,
    required: true,
  },
];

function EchoPanel() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [pingResult, setPingResult] = useState<string>("");
  const [pingLoading, setPingLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<string>("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function echo() {
    if (!message.trim()) { return; }
    setLoading(true);
    setResult("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "echo.ping",
        params: { message },
      })) as { result?: unknown };
      setResult(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "echo.ping", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "echo.ping", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function ping() {
    setPingLoading(true);
    setPingResult("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "echo.ping",
        params: {},
      })) as { result?: unknown };
      setPingResult(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "echo.ping", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setPingResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "echo.ping", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setPingLoading(false);
    }
  }

  async function status() {
    setStatusLoading(true);
    setStatusResult("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "echo.status",
        params: {},
      })) as { result?: unknown };
      setStatusResult(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "echo.status", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setStatusResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "echo.status", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setStatusLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-echo"
      displayName="Echo Plugin"
      description="Reference HoC plugin demonstrating the plugin architecture. Echoes back prompts, registers an inference provider (echo-v1), and exposes gateway RPCs for testing."
      models={ECHO_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="info">
          Echo is a reference plugin for developers. Use it to test plugin infrastructure, RPC
          routing, and tool invocation.
        </Alert>

        {/* Echo Message */}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Echo Message
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message to echo back..."
              className="flex-1 bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter") { void echo(); }
              }}
            />
            <Button
              size="sm"
              onClick={() => void echo()}
              loading={loading}
              icon={<Send size={12} />}
              disabled={!message.trim()}
            >
              Echo
            </Button>
          </div>
        </Card>

        {result && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Echo Response</p>
            <pre className="text-xs text-text-secondary font-mono overflow-auto max-h-48 whitespace-pre-wrap">
              {result}
            </pre>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-xs font-semibold text-text-heading mb-2">Ping</p>
            <p className="text-[10px] text-text-muted mb-3">
              Test connectivity — returns uptime and request count
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void ping()}
              loading={pingLoading}
              className="w-full"
            >
              Send Ping
            </Button>
            {pingResult && (
              <pre className="text-[10px] font-mono text-text-secondary mt-2 overflow-auto max-h-32 whitespace-pre-wrap">
                {pingResult}
              </pre>
            )}
          </Card>

          <Card>
            <p className="text-xs font-semibold text-text-heading mb-2">Status</p>
            <p className="text-[10px] text-text-muted mb-3">
              Plugin internals — init state, provider, request count
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void status()}
              loading={statusLoading}
              className="w-full"
            >
              Get Status
            </Button>
            {statusResult && (
              <pre className="text-[10px] font-mono text-text-secondary mt-2 overflow-auto max-h-32 whitespace-pre-wrap">
                {statusResult}
              </pre>
            )}
          </Card>
        </div>

        {/* Capabilities */}
        <Card>
          <p className="text-xs font-semibold text-text-heading mb-2">Plugin Capabilities</p>
          <div className="flex flex-wrap gap-1.5">
            {["inference", "echo provider", "tick:after hook", "echo.ping", "echo.status", "echo_message tool"].map(
              (cap) => (
                <Badge key={cap} variant="info" className="!text-[10px]">
                  {cap}
                </Badge>
              ),
            )}
          </div>
        </Card>
      </div>
    </PluginShell>
  );
}

// ─── Layout ───────────────────────────────────────────────────────

const OPS_PLUGINS: StudioPlugin[] = [
  {
    id: "hoc-plugin-paperclip",
    name: "Paperclip",
    icon: "📎",
    description: "AI Company OS — org charts, tickets, heartbeats, cost governance",
    status: "active",
  },
  {
    id: "hoc-plugin-echo",
    name: "Echo",
    icon: "🔊",
    description: "Reference plugin — echo provider, ping, status, tool demo",
    status: "active",
  },
];

function renderOpsPanel(id: string) {
  switch (id) {
    case "hoc-plugin-paperclip":
      return <PaperclipPanel />;
    case "hoc-plugin-echo":
      return <EchoPanel />;
    default:
      return null;
  }
}

export function OpsStudioPage({ defaultPlugin }: { defaultPlugin?: string } = {}) {
  return (
    <PluginStudioLayout
      title="Ops Studio"
      categoryIcon={<Settings size={16} />}
      plugins={OPS_PLUGINS}
      renderPanel={renderOpsPanel}
      defaultPlugin={defaultPlugin}
    />
  );
}
