/**
 * GenericPluginPanel — Auto-generated interactive UI for any HoC plugin.
 *
 * Reads the plugin manifest (gateway methods + tools) and renders
 * form-based invocation panels for each, plus an inline chat widget.
 */

import {
  Terminal,
  Wrench,
  Send,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Card, Badge, Button, Alert } from "@/components/ui";
import { rpc } from "@/lib/rpc";

interface PluginManifestCapabilities {
  gateway?: string[];
  tools?: string[];
  inference?: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  sourceRepo?: string;
  status?: string;
  capabilities?: PluginManifestCapabilities | string[];
}

interface InvokeResult {
  ok?: boolean;
  result?: unknown;
  error?: string;
}

// ─── Collapsible Section ─────────────────────────────────────────

function Section({
  title,
  icon,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string | number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <button
type="button"         onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary hover:bg-bg-card/60 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-text-heading">
          <span className="text-accent">{icon}</span>
          {title}
          {badge !== undefined && (
            <Badge variant="info" className="!text-[10px]">
              {badge}
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronDown size={14} className="text-text-muted" />
        ) : (
          <ChevronRight size={14} className="text-text-muted" />
        )}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Invoke Form ─────────────────────────────────────────────────

function InvokeForm({
  label,
  paramNames,
  onInvoke,
  buttonLabel = "Run",
  variant = "primary",
}: {
  label: string;
  paramNames: string[];
  onInvoke: (params: Record<string, string>) => Promise<InvokeResult>;
  buttonLabel?: string;
  variant?: "primary" | "outline";
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InvokeResult | null>(null);

  async function handleRun() {
    setLoading(true);
    setResult(null);
    try {
      const res = await onInvoke(values);
      setResult(res);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-bg-secondary rounded-xl p-3 space-y-3">
      <p className="text-xs font-mono text-accent">{label}</p>
      {paramNames.map((name) => (
        <div key={name} className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">
            {name}
          </label>
          <input
            type="text"
            value={values[name] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
            placeholder={`Enter ${name}...`}
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent transition-colors"
          />
        </div>
      ))}
      <Button size="sm" variant={variant} loading={loading} onClick={handleRun}>
        {loading ? "Running..." : buttonLabel}
      </Button>

      {result && (
        <div
          className={`mt-2 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-48 ${result.ok === false ? "bg-danger-bg text-danger border border-danger/30" : "bg-bg-input text-text-secondary border border-border/40"}`}
        >
          {result.error ? (
            <span className="flex items-start gap-1">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              {result.error}
            </span>
          ) : (
            JSON.stringify(result.result ?? result, null, 2)
          )}
        </div>
      )}
    </div>
  );
}

// ─── Chat Widget ─────────────────────────────────────────────────

function PluginChat({ plugin }: { plugin: PluginManifest }) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) {
      return;
    }
    setDraft("");
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    try {
      // Route through the plugin's own gateway — try sendMessage,
      // then inference.chat, then generic chat fallback
      const methods = [
        `${plugin.id}.sendMessage`,
        `${plugin.id}.chat`,
        `${plugin.id}.inference.chat`,
      ];
      let reply: string | null = null;
      for (const method of methods) {
        try {
          const res = (await rpc("republic.plugins.call-gateway", {
            method,
            params: { message: text, prompt: text },
          })) as { ok?: boolean; result?: Record<string, unknown>; error?: string } | null;
          if (res?.ok && res.result) {
            const r = res.result;
            reply =
              (r.content as string) ||
              (r.text as string) ||
              (r.response as string) ||
              (r.message as string) ||
              JSON.stringify(r);
            break;
          }
        } catch {
          // Method not registered — try next
        }
      }

      // Fallback: use chat.send with proper params if plugin methods not available
      if (!reply) {
        try {
          const sessionKey = `plugin-${plugin.id}`;
          const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const res = (await rpc("chat.send", {
            sessionKey,
            message: `[Plugin: ${plugin.id}] ${text}`,
            idempotencyKey,
          })) as { runId?: string; status?: string } | null;
          reply = res?.status === "started"
            ? "Message sent — check the Chat page for the response."
            : `Acknowledged (${res?.status ?? "ok"})`;
        } catch (chatErr) {
          reply = `Plugin does not have a chat interface. Use the Gateway Methods or Agent Tools above to interact with it directly. (${chatErr instanceof Error ? chatErr.message : String(chatErr)})`;
        }
      }

      setMessages((m) => [...m, { role: "ai", text: reply ?? "No response received." }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "ai", text: `Error: ${e instanceof Error ? e.message : String(e)}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="flex flex-col border border-border/50 rounded-xl overflow-hidden"
      style={{ height: 320 }}
    >
      <div className="px-3 py-2 bg-bg-secondary border-b border-border/30 flex items-center gap-2">
        <MessageSquare size={13} className="text-accent" />
        <span className="text-xs font-semibold text-text-heading">Plugin Chat</span>
        <span className="text-[10px] text-text-muted ml-auto">
          Ask the AI to use this plugin for you
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4 opacity-50">
            e.g. "Generate a world video from /tmp/scene.jpg showing a sunrise"
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-accent text-white rounded-br-sm"
                  : "bg-bg-secondary text-text-secondary border border-border/30 rounded-bl-sm"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl bg-bg-secondary border border-border/30">
              <Loader2 size={12} className="animate-spin text-text-muted" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/30 p-2 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={`Use ${plugin.name}...`}
          className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent transition-colors"
        />
        <Button
          size="sm"
          onClick={() => void send()}
          disabled={!draft.trim() || sending}
          icon={<Send size={12} />}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export function GenericPluginPanel({ plugin }: { plugin: PluginManifest }) {
  const caps = plugin.capabilities;
  const gatewayMethods: string[] = Array.isArray(caps)
    ? []
    : ((caps as PluginManifestCapabilities)?.gateway ?? []);
  const tools: string[] = Array.isArray(caps)
    ? []
    : ((caps as PluginManifestCapabilities)?.tools ?? []);

  function parseParams(method: string): string[] {
    // Try to infer common param names from method name
    const lower = method.toLowerCase();
    if (lower.includes("generate") || lower.includes("create") || lower.includes("run")) {
      return ["prompt", "imagePath"];
    }
    if (lower.includes("status") || lower.includes("job")) {
      return ["jobId"];
    }
    if (lower.includes("cancel")) {
      return ["jobId"];
    }
    if (lower.includes("config") || lower.includes("list") || lower.includes("queue")) {
      return [];
    }
    return [];
  }

  async function callGateway(
    method: string,
    params: Record<string, string>,
  ): Promise<InvokeResult> {
    try {
      const result = await rpc("republic.plugins.call-gateway", { method, params });
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function callTool(toolName: string, params: Record<string, string>): Promise<InvokeResult> {
    try {
      const result = await rpc("republic.plugins.invoke-tool", { toolName, params });
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return (
    <div className="space-y-4">
      {/* Plugin Info */}
      <Card>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-lg font-bold text-text-heading">{plugin.name}</h2>
            <p className="text-xs text-text-muted mt-0.5">v{plugin.version ?? "1.0.0"}</p>
          </div>
          <Badge
            variant={
              plugin.status === "active" || plugin.status === "ready" ? "success" : "neutral"
            }
          >
            {plugin.status ?? "unknown"}
          </Badge>
        </div>
        {plugin.description && (
          <p className="text-sm text-text-secondary leading-relaxed">{plugin.description}</p>
        )}
        {plugin.sourceRepo && (
          <a
            href={plugin.sourceRepo}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <ExternalLink size={11} /> Source Repository
          </a>
        )}

        {Array.isArray(caps) && caps.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {caps.map((c) => (
              <Badge key={c} variant="info" className="!text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Gateway Methods */}
      {gatewayMethods.length > 0 && (
        <Section
          title="Gateway Methods"
          icon={<Terminal size={14} />}
          badge={gatewayMethods.length}
        >
          <Alert variant="info">
            These methods are callable directly via RPC. Fill in any parameters and click Run.
          </Alert>
          {gatewayMethods.map((method) => (
            <InvokeForm
              key={method}
              label={method}
              paramNames={parseParams(method)}
              onInvoke={(params) => callGateway(method, params)}
              buttonLabel="▶ Run"
            />
          ))}
        </Section>
      )}

      {/* Tools */}
      {tools.length > 0 && (
        <Section
          title="Agent Tools"
          icon={<Wrench size={14} />}
          badge={tools.length}
          defaultOpen={false}
        >
          <Alert variant="info">
            These tools are available to citizens and agents for autonomous use.
          </Alert>
          {tools.map((tool) => (
            <InvokeForm
              key={tool}
              label={tool}
              paramNames={parseParams(tool)}
              onInvoke={(params) => callTool(tool, params)}
              variant="outline"
              buttonLabel="▶ Invoke"
            />
          ))}
        </Section>
      )}

      {/* No capabilities */}
      {gatewayMethods.length === 0 && tools.length === 0 && (
        <Card>
          <div className="flex items-center gap-2 text-text-muted text-sm py-2">
            <CheckCircle size={16} className="text-success" />
            This plugin provides background capabilities (hooks, events, inference). No direct
            invocations are needed — it runs automatically when enabled.
          </div>
        </Card>
      )}

      {/* Chat Widget */}
      <Section
        title="Ask AI to Use This Plugin"
        icon={<MessageSquare size={14} />}
        defaultOpen={false}
      >
        <PluginChat plugin={plugin} />
      </Section>
    </div>
  );
}
