import {
  Brain,
  Camera,
  Code2,
  Database,
  Eye,
  Mic,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, StatCard, Button, RpcStatus, Tabs } from "@/components/ui";
import { useRpc } from "@/lib/rpc";
import { FineTunePanel } from "./sovereign-ai/FineTunePanel";
import { InterpreterPanel } from "./sovereign-ai/InterpreterPanel";
import { KnowledgePanel } from "./sovereign-ai/KnowledgePanel";
import { ProactivePanel } from "./sovereign-ai/ProactivePanel";
import { SearchPanel } from "./sovereign-ai/SearchPanel";
import { VisionPanel } from "./sovereign-ai/VisionPanel";
import { VoicePanel } from "./sovereign-ai/VoicePanel";

type EngineStatus = {
  name: string;
  icon: React.ReactNode;
  badge: "success" | "warning" | "danger" | "info" | "neutral";
  status: string;
  stat: string;
  sub?: string;
};

export function SovereignAIPage() {
  const {
    data: visionDiag,
    loading: vL,
    error: vE,
    refetch: vR,
  } = useRpc<Record<string, unknown>>("republic.sovereign.vision.diagnostics", {}, [], {
    staleTimeMs: 10_000,
  });
  const {
    data: knowledgeDiag,
    loading: kL,
    error: kE,
    refetch: kR,
  } = useRpc<Record<string, unknown>>("republic.sovereign.knowledge.diagnostics", {}, [], {
    staleTimeMs: 10_000,
  });
  const {
    data: proactiveDiag,
    loading: pL,
    error: pE,
    refetch: pR,
  } = useRpc<Record<string, unknown>>("republic.sovereign.proactive.diagnostics", {}, [], {
    staleTimeMs: 10_000,
  });
  const {
    data: ftDiag,
    loading: fL,
    error: fE,
    refetch: fR,
  } = useRpc<Record<string, unknown>>("republic.sovereign.finetune.diagnostics", {}, [], {
    staleTimeMs: 10_000,
  });
  const {
    data: voiceDiag,
    loading: voL,
    error: voE,
    refetch: voR,
  } = useRpc<Record<string, unknown>>("republic.sovereign.voice.providers", {}, [], {
    staleTimeMs: 10_000,
  });
  const {
    data: searchDiag,
    loading: sL,
    error: sE,
    refetch: sR,
  } = useRpc<Record<string, unknown>>("republic.sovereign.search.diagnostics", {}, [], {
    staleTimeMs: 10_000,
  });
  const {
    data: interpDiag,
    loading: iL,
    error: iE,
    refetch: iR,
  } = useRpc<Record<string, unknown>>("republic.sovereign.interpreter.diagnostics", {}, [], {
    staleTimeMs: 10_000,
  });

  const [activeTab, setActiveTab] = useState("overview");

  const anyLoading = vL || kL || pL || fL || voL || sL || iL;
  const anyError = vE || kE || pE || fE || voE || sE || iE;
  const refetchAll = () => {
    vR();
    kR();
    pR();
    fR();
    voR();
    sR();
    iR();
  };

  if (anyLoading && !visionDiag && !knowledgeDiag) {
    return <RpcStatus loading={true} error={anyError} onRetry={refetchAll} />;
  }

  const d = (obj: unknown, key: string) => (obj as Record<string, unknown>)?.[key];

  const engines: EngineStatus[] = [
    {
      name: "Vision Engine",
      icon: <Eye size={20} />,
      badge: visionDiag ? "success" : "neutral",
      status: visionDiag ? "Operational" : "Loading",
      stat: `${d(visionDiag, "totalRequests") ?? 0} analyses`,
      sub: `Providers: ${d(visionDiag, "availableProviders") ?? "—"}`,
    },
    {
      name: "Code Interpreter",
      icon: <Code2 size={20} />,
      badge: interpDiag ? "success" : "neutral",
      status: interpDiag ? "Operational" : "Loading",
      stat: `${d(interpDiag, "totalExecutions") ?? 0} executions`,
      sub: "Python/JS sandbox",
    },
    {
      name: "Search + RAG",
      icon: <Search size={20} />,
      badge: searchDiag ? "success" : "neutral",
      status: searchDiag ? "Operational" : "Loading",
      stat: `${d(searchDiag, "totalQueries") ?? 0} queries`,
      sub: `Cache hit: ${d(searchDiag, "cacheHitRate") ?? "—"}%`,
    },
    {
      name: "Voice Engine",
      icon: <Mic size={20} />,
      badge: voiceDiag ? "success" : "neutral",
      status: voiceDiag ? "Operational" : "Loading",
      stat: `STT: ${(d(voiceDiag, "stt") as string[])?.length ?? 0} providers`,
      sub: `TTS: ${(d(voiceDiag, "tts") as string[])?.length ?? 0} providers`,
    },
    {
      name: "Knowledge Base",
      icon: <Database size={20} />,
      badge: knowledgeDiag ? "success" : "neutral",
      status: knowledgeDiag ? "Operational" : "Loading",
      stat: `${d(knowledgeDiag, "totalEntries") ?? 0} entries`,
      sub: `Retrievals: ${d(knowledgeDiag, "totalRetrievals") ?? 0}`,
    },
    {
      name: "Proactive Engine",
      icon: <Zap size={20} />,
      badge: proactiveDiag ? "success" : "neutral",
      status: proactiveDiag ? "Operational" : "Loading",
      stat: `${d(proactiveDiag, "totalTriggers") ?? 0} triggers`,
      sub: `Fires: ${d(proactiveDiag, "totalFires") ?? 0}`,
    },
    {
      name: "Fine-Tune Pipeline",
      icon: <SlidersHorizontal size={20} />,
      badge: ftDiag ? "success" : "neutral",
      status: ftDiag ? "Operational" : "Loading",
      stat: `${d(ftDiag, "totalJobs") ?? 0} jobs`,
      sub: `Active: ${d(ftDiag, "activeJobs") ?? 0}`,
    },
    {
      name: "PWA Runtime",
      icon: <Sparkles size={20} />,
      badge: "navigator" in globalThis && "serviceWorker" in navigator ? "success" : "warning",
      status: "navigator" in globalThis && "serviceWorker" in navigator ? "Installed" : "Partial",
      stat: "Offline-capable",
      sub: "Cache-first static, network-first API",
    },
  ];

  const operational = engines.filter((e) => e.badge === "success").length;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "vision", label: "Vision" },
    { id: "voice", label: "Voice" },
    { id: "search", label: "Search" },
    { id: "interpreter", label: "Interpreter" },
    { id: "knowledge", label: "Knowledge" },
    { id: "finetune", label: "Fine-Tune" },
    { id: "proactive", label: "Proactive" },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Sovereign AI"
        description="Self-sufficient capability engines — vision, voice, search, code, knowledge, and training"
        icon={<Brain size={28} />}
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={refetchAll}>
            Refresh All
          </Button>
        }
      />

      {/* Sovereignty Score */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Engines Online" value={`${operational}/8`} icon={<Sparkles size={16} />} />
        <StatCard
          label="Total Analyses"
          value={String(d(visionDiag, "totalRequests") ?? 0)}
          icon={<Camera size={16} />}
        />
        <StatCard
          label="Knowledge Entries"
          value={String(d(knowledgeDiag, "totalEntries") ?? 0)}
          icon={<Database size={16} />}
        />
        <StatCard
          label="Training Jobs"
          value={String(d(ftDiag, "totalJobs") ?? 0)}
          icon={<Settings2 size={16} />}
        />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {engines.map((engine) => (
            <Card key={engine.name} hover className="relative overflow-hidden">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-accent/10 text-accent">{engine.icon}</div>
                <Badge variant={engine.badge}>{engine.status}</Badge>
              </div>
              <h3 className="font-semibold text-text-heading text-sm mb-1">{engine.name}</h3>
              <p className="text-xs text-text-secondary mb-1">{engine.stat}</p>
              {engine.sub && <p className="text-xs text-text-muted">{engine.sub}</p>}
              {engine.badge === "success" && (
                <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full bg-success/5 blur-xl" />
              )}
            </Card>
          ))}
        </div>
      )}

      {activeTab === "vision" && <VisionPanel />}
      {activeTab === "voice" && <VoicePanel />}
      {activeTab === "search" && <SearchPanel />}
      {activeTab === "interpreter" && <InterpreterPanel />}
      {activeTab === "knowledge" && <KnowledgePanel />}
      {activeTab === "finetune" && <FineTunePanel />}
      {activeTab === "proactive" && <ProactivePanel />}
    </div>
  );
}
