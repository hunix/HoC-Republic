import { Bot, Send } from "lucide-react";
/**
 * AgentStudio — Full-featured panels for:
 *   A2A, AutoGPT, MagenticOne, OpenManus-RL, AI-Scientist
 */
import { useState, useRef, useEffect } from "react";
import { Card, Button, Alert } from "@/components/ui";
import { rpc } from "@/lib/rpc";
import { PluginShell, type PluginUsageEntry } from "./PluginShell";
import { PluginStudioLayout, type StudioPlugin } from "./PluginStudioLayout";

// ── A2A Protocol Bridge ──
const A2A_MODELS = [
  {
    id: "a2a-runtime",
    name: "A2A Runtime",
    sizeGb: 0.0,
    description: "No model required — protocol bridge",
    downloaded: true,
    required: true,
  },
];
const A2A_METHODS = [
  "sendMessage",
  "listAgents",
  "discoverCapabilities",
  "registerAgent",
  "negotiateProtocol",
  "broadcastEvent",
  "requestTask",
  "queryKnowledge",
];

function A2APanel() {
  const [endpoint, setEndpoint] = useState("");
  const [method, setMethod] = useState("sendMessage");
  const [payload, setPayload] = useState(
    '{\n  "message": "Hello from HoC Republic!",\n  "agent_id": "republic-gateway",\n  "capabilities": ["reasoning", "coding", "research"]\n}',
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function invoke() {
    if (!endpoint || !method) {
      return;
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      setError("Invalid JSON payload");
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "a2a.send-task",
        params: {
          targetUrl: endpoint,
          message: method + (payload ? " " + payload : ""),
          payload: parsed,
        },
      })) as { result?: unknown };
      setResult(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: `a2a.send-task`, durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: `a2a.send-task`, durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-a2a"
      displayName="A2A Protocol Bridge"
      description="Connect to any A2A (Agent-to-Agent) compatible endpoint. Send messages, discover capabilities, register agents, broadcast events, negotiate protocols. Works with Google A2A, Anthropic, and custom implementations."
      models={A2A_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="info">
          A2A (Agent-to-Agent) is an open protocol for inter-agent communication. Connect to any
          A2A-compliant endpoint.
        </Alert>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-1">
            Agent Endpoint URL
          </label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://agent.example.com/a2a"
            className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </Card>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Method</label>
          <div className="flex flex-wrap gap-1">
            {A2A_METHODS.map((m) => (
              <button
type="button"                 key={m}
                onClick={() => setMethod(m)}
                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${method === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {m}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">JSON Payload</label>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={6}
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-xs font-mono text-text-primary outline-none focus:border-accent resize-none"
          />
        </Card>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void invoke()}
          loading={loading}
          icon={<Send size={14} />}
          className="w-full"
          disabled={!endpoint || !method}
        >
          Send A2A Request
        </Button>
        {result && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Response</p>
            <pre className="text-xs text-text-secondary font-mono overflow-auto max-h-64">
              {result}
            </pre>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── AutoGPT ──
const AUTOGPT_MODELS = [
  {
    id: "autogpt-runtime",
    name: "AutoGPT Runtime",
    sizeGb: 0.5,
    description: "AutoGPT agent framework + tools",
    downloaded: false,
    required: true,
  },
];

function AutoGPTPanel() {
  const [goal, setGoal] = useState("");
  const [maxIter, setMaxIter] = useState(10);
  const [model, setModel] = useState("gpt-4o");
  const [tools, setTools] = useState<string[]>(["web-search", "code-execution", "file-system"]);
  const [continuous, setContinuous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  const AVAILABLE_TOOLS = [
    "web-search",
    "code-execution",
    "file-system",
    "email",
    "github",
    "database",
    "api-call",
    "browser",
    "memory",
    "planning",
  ];
  function toggleTool(t: string) {
    setTools((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  }

  async function run() {
    if (!goal.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setLogs([`[boot] Starting AutoGPT agent...`, `[goal] ${goal}`]);
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "autogpt.run-agent",
        params: {
          goal,
          agentId: "default",
          agentName: "AutoGPT",
          max_iterations: maxIter,
          model,
          enabled_tools: tools,
          continuous_mode: continuous,
          input: { goal, max_iterations: maxIter },
        },
      })) as { result?: { log?: string[]; finalOutput?: string } };
      if (r?.result?.log) {
        setLogs(r.result.log);
      }
      if (r?.result?.finalOutput) {
        setLogs((l) => [...l, `[done] ${r.result!.finalOutput}`]);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "autogpt.run-agent", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "autogpt.run-agent",
          durationMs: Date.now() - t0,
          success: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-autogpt"
      displayName="AutoGPT"
      description="Autonomous goal-driven AI agent. Provide a high-level goal and AutoGPT plans, executes, and iterates autonomously using web search, code execution, file system, email, and more."
      models={AUTOGPT_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Goal / Task</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            placeholder="Research the top 5 AI startups in 2025, analyze their funding and technology, and write a comprehensive report as a markdown file..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Model</label>
            {["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus", "gemini-pro"].map((m) => (
              <button
type="button"                 key={m}
                onClick={() => setModel(m)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs font-mono text-left transition-colors ${model === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {m}
              </button>
            ))}
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Max Iterations
            </label>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>Iterations</span>
              <span className="font-mono">{maxIter}</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={maxIter}
              onChange={(e) => setMaxIter(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <label className="flex items-center gap-2 cursor-pointer mt-3">
              <input
                type="checkbox"
                checked={continuous}
                onChange={(e) => setContinuous(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-xs text-text-secondary">Continuous mode</span>
            </label>
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Tools</label>
            <div className="flex flex-col gap-1">
              {AVAILABLE_TOOLS.map((t) => {
                const on = tools.includes(t);
                return (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleTool(t)}
                      className="w-3 h-3 accent-accent"
                    />
                    <span className="text-xs text-text-secondary">{t}</span>
                  </label>
                );
              })}
            </div>
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Bot size={14} />}
          className="w-full"
          disabled={!goal.trim()}
        >
          Start Agent
        </Button>
        {logs.length > 0 && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Agent Log</p>
            <div
              ref={logRef}
              className="bg-bg-input rounded-xl p-3 max-h-64 overflow-y-auto space-y-1"
            >
              {logs.map((l, i) => (
                <p
                  key={i}
                  className={`text-xs font-mono ${l.startsWith("[done]") ? "text-success" : l.startsWith("[error]") ? "text-danger" : "text-text-secondary"}`}
                >
                  {l}
                </p>
              ))}
            </div>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── MagenticOne ──
const MAGENTIC_MODELS = [
  {
    id: "magentic-runtime",
    name: "MagenticOne Runtime",
    sizeGb: 0.3,
    description: "Multi-agent orchestration framework",
    downloaded: false,
    required: true,
  },
];
const MAGENTIC_SUB_AGENTS = [
  "Orchestrator",
  "WebSurfer",
  "FileSurfer",
  "Coder",
  "ComputerTerminal",
  "Planner",
  "Critic",
  "Researcher",
];

function MagenticOnePanel() {
  const [task, setTask] = useState("");
  const [subAgents, setSubAgents] = useState<string[]>(["Orchestrator", "WebSurfer", "Coder"]);
  const [maxRounds, setMaxRounds] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  function toggleAgent(a: string) {
    setSubAgents((as) => (as.includes(a) ? as.filter((x) => x !== a) : [...as, a]));
  }

  async function run() {
    if (!task.trim() || subAgents.length === 0) {
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    setLogs([`[magentic] Task: ${task}`, `[magentic] Agents: ${subAgents.join(", ")}`]);
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "magentic.run-task",
        params: { task, sub_agents: subAgents, max_rounds: maxRounds },
      })) as { result?: { output?: string; log?: string[] } };
      if (r?.result?.log) {
        setLogs(r.result.log);
      }
      if (r?.result?.output) {
        setResult(r.result.output);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "magentic.run-task", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "magentic.run-task", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-magentic-one"
      displayName="MagenticOne"
      description="Microsoft multi-agent orchestrator. Combine specialized sub-agents (WebSurfer, Coder, FileSurfer, Orchestrator, Planner, Critic) to tackle complex multi-step tasks."
      models={MAGENTIC_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Task</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            placeholder="Browse the latest papers on arxiv for LLM reasoning improvements, summarize the top 3, and create a comparison table..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Sub-Agents</label>
            <div className="space-y-1">
              {MAGENTIC_SUB_AGENTS.map((a) => {
                const on = subAgents.includes(a);
                return (
                  <label key={a} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleAgent(a)}
                      className="w-3 h-3 accent-accent"
                    />
                    <span className="text-xs text-text-secondary">{a}</span>
                  </label>
                );
              })}
            </div>
          </Card>
          <Card>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span className="font-semibold">Max Rounds</span>
              <span className="font-mono">{maxRounds}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={maxRounds}
              onChange={(e) => setMaxRounds(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Bot size={14} />}
          className="w-full"
          disabled={!task.trim()}
        >
          Run Multi-Agent
        </Button>
        {logs.length > 0 && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Agent Log</p>
            <div className="bg-bg-input rounded-xl p-3 max-h-48 overflow-y-auto space-y-0.5">
              {logs.map((l, i) => (
                <p key={i} className="text-xs font-mono text-text-secondary">
                  {l}
                </p>
              ))}
            </div>
          </Card>
        )}
        {result && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Result</p>
            <pre className="text-sm text-text-secondary overflow-auto max-h-64 whitespace-pre-wrap">
              {result}
            </pre>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── OpenManus-RL ──
const MANUS_RL_MODELS = [
  {
    id: "openmanus-rl-7b",
    name: "OpenManus-RL 7B",
    sizeGb: 14.0,
    description: "RL-trained agentic model",
    downloaded: false,
    required: true,
  },
];

function OpenManusRLPanel() {
  const [task, setTask] = useState("");
  const [rewardSignal, setRewardSignal] = useState("task-completion");
  const [maxEpisodes, setMaxEpisodes] = useState(5);
  const [temperature, setTemperature] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  const REWARDS = [
    "task-completion",
    "efficiency",
    "accuracy",
    "user-satisfaction",
    "multi-objective",
  ];

  async function run() {
    if (!task.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "openmanus.train",
        params: { task, reward_signal: rewardSignal, max_episodes: maxEpisodes, temperature },
      })) as { result?: { output?: string; reward?: number } };
      if (r?.result) {
        setResult(`Reward: ${r.result.reward ?? "N/A"}\n\n${r.result.output ?? ""}`);
      }
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "openmanus.train", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "openmanus.train", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-openmanus-rl"
      displayName="OpenManus-RL"
      description="RL-enhanced general agent. Uses reinforcement learning signal to optimize task completion strategy across multiple episodes. Configurable reward functions."
      models={MANUS_RL_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Task / Instruction
          </label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={4}
            placeholder="Analyze the codebase in /src and identify all performance bottlenecks, then propose optimized solutions with benchmarks..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Reward Signal
            </label>
            {REWARDS.map((r) => (
              <button
type="button"                 key={r}
                onClick={() => setRewardSignal(r)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${rewardSignal === r ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {r}
              </button>
            ))}
          </Card>
          <Card>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span className="font-semibold">Max Episodes</span>
              <span className="font-mono">{maxEpisodes}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={maxEpisodes}
              onChange={(e) => setMaxEpisodes(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </Card>
          <Card>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span className="font-semibold">Temperature</span>
              <span className="font-mono">{temperature}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={2.0}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </Card>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Bot size={14} />}
          className="w-full"
          disabled={!task.trim()}
        >
          Run RL Agent
        </Button>
        {result && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Result</p>
            <pre className="text-sm text-text-secondary overflow-auto max-h-64 whitespace-pre-wrap">
              {result}
            </pre>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── AI-Scientist ──
const AISCIENTIST_MODELS = [
  {
    id: "aiscientist-runtime",
    name: "AI-Scientist Runtime",
    sizeGb: 1.0,
    description: "Autonomous research pipeline",
    downloaded: false,
    required: true,
  },
];
const RESEARCH_DOMAINS = [
  "machine-learning",
  "computer-vision",
  "NLP",
  "robotics",
  "bioinformatics",
  "physics",
  "materials-science",
  "drug-discovery",
  "economics",
  "climate-science",
];
const OUTPUT_FORMATS = [
  "pdf-paper",
  "markdown-report",
  "latex",
  "jupyter-notebook",
  "research-brief",
];

function AIScientistPanel() {
  const [researchQuestion, setResearchQuestion] = useState("");
  const [domain, setDomain] = useState("machine-learning");
  const [maxIterations, setMaxIterations] = useState(3);
  const [outputFormat, setOutputFormat] = useState("pdf-paper");
  const [codebaseContext, setCodebaseContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [outputPath, setOutputPath] = useState("");
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function run() {
    if (!researchQuestion.trim()) {
      return;
    }
    setLoading(true);
    setError("");
    setOutputPath("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "scientist.research",
        params: {
          question: researchQuestion,
          domain,
          max_iterations: maxIterations,
          output_format: outputFormat,
          codebase_context: codebaseContext || undefined,
        },
      })) as { result?: { outputPath?: string } };
      if (r?.result?.outputPath) {
        setOutputPath(`/republic-output/${r.result.outputPath}`);
      }
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "scientist.research",
          durationMs: Date.now() - t0,
          success: true,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "scientist.research",
          durationMs: Date.now() - t0,
          success: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-ai-scientist"
      displayName="AI-Scientist"
      description="Fully autonomous AI research agent (Sakana AI). Generates research ideas, implements experiments, analyzes results, and writes a full scientific paper — start to finish."
      models={AISCIENTIST_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Research Question
          </label>
          <textarea
            value={researchQuestion}
            onChange={(e) => setResearchQuestion(e.target.value)}
            rows={3}
            placeholder="How does the choice of activation function affect convergence speed in transformer models for small-scale NLP tasks?"
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Research Domain
            </label>
            <div className="flex flex-wrap gap-1">
              {RESEARCH_DOMAINS.map((d) => (
                <button
type="button"                   key={d}
                  onClick={() => setDomain(d)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${domain === d ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Output Format
            </label>
            {OUTPUT_FORMATS.map((f) => (
              <button
type="button"                 key={f}
                onClick={() => setOutputFormat(f)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${outputFormat === f ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {f}
              </button>
            ))}
          </Card>
        </div>
        <Card>
          <div className="flex justify-between text-xs text-text-muted mb-1">
            <span className="font-semibold">Max Iterations (ideation → experiment → write)</span>
            <span className="font-mono">{maxIterations}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={maxIterations}
            onChange={(e) => setMaxIterations(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </Card>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Codebase Context (optional)
          </label>
          <textarea
            value={codebaseContext}
            onChange={(e) => setCodebaseContext(e.target.value)}
            rows={3}
            placeholder="Describe your existing codebase or paste key code sections for the AI scientist to build upon..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-xs font-mono text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Bot size={14} />}
          className="w-full"
          disabled={!researchQuestion.trim()}
        >
          Start Research Cycle
        </Button>
        {outputPath && (
          <Card>
            <p className="text-xs font-semibold text-text-muted mb-2">Research Output</p>
            <a
              href={outputPath}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-accent hover:underline"
            >
              ↗ View {outputFormat}
            </a>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── AgentHub ──
const AGENTHUB_MODELS = [
  {
    id: "agenthub-runtime",
    name: "AgentHub Runtime",
    sizeGb: 0.0,
    description: "Git DAG + SQLite — no model download needed",
    downloaded: true,
    required: true,
  },
];

function AgentHubPanel() {
  const [code, setCode] = useState("");
  const [programMd, setProgramMd] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [boardPosts, setBoardPosts] = useState<string>("");
  const [boardLoading, setBoardLoading] = useState(false);
  const [postBody, setPostBody] = useState("");
  const [postLoading, setPostLoading] = useState(false);
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function submitExp() {
    if (!code.trim() || !programMd.trim()) { return; }
    setLoading(true);
    setError("");
    setResult("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "agenthub.submit-experiment",
        params: { code, programMd, message: commitMsg || undefined },
      })) as { result?: { hash?: string } };
      setResult(`Committed: ${r?.result?.hash ?? "OK"}`);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "agenthub.submit-experiment", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "agenthub.submit-experiment", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchBoard() {
    setBoardLoading(true);
    setBoardPosts("");
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "agenthub.read-board",
        params: { limit: 20 },
      })) as { result?: unknown };
      setBoardPosts(JSON.stringify(r?.result, null, 2));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "agenthub.read-board", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setBoardPosts(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "agenthub.read-board", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setBoardLoading(false);
    }
  }

  async function post() {
    if (!postBody.trim()) { return; }
    setPostLoading(true);
    const t0 = Date.now();
    try {
      await rpc("republic.plugins.call-gateway", {
        method: "agenthub.post-to-board",
        params: { body: postBody },
      });
      setPostBody("");
      void fetchBoard();
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "agenthub.post-to-board", durationMs: Date.now() - t0, success: true },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsageLog((l) => [
        ...l,
        { ts: Date.now(), method: "agenthub.post-to-board", durationMs: Date.now() - t0, success: false },
      ]);
    } finally {
      setPostLoading(false);
    }
  }

  return (
    <PluginShell
      pluginId="hoc-plugin-agenthub"
      displayName="AgentHub"
      description="GitHub for AI agents — multi-agent code collaboration via bare-git DAG commits and a message board. Submit experiments, coordinate through threaded discussion, run autonomous research loops."
      models={AGENTHUB_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        {/* Submit Experiment */}
        <Card>
          <h3 className="text-xs font-bold text-text-heading mb-3">Submit Experiment</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1 uppercase tracking-wide">
                Program / Instructions (Markdown)
              </label>
              <textarea
                value={programMd}
                onChange={(e) => setProgramMd(e.target.value)}
                rows={3}
                placeholder="Describe the experiment goal and methodology..."
                className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1 uppercase tracking-wide">
                Python Code
              </label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={6}
                placeholder="import torch\n\ndef experiment():\n    ..."
                className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-xs font-mono text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1 uppercase tracking-wide">
                Commit Message (optional)
              </label>
              <input
                type="text"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Short description of this experiment"
                className="w-full bg-bg-input border border-border rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>
        </Card>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void submitExp()}
          loading={loading}
          icon={<Send size={14} />}
          className="w-full"
          disabled={!code.trim() || !programMd.trim()}
        >
          Submit to DAG
        </Button>
        {result && (
          <Card>
            <p className="text-xs font-semibold text-success">{result}</p>
          </Card>
        )}

        {/* Message Board */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-text-heading">Message Board</h3>
            <Button size="sm" variant="outline" onClick={() => void fetchBoard()} loading={boardLoading}>
              Refresh
            </Button>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
              placeholder="Post an observation, hypothesis, or result..."
              className="flex-1 bg-bg-input border border-border rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter") { void post(); }
              }}
            />
            <Button size="sm" onClick={() => void post()} loading={postLoading} disabled={!postBody.trim()}>
              Post
            </Button>
          </div>
          {boardPosts && (
            <pre className="text-xs text-text-secondary font-mono overflow-auto max-h-64 bg-bg-input rounded-xl p-3 whitespace-pre-wrap">
              {boardPosts}
            </pre>
          )}
        </Card>
      </div>
    </PluginShell>
  );
}

// ─── Layout ───────────────────────────────────────────────────────

const AGENT_PLUGINS: StudioPlugin[] = [
  {
    id: "hoc-plugin-a2a",
    name: "A2A",
    icon: "🔌",
    description: "Agent-to-Agent protocol bridge — connect, discover, register, broadcast",
    status: "active",
  },
  {
    id: "hoc-plugin-autogpt",
    name: "AutoGPT",
    icon: "🤖",
    description: "Autonomous goal agent — 10 tools, continuous mode, agent log",
    status: "active",
  },
  {
    id: "hoc-plugin-magentic-one",
    name: "MagenticOne",
    icon: "🧲",
    description: "Multi-agent orchestrator — WebSurfer, Coder, FileSurfer, Planner, Critic",
    status: "active",
  },
  {
    id: "hoc-plugin-openmanus-rl",
    name: "OpenManus-RL",
    icon: "🎯",
    description: "RL-enhanced agent — reward signal config, multi-episode optimization",
    status: "active",
  },
  {
    id: "hoc-plugin-ai-scientist",
    name: "AI-Scientist",
    icon: "🔬",
    description: "Autonomous research: ideate → experiment → write scientific paper",
    status: "active",
  },
  {
    id: "hoc-plugin-agenthub",
    name: "AgentHub",
    icon: "🧪",
    description: "GitHub for AI agents — bare-git DAG, message board, auto-research",
    status: "active",
  },
];

function renderAgentPanel(id: string) {
  switch (id) {
    case "hoc-plugin-a2a":
      return <A2APanel />;
    case "hoc-plugin-autogpt":
      return <AutoGPTPanel />;
    case "hoc-plugin-magentic-one":
      return <MagenticOnePanel />;
    case "hoc-plugin-openmanus-rl":
      return <OpenManusRLPanel />;
    case "hoc-plugin-ai-scientist":
      return <AIScientistPanel />;
    case "hoc-plugin-agenthub":
      return <AgentHubPanel />;
    default:
      return null;
  }
}

export function AgentStudioPage({ defaultPlugin }: { defaultPlugin?: string } = {}) {
  return (
    <PluginStudioLayout
      title="Agent Studio"
      categoryIcon={<Bot size={16} />}
      plugins={AGENT_PLUGINS}
      renderPanel={renderAgentPanel}
      defaultPlugin={defaultPlugin}
    />
  );
}
