import { Code2, Wand2, Zap } from "lucide-react";
/**
 * DevStudio — Full-featured panels for:
 *   OpenLovable, UI/UX ProMax, Awesome Claude, Superpowers
 */
import { useState } from "react";
import { Card, Button, Alert, Badge } from "@/components/ui";
import { rpc } from "@/lib/rpc";
import { PluginShell, type PluginUsageEntry } from "./PluginShell";
import { PluginStudioLayout, type StudioPlugin } from "./PluginStudioLayout";

function CodePreview({ code, language = "html" }: { code: string; language?: string }) {
  return (
    <div className="bg-bg-input rounded-xl border border-border/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-bg-secondary">
        <Badge variant="info" className="!text-[10px]">
          {language}
        </Badge>
        <button
type="button"           onClick={() => void navigator.clipboard.writeText(code)}
          className="text-xs text-text-muted hover:text-accent"
        >
          Copy
        </button>
      </div>
      <pre className="p-4 text-xs text-text-secondary overflow-auto max-h-72 font-mono">{code}</pre>
    </div>
  );
}

// ── OpenLovable ──
const LOVABLE_MODELS = [
  {
    id: "openlovable-runtime",
    name: "OpenLovable Runtime",
    sizeGb: 0.5,
    description: "Full-stack app generation pipeline",
    downloaded: false,
    required: true,
  },
];
const LOVABLE_STACKS = [
  "react",
  "vue",
  "svelte",
  "vanilla",
  "nextjs",
  "nuxt",
  "astro",
  "remix",
  "solidjs",
];
const LOVABLE_DATABASES = [
  "none",
  "sqlite",
  "postgresql",
  "mongodb",
  "supabase",
  "prisma+postgresql",
];
const LOVABLE_AUTH = [
  "none",
  "email-password",
  "oauth-google",
  "oauth-github",
  "magic-link",
  "clerk",
  "auth0",
];
const LOVABLE_DEPLOY = ["local", "vercel", "netlify", "railway", "fly.io", "docker"];

function OpenLovablePanel() {
  const [prompt, setPrompt] = useState("");
  const [stack, setStack] = useState("react");
  const [db, setDb] = useState("none");
  const [auth, setAuth] = useState("none");
  const [deploy, setDeploy] = useState("local");
  const [darkMode, setDarkMode] = useState(true);
  const [typescript, setTypescript] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    projectPath?: string;
    previewUrl?: string;
    error?: string;
  } | null>(null);
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  async function run() {
    if (!prompt.trim()) {
      return;
    }
    setLoading(true);
    setResult(null);
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "lovable.clone",
        params: {
          prompt,
          stack,
          database: db,
          auth,
          deployment: deploy,
          dark_mode: darkMode,
          typescript,
        },
      })) as { result?: { projectPath?: string; previewUrl?: string } };
      setResult(r?.result ?? {});
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "lovable.clone",
          durationMs: Date.now() - t0,
          success: true,
        },
      ]);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "lovable.clone",
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
      pluginId="hoc-plugin-open-lovable"
      displayName="OpenLovable"
      description="AI-powered full-stack web app generation from a single prompt. Supports 9 frameworks, 6 databases, 7 auth strategies, and 6 deployment targets. Generates complete, runnable apps."
      models={LOVABLE_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="info">
          Describe the full app you want — pages, features, data model. More detail = better
          results.
        </Alert>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            App Description
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="A kanban project management app with drag-and-drop boards, team collaboration, user accounts, real-time updates. Include a dashboard showing project stats, a calendar view, and dark mode..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Framework</label>
            <div className="flex flex-wrap gap-1">
              {LOVABLE_STACKS.map((s) => (
                <button
type="button"                   key={s}
                  onClick={() => setStack(s)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${stack === s ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Database</label>
            {LOVABLE_DATABASES.map((d) => (
              <button
type="button"                 key={d}
                onClick={() => setDb(d)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${db === d ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {d}
              </button>
            ))}
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Authentication
            </label>
            {LOVABLE_AUTH.map((a) => (
              <button
type="button"                 key={a}
                onClick={() => setAuth(a)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${auth === a ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {a}
              </button>
            ))}
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Deploy Target
            </label>
            {LOVABLE_DEPLOY.map((d) => (
              <button
type="button"                 key={d}
                onClick={() => setDeploy(d)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${deploy === d ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {d}
              </button>
            ))}
            <div className="flex gap-4 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                <span className="text-xs text-text-secondary">Dark mode</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={typescript}
                  onChange={(e) => setTypescript(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                <span className="text-xs text-text-secondary">TypeScript</span>
              </label>
            </div>
          </Card>
        </div>
        {result?.error && <Alert variant="danger">{result.error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Code2 size={14} />}
          className="w-full"
          disabled={!prompt.trim()}
        >
          Generate App
        </Button>
        {result?.projectPath && (
          <Card>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-success">✅ App Generated</span>
              {result.previewUrl && (
                <a
                  href={result.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  Open Preview →
                </a>
              )}
            </div>
            <p className="text-xs font-mono text-text-secondary">{result.projectPath}</p>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ── UI/UX ProMax ──
const UIUX_MODELS = [
  {
    id: "uiux-promax-runtime",
    name: "UI/UX ProMax Runtime",
    sizeGb: 0.5,
    description: "Design generation pipeline",
    downloaded: false,
    required: true,
  },
];
const UIUX_STYLES = [
  "modern-dark",
  "glassmorphism",
  "minimal",
  "corporate",
  "gaming",
  "futuristic",
  "neo-brutalism",
  "skeuomorphism",
  "material",
  "flat",
  "aurora",
  "cyberpunk",
];
const UIUX_PLATFORMS = [
  "web",
  "mobile-ios",
  "mobile-android",
  "tablet",
  "desktop-app",
  "tv",
  "wearable",
];
const UIUX_COMPONENT_TYPES = [
  "full-page",
  "component",
  "dashboard",
  "landing-page",
  "onboarding",
  "checkout",
  "settings",
  "profile",
  "data-table",
  "chart-widget",
];

function UIUXProMaxPanel() {
  const [brief, setBrief] = useState("");
  const [style, setStyle] = useState("modern-dark");
  const [platform, setPlatform] = useState("web");
  const [component, setComponent] = useState("full-page");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [fontStyle, setFontStyle] = useState("Inter");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    code?: string;
    imagePath?: string;
    error?: string;
  } | null>(null);
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  const FONTS = [
    "Inter",
    "Geist",
    "Roboto",
    "Outfit",
    "Space Grotesk",
    "DM Sans",
    "Plus Jakarta Sans",
    "Nunito",
    "Sora",
    "Figtree",
  ];

  async function run() {
    if (!brief.trim()) {
      return;
    }
    setLoading(true);
    setResult(null);
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "uiux.designSystem",
        params: {
          brief,
          style,
          platform,
          component_type: component,
          primary_color: primaryColor,
          font: fontStyle,
        },
      })) as { result?: { code?: string; imagePath?: string } };
      setResult(r?.result ?? {});
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "uiux.designSystem",
          durationMs: Date.now() - t0,
          success: true,
        },
      ]);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: "uiux.designSystem",
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
      pluginId="hoc-plugin-uiux-promax"
      displayName="UI/UX ProMax"
      description="Generate premium UI designs from a text brief. 12 design styles, 7 platforms, 10 component types, custom colors and fonts. Outputs React/HTML code + rendered preview image."
      models={UIUX_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Design Brief</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder="A crypto trading dashboard with portfolio overview, live price charts, order book, and one-click buy/sell. Dark theme, data-dense, professional feel like Binance Pro..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Design Style</label>
            <div className="flex flex-wrap gap-1">
              {UIUX_STYLES.map((s) => (
                <button
type="button"                   key={s}
                  onClick={() => setStyle(s)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${style === s ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Platform</label>
            {UIUX_PLATFORMS.map((p) => (
              <button
type="button"                 key={p}
                onClick={() => setPlatform(p)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${platform === p ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {p}
              </button>
            ))}
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Component Type
            </label>
            {UIUX_COMPONENT_TYPES.map((c) => (
              <button
type="button"                 key={c}
                onClick={() => setComponent(c)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${component === c ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {c}
              </button>
            ))}
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Primary Color
            </label>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-full h-10 rounded-xl cursor-pointer"
            />
            <p className="text-[10px] font-mono text-text-muted mt-1">{primaryColor}</p>
          </Card>
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">Font</label>
            {FONTS.map((f) => (
              <button
type="button"                 key={f}
                onClick={() => setFontStyle(f)}
                className={`block w-full mb-1 py-1 px-2 rounded-lg text-xs text-left transition-colors ${fontStyle === f ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
              >
                {f}
              </button>
            ))}
          </Card>
        </div>
        {result?.error && <Alert variant="danger">{result.error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Wand2 size={14} />}
          className="w-full"
          disabled={!brief.trim()}
        >
          Generate UI Design
        </Button>
        {result?.imagePath && (
          <img
            src={`/republic-output/${result.imagePath}`}
            alt="UI Design"
            className="w-full rounded-xl border border-border"
          />
        )}
        {result?.code && <CodePreview code={result.code} />}
      </div>
    </PluginShell>
  );
}

// ── Awesome Claude ──
const CLAUDE_MODELS = [
  {
    id: "claude-code-runtime",
    name: "Awesome Claude Runtime",
    sizeGb: 0.2,
    description: "Claude Code extensions and tools",
    downloaded: false,
    required: true,
  },
];
const CLAUDE_MODES = [
  "implement",
  "refactor",
  "debug",
  "explain",
  "test",
  "review",
  "document",
  "optimize",
  "migrate",
  "security-audit",
  "translate-language",
  "add-i18n",
];

function AwesomeClaudePanel() {
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [mode, setMode] = useState("implement");
  const [targetLang, setTargetLang] = useState("typescript");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    code?: string;
    diff?: string;
    explanation?: string;
    error?: string;
  } | null>(null);
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);
  const LANGS = [
    "typescript",
    "python",
    "go",
    "rust",
    "java",
    "c++",
    "swift",
    "kotlin",
    "elixir",
    "lua",
    "ruby",
    "haskell",
  ];

  async function run() {
    if (!task.trim()) {
      return;
    }
    setLoading(true);
    setResult(null);
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "acc.search",
        params: {
          task,
          context,
          mode,
          target_language: mode === "translate-language" ? targetLang : undefined,
        },
      })) as { result?: { code?: string; diff?: string; explanation?: string } };
      setResult(r?.result ?? {});
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: `claude-code.${mode}`,
          durationMs: Date.now() - t0,
          success: true,
        },
      ]);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: `claude-code.${mode}`,
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
      pluginId="hoc-plugin-awesome-claude-code"
      displayName="Awesome Claude"
      description="12-mode Claude Code power tools: implement, refactor, debug, explain, test, review, document, optimize, migrate, security-audit, translate, i18n. Code diff and explanation output."
      models={CLAUDE_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {CLAUDE_MODES.map((m) => (
            <button
type="button"               key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${mode === m ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === "translate-language" && (
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Target Language
            </label>
            <div className="flex flex-wrap gap-1">
              {LANGS.map((l) => (
                <button
type="button"                   key={l}
                  onClick={() => setTargetLang(l)}
                  className={`px-2 py-1 rounded text-xs font-mono transition-colors ${targetLang === l ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </Card>
        )}
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Task / Request</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={4}
            placeholder={
              mode === "implement"
                ? "Add proper TypeScript generics to all functions and ensure null safety..."
                : mode === "refactor"
                  ? "Extract this God class into cohesive single-responsibility modules..."
                  : "Describe your coding task..."
            }
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">
            Code Context (optional)
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={5}
            placeholder="Paste your code here..."
            className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-xs font-mono text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent resize-none"
          />
        </Card>
        {result?.error && <Alert variant="danger">{result.error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Code2 size={14} />}
          className="w-full"
          disabled={!task.trim()}
        >
          Run Claude Code
        </Button>
        {result?.explanation && (
          <Card>
            <p className="text-xs text-text-muted mb-2">Explanation</p>
            <p className="text-sm text-text-secondary leading-relaxed">{result.explanation}</p>
          </Card>
        )}
        {result?.code && <CodePreview code={result.code} language="typescript" />}
        {result?.diff && <CodePreview code={result.diff} language="diff" />}
      </div>
    </PluginShell>
  );
}

// ── Superpowers ──
const SUPERPOWERS_MODELS = [
  {
    id: "superpowers-runtime",
    name: "Superpowers Runtime",
    sizeGb: 0.1,
    description: "Agent capability toolkit",
    downloaded: false,
    required: true,
  },
];
const SUPER_CAPABILITIES = [
  {
    id: "web-search",
    desc: "Search the web with Brave/SerpAPI",
    example: '{"query":"latest AI news 2025","num_results":10}',
  },
  {
    id: "file-system",
    desc: "Read/write/list files on the server",
    example: '{"action":"read","path":"/data/report.txt"}',
  },
  {
    id: "code-execution",
    desc: "Execute Python/Node/Bash code safely",
    example: '{"language":"python","code":"print(sum(range(100)))"}',
  },
  {
    id: "database-query",
    desc: "Query connected databases",
    example: '{"sql":"SELECT * FROM citizens LIMIT 10"}',
  },
  {
    id: "api-call",
    desc: "Make HTTP requests to external APIs",
    example: '{"url":"https://api.example.com/data","method":"GET"}',
  },
  {
    id: "email",
    desc: "Send emails via SMTP or Mailgun",
    example: '{"to":"user@example.com","subject":"Hello","body":"..."}',
  },
  {
    id: "calendar",
    desc: "Create, read, update calendar events",
    example: '{"action":"create","title":"Meeting","start":"2025-06-01T10:00:00Z"}',
  },
  {
    id: "image-analysis",
    desc: "Analyze images with vision models",
    example: '{"imageUrl":"https://example.com/photo.jpg","task":"describe"}',
  },
  {
    id: "pdf-extract",
    desc: "Extract text and tables from PDFs",
    example: '{"pdfPath":"/docs/report.pdf","extractTables":true}',
  },
  {
    id: "youtube-transcript",
    desc: "Get transcript from YouTube video",
    example: '{"videoUrl":"https://youtube.com/watch?v=..."}',
  },
];

function SuperpowersPanel() {
  const [capId, setCapId] = useState<string>("");
  const [configData, setConfigData] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [usageLog, setUsageLog] = useState<PluginUsageEntry[]>([]);

  function selectCap(id: string) {
    setCapId(id);
    const cap = SUPER_CAPABILITIES.find((c) => c.id === id);
    if (cap) {
      setConfigData(cap.example);
    }
  }

  async function run() {
    if (!capId) {
      return;
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(configData) as Record<string, unknown>;
    } catch {
      setError("Invalid JSON");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    const t0 = Date.now();
    try {
      const r = (await rpc("republic.plugins.call-gateway", {
        method: "superpowers.listSkills",
        params: { capability: capId, config: parsed },
      })) as { result?: unknown };
      setResult(r?.result);
      setUsageLog((l) => [
        ...l,
        {
          ts: Date.now(),
          method: `superpowers.${capId}`,
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
          method: `superpowers.${capId}`,
          durationMs: Date.now() - t0,
          success: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const selected = SUPER_CAPABILITIES.find((c) => c.id === capId);
  return (
    <PluginShell
      pluginId="hoc-plugin-superpowers"
      displayName="Superpowers"
      description="Extensible capability toolkit: web search, file system, code execution, database queries, API calls, email, calendar, image analysis, PDF extraction, YouTube transcripts — 10 capabilities."
      models={SUPERPOWERS_MODELS}
      usageLog={usageLog}
    >
      <div className="space-y-4">
        <Alert variant="info">
          Select a capability, review or edit the JSON config, then invoke. Pre-filled examples
          match each capability's interface.
        </Alert>
        <Card>
          <label className="block text-xs font-semibold text-text-muted mb-2">Capability</label>
          <div className="space-y-1">
            {SUPER_CAPABILITIES.map((c) => (
              <button
type="button"                 key={c.id}
                onClick={() => selectCap(c.id)}
                className={`w-full flex items-start gap-3 p-2 rounded-lg text-left transition-colors ${capId === c.id ? "bg-accent/20 border border-accent/40" : "hover:bg-bg-secondary border border-transparent"}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-mono font-bold ${capId === c.id ? "text-accent" : "text-text-secondary"}`}
                    >
                      {c.id}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">{c.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
        {selected && (
          <Card>
            <label className="block text-xs font-semibold text-text-muted mb-2">
              Config JSON <span className="font-normal opacity-60">for {selected.id}</span>
            </label>
            <textarea
              value={configData}
              onChange={(e) => setConfigData(e.target.value)}
              rows={5}
              className="w-full bg-bg-input border border-border rounded-xl px-4 py-3 text-xs font-mono text-text-primary outline-none focus:border-accent resize-none"
            />
          </Card>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
        <Button
          onClick={() => void run()}
          loading={loading}
          icon={<Zap size={14} />}
          className="w-full"
          disabled={!capId}
        >
          Invoke Superpower
        </Button>
        {result !== null && (
          <Card>
            <p className="text-xs text-text-muted mb-2">Result</p>
            <pre className="text-xs text-text-secondary overflow-auto max-h-64 font-mono">
              {JSON.stringify(result as Record<string, unknown>, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </PluginShell>
  );
}

// ─── Layout ───────────────────────────────────────────────────────

const DEV_PLUGINS: StudioPlugin[] = [
  {
    id: "hoc-plugin-open-lovable",
    name: "OpenLovable",
    icon: "💜",
    description: "Full-stack app gen: 9 frameworks, 6 DBs, 7 auth, 6 deploy targets",
    status: "active",
  },
  {
    id: "hoc-plugin-uiux-promax",
    name: "UI/UX ProMax",
    icon: "🎯",
    description: "12 styles, 7 platforms, 10 component types, color picker, fonts",
    status: "active",
  },
  {
    id: "hoc-plugin-awesome-claude-code",
    name: "Awesome Claude",
    icon: "🤖",
    description: "12-mode coding: implement, refactor, debug, audit, translate...",
    status: "active",
  },
  {
    id: "hoc-plugin-superpowers",
    name: "Superpowers",
    icon: "⚡",
    description: "10 capabilities: search, files, code-exec, DB, API, email, calendar...",
    status: "active",
  },
];

function renderDevPanel(id: string) {
  switch (id) {
    case "hoc-plugin-open-lovable":
      return <OpenLovablePanel />;
    case "hoc-plugin-uiux-promax":
      return <UIUXProMaxPanel />;
    case "hoc-plugin-awesome-claude-code":
      return <AwesomeClaudePanel />;
    case "hoc-plugin-superpowers":
      return <SuperpowersPanel />;
    default:
      return null;
  }
}

export function DevStudioPage({ defaultPlugin }: { defaultPlugin?: string } = {}) {
  return (
    <PluginStudioLayout
      title="Dev Studio"
      categoryIcon={<Code2 size={16} />}
      plugins={DEV_PLUGINS}
      renderPanel={renderDevPanel}
      defaultPlugin={defaultPlugin}
    />
  );
}
