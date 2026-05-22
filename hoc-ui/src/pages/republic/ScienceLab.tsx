import { useState } from "react";
import { FlaskConical, Brain, Search, BookOpen, Atom, ChevronDown, ChevronUp, RefreshCw, MessageSquare, Zap } from "lucide-react";
import { useRpc, rpc } from "@/lib/rpc";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  Alert,
  RpcStatus,
  Tabs,
  EmptyState,
} from "@/components/ui";

interface ScienceSpec {
  id: string;
  name: string;
  domain: string;
  emoji: string;
  metaLearningKeywords: string[];
  tools: string[];
  arxivCategories: string[];
}

interface MetaLearningEvent {
  id: string;
  specialistId: string;
  source: string;
  title: string;
  summary: string;
  url: string;
  learnedAt: string;
}

const DOMAIN_COLORS: Record<string, string> = {
  physics: "bg-blue-500/10 text-blue-400",
  chemistry: "bg-green-500/10 text-green-400",
  biology: "bg-emerald-500/10 text-emerald-400",
  mathematics: "bg-purple-500/10 text-purple-400",
  "computer-science": "bg-accent/10 text-accent",
  astronomy: "bg-indigo-500/10 text-indigo-400",
  "earth-science": "bg-teal-500/10 text-teal-400",
  neuroscience: "bg-pink-500/10 text-pink-400",
  engineering: "bg-orange-500/10 text-orange-400",
  materials: "bg-yellow-500/10 text-yellow-400",
  quantum: "bg-cyan-500/10 text-cyan-400",
  "ai-ml": "bg-violet-500/10 text-violet-400",
  "social-science": "bg-rose-500/10 text-rose-400",
  economics: "bg-lime-500/10 text-lime-400",
};

export function ScienceLabPage() {
  const [activeTab, setActiveTab] = useState("explore");
  const [selectedSpec, setSelectedSpec] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; provider: string; specialistName: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [metaLearning, setMetaLearning] = useState(false);
  const [metaResults, setMetaResults] = useState<MetaLearningEvent[]>([]);
  const [expandedPaper, setExpandedPaper] = useState<string | null>(null);

  const { data: specData, loading: specLoading, error: specError, refetch } =
    useRpc<{ specializations: ScienceSpec[] }>("republic.science.specializations.list", {}, []);

  const { data: statsData } =
    useRpc<{ totalSpecializations: number; domains: string[]; domainCounts: Record<string, number>; totalPapersLearned: number }>(
      "republic.science.stats", {}, []
    );

  const { data: historyData } =
    useRpc<{ events: MetaLearningEvent[] }>("republic.science.meta-learn.history", { limit: 30 }, [], { staleTimeMs: 10000 });

  const specs = specData?.specializations ?? [];
  const domains = ["all", ...new Set(specs.map((s) => s.domain))];
  const filtered = specs.filter((s) => {
    const matchDomain = domainFilter === "all" || s.domain === domainFilter;
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.metaLearningKeywords.some((k) => k.toLowerCase().includes(search.toLowerCase()));
    return matchDomain && matchSearch;
  });

  const selected = specs.find((s) => s.id === selectedSpec);

  const askScientist = async () => {
    if (!selectedSpec || !question.trim()) { return; }
    setAsking(true);
    setAnswer(null);
    try {
      const result = await rpc<{ answer: string; provider: string; specialistName: string }>(
        "republic.science.ask", { specialistId: selectedSpec, question: question.trim() }
      );
      setAnswer(result);
    } finally {
      setAsking(false);
    }
  };

  const triggerMetaLearn = async () => {
    if (!selectedSpec) { return; }
    setMetaLearning(true);
    setMetaResults([]);
    try {
      const result = await rpc<{ results: MetaLearningEvent[]; count: number }>(
        "republic.science.meta-learn", { specialistId: selectedSpec, maxResults: 8 }
      );
      setMetaResults(result.results ?? []);
    } finally {
      setMetaLearning(false);
    }
  };

  const tabs = [
    { id: "explore", label: "Explore Specialists" },
    { id: "ask", label: "Ask Scientist" },
    { id: "meta-learn", label: "Meta-Learning" },
    { id: "papers", label: "Learned Papers" },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Science Lab"
        description="22 AI science specialists across physics, biology, chemistry, mathematics, quantum computing, AI research, and more"
        icon={<FlaskConical className="w-6 h-6 text-blue-400" />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Specialists" value={statsData?.totalSpecializations ?? 22} icon={<Atom className="w-5 h-5" />} sub="Science domains" />
        <StatCard label="Domains" value={statsData?.domains?.length ?? 14} icon={<BookOpen className="w-5 h-5" />} sub="Fields of science" />
        <StatCard label="Papers Learned" value={statsData?.totalPapersLearned ?? 0} icon={<Brain className="w-5 h-5" />} sub="Via ArXiv meta-learning" />
        <StatCard label="Meta-Learning" value="ArXiv" icon={<Zap className="w-5 h-5" />} sub="Autonomous paper fetch" />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* ─── Explore ─────────────────────────────────────────────── */}
      {activeTab === "explore" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {domains.slice(0, 10).map((d) => (
              <button key={d} onClick={() => setDomainFilter(d)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${domainFilter === d ? "bg-accent text-white" : "bg-bg-secondary text-text-muted hover:bg-bg-card"}`}>
                {d}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input className="w-full bg-bg-input border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              placeholder="Search by name or research area..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <RpcStatus loading={specLoading} error={specError} onRetry={refetch} />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <Card key={s.id} hover
                onClick={() => { setSelectedSpec(s.id); setActiveTab("ask"); }}
                className={`cursor-pointer border-2 transition-colors ${selectedSpec === s.id ? "border-accent" : "border-transparent hover:border-border-hover"}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{s.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-heading font-semibold text-sm truncate">{s.name}</p>
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${DOMAIN_COLORS[s.domain] ?? "bg-bg-secondary text-text-muted"}`}>
                      {s.domain}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.metaLearningKeywords.slice(0, 3).map((k) => (
                    <span key={k} className="text-[10px] bg-bg-secondary text-text-muted px-1.5 py-0.5 rounded truncate max-w-full">{k}</span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Ask ─────────────────────────────────────────────────── */}
      {activeTab === "ask" && (
        <div className="space-y-4 max-w-3xl">
          {!selectedSpec && <Alert variant="warning">Select a specialist from the Explore tab first.</Alert>}

          {selected && (
            <Card className="flex items-center gap-3 py-3">
              <span className="text-3xl">{selected.emoji}</span>
              <div>
                <p className="font-semibold text-text-heading">{selected.name}</p>
                <p className="text-xs text-text-muted">{selected.domain} · {selected.arxivCategories.join(", ")}</p>
              </div>
              <Badge variant="info" className="ml-auto">{selected.tools.length} tools</Badge>
            </Card>
          )}

          <Card>
            <textarea rows={6} value={question} onChange={(e) => setQuestion(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none mb-3"
              placeholder="Ask your scientist anything...&#10;&#10;Examples:&#10;• Explain the quantum entanglement from first principles&#10;• What is the current state of room-temperature superconductors?&#10;• Design an experiment to test dark matter interaction&#10;• What are the latest transformer architectures for code generation?" />
            <Button variant="primary" onClick={() => void askScientist()} disabled={!selectedSpec || !question.trim() || asking}>
              {asking ? <><RefreshCw className="w-4 h-4 animate-spin" /> Consulting Specialist...</> : <><MessageSquare className="w-4 h-4" /> Ask Specialist</>}
            </Button>
          </Card>

          {answer && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{selected?.emoji}</span>
                <span className="font-semibold text-text-heading">{answer.specialistName}</span>
                <Badge variant="neutral">{answer.provider}</Badge>
              </div>
              <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans leading-relaxed">{answer.answer}</pre>
            </Card>
          )}
        </div>
      )}

      {/* ─── Meta-Learning ────────────────────────────────────────── */}
      {activeTab === "meta-learn" && (
        <div className="space-y-4">
          <Alert variant="info">
            <Brain className="w-4 h-4 inline mr-2" />
            Meta-learning fetches the latest ArXiv papers for the selected specialist's research area. Citizens autonomously stay current in their field.
          </Alert>

          {!selectedSpec && <Alert variant="warning">Select a specialist from the Explore tab first.</Alert>}

          {selected && (
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{selected.emoji}</span>
                <div>
                  <p className="font-semibold text-text-heading">{selected.name}</p>
                  <p className="text-xs text-text-muted">ArXiv: {selected.arxivCategories.join(", ")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className="text-xs text-text-muted">Keywords:</span>
                {(selected.metaLearningKeywords ?? []).map((k) => (
                  <Badge key={k} variant="neutral">{k}</Badge>
                ))}
              </div>
              <Button variant="primary" onClick={() => void triggerMetaLearn()} disabled={metaLearning}>
                {metaLearning ? <><RefreshCw className="w-4 h-4 animate-spin" /> Fetching Latest Papers...</> : <><Zap className="w-4 h-4" /> Fetch Latest ArXiv Papers</>}
              </Button>
            </Card>
          )}

          {metaResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text-heading">Fetched {metaResults.length} papers:</p>
              {metaResults.map((r) => (
                <Card key={r.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <a href={r.url} target="_blank" rel="noreferrer"
                      className="text-sm font-medium text-accent hover:underline line-clamp-2">
                      {r.title}
                    </a>
                    <Badge variant="neutral">{r.source}</Badge>
                  </div>
                  <button onClick={() => setExpandedPaper(expandedPaper === r.id ? null : r.id)}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary">
                    Summary {expandedPaper === r.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {expandedPaper === r.id && (
                    <p className="text-xs text-text-secondary leading-relaxed">{r.summary}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Papers History ───────────────────────────────────────── */}
      {activeTab === "papers" && (
        <div className="space-y-3">
          {(historyData?.events ?? []).length === 0 && (
            <EmptyState icon={<BookOpen className="w-8 h-8" />} title="No papers yet"
              description="Trigger meta-learning for a specialist to start collecting papers" />
          )}
          {(historyData?.events ?? []).map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <a href={r.url} target="_blank" rel="noreferrer"
                    className="text-sm font-medium text-accent hover:underline">{r.title}</a>
                  <p className="text-xs text-text-muted mt-0.5">
                    {r.specialistId} · {new Date(r.learnedAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="info">{r.source}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
