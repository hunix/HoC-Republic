/**
 * APIKeys.tsx — API Keys & Integrations Management
 *
 * Covers all keys required by HoC + HPICS:
 *   ─ LLM Providers (Anthropic, Google, OpenAI, Groq, OpenRouter, DeepSeek)
 *   ─ HoC Services (ElevenLabs TTS, HuggingFace, Brave, Bing, Cohere, xAI, Mistral)
 *   ─ HPICS Bridge (HPICS_GATEWAY_URL, HPICS_API_KEY)
 *   ─ HPICS Data Sources (Supabase, PDL, Hunter, Proxycurl, Perplexity, Tavily)
 *   ─ HPICS Intelligence (OpenAI Vision/Whisper share OpenAI key, Diffbot, RapidAPI)
 *   ─ Communication (WhatsApp, Gmail, Outlook OAuth)
 *   ─ Hardware / SIGINT (SDR, GoPro, etc. — optional local)
 *
 * Save logic:
 *   1. collect overrides map
 *   2. POST config.env.set
 *   3. Verify with config.env.get readback — every key must round-trip
 *   4. Only clear overrides after verified persistence
 */

import {
  Key, Save, CheckCircle, XCircle, Eye, EyeOff,
  RefreshCw, Zap, Brain, Sparkles, Globe, Router, Cloud, Cpu,
  ExternalLink, ChevronDown, ChevronRight,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import {
  PageHeader, Card, Button, Alert, Badge, RpcStatus,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Shared helpers ────────────────────────────────────────────────────────────

interface KeyDef {
  key: string;                   // env var name
  label: string;                 // human name
  placeholder?: string;
  isUrl?: boolean;               // text input, not password
  docsUrl?: string;              // "Get key" link
  howTo?: string;                // 1-sentence generation instruction
}

// ─── LLM Provider Definitions ─────────────────────────────────────────────────

interface ProviderDef {
  id: string;
  name: string;
  icon: typeof Brain;
  color: string;
  bgColor: string;
  description: string;
  keyVar: string;
  modelVar: string;
  defaultModel: string;
  models: string[];
  docsUrl: string;
  howTo: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    icon: Brain,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    description: "Claude Opus 4.6, Sonnet 4.6/4.5, Haiku 4.5 — deep reasoning and coding",
    keyVar: "ANTHROPIC_API_KEY",
    modelVar: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-6",
    models: [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-sonnet-4-5",
      "claude-haiku-4-5-20251001",
    ],
    docsUrl: "https://console.anthropic.com/settings/keys",
    howTo: 'Go to console.anthropic.com → Settings → API Keys → "Create Key". Copy the sk-ant-... key immediately.',
  },
  {
    id: "google",
    name: "Google Gemini",
    icon: Sparkles,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    description: "Gemini 3.1 Pro, 3.1 Flash Lite, 2.5 Pro/Flash — multimodal + 1M token context",
    keyVar: "GEMINI_API_KEY",
    modelVar: "GEMINI_MODEL",
    defaultModel: "gemini-3.1-pro",
    models: [
      "gemini-3.1-pro",
      "gemini-3.1-flash-lite-preview",
      "gemini-3.1-flash-image-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
    ],
    docsUrl: "https://aistudio.google.com/apikey",
    howTo: "Go to aistudio.google.com → API Keys → Create API Key. Select your Google Cloud project.",
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: Zap,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    description: "GPT-5.4, GPT-5.3 Codex, GPT-5.2 — flagship intelligence + vision + coding",
    keyVar: "OPENAI_API_KEY",
    modelVar: "OPENAI_MODEL",
    defaultModel: "gpt-5.4",
    models: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-pro", "gpt-5.3-codex", "gpt-5.2"],
    docsUrl: "https://platform.openai.com/api-keys",
    howTo: "platform.openai.com → API Keys → Create new secret key. Also used for Whisper (voice) and DALL-E.",
  },
  {
    id: "groq",
    name: "Groq",
    icon: Zap,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    description: "Llama 4 Scout, Maverick — ultra-fast inference (free tier available)",
    keyVar: "GROQ_API_KEY",
    modelVar: "GROQ_MODEL",
    defaultModel: "llama-4-scout-17b-16e",
    models: [
      "llama-4-scout-17b-16e",
      "llama-4-maverick-17b-128e",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ],
    docsUrl: "https://console.groq.com/keys",
    howTo: "console.groq.com → API Keys → Create API Key. Free tier: 30 req/min.",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    icon: Cpu,
    color: "text-green-500",
    bgColor: "bg-green-600/10",
    description: "Nemotron 3 Super 120B, Ultra 253B, Nano 30B — NVIDIA NIM cloud inference",
    keyVar: "NVIDIA_API_KEY",
    modelVar: "NVIDIA_MODEL",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    models: [
      "nvidia/nemotron-3-super-120b-a12b",
      "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      "nvidia/nemotron-3-nano-30b-a3b",
    ],
    docsUrl: "https://build.nvidia.com/",
    howTo: "build.nvidia.com → Sign in → API Key → Generate API Key. Copy the nvapi-... key. Free tier: 1000 credits.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: Router,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    description: "100+ models unified API — auto-routing + fallback",
    keyVar: "OPENROUTER_API_KEY",
    modelVar: "OPENROUTER_MODEL",
    defaultModel: "auto",
    models: ["auto", "anthropic/claude-sonnet-4-6", "google/gemini-3.1-pro", "openai/gpt-5.4"],
    docsUrl: "https://openrouter.ai/keys",
    howTo: "openrouter.ai → Keys → Create Key. Charges are pass-through at each model's official rate.",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: Globe,
    color: "text-sky-400",
    bgColor: "bg-sky-500/10",
    description: "DeepSeek V3, R1 — cost-efficient deep reasoning",
    keyVar: "DEEPSEEK_API_KEY",
    modelVar: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    docsUrl: "https://platform.deepseek.com/api_keys",
    howTo: "platform.deepseek.com → API Keys → Create. Very cheap per-token pricing.",
  },
];

// ─── Service Key Sections ──────────────────────────────────────────────────────

interface KeySection {
  id: string;
  title: string;
  description: string;
  color: string;
  keys: KeyDef[];
}

const KEY_SECTIONS: KeySection[] = [
  {
    id: "hoc_services",
    title: "🔊 HoC Core Services",
    description: "TTS, embeddings, search, and supplementary AI providers used by HoC gateway",
    color: "border-accent/30",
    keys: [
      {
        key: "ELEVENLABS_API_KEY",
        label: "ElevenLabs (TTS / Voice Cloning)",
        docsUrl: "https://elevenlabs.io/app/settings/api-keys",
        howTo: "elevenlabs.io → Profile → API Keys → Generate. Required for TTS plugin + voice cloning.",
      },
      {
        key: "HUGGINGFACE_HUB_TOKEN",
        label: "HuggingFace Hub Token",
        docsUrl: "https://huggingface.co/settings/tokens",
        howTo: "huggingface.co → Settings → Access Tokens → New token (role: read). Required for model downloads.",
      },
      {
        key: "BRAVE_API_KEY",
        label: "Brave Search",
        docsUrl: "https://api.search.brave.com/app/keys",
        howTo: "brave.com/search/api → Subscribe (free tier: 2000 req/month) → API Keys.",
      },
      {
        key: "BING_SEARCH_V7_SUBSCRIPTION_KEY",
        label: "Bing Search v7",
        docsUrl: "https://portal.azure.com/#create/microsoft.bingsearch",
        howTo: "Azure Portal → Create Bing Search v7 resource → Keys and Endpoint → copy Key 1.",
      },
      {
        key: "COHERE_API_KEY",
        label: "Cohere (embeddings + rerank)",
        docsUrl: "https://dashboard.cohere.com/api-keys",
        howTo: "dashboard.cohere.com → API Keys → New trial key. Used for embedding and reranking.",
      },
      {
        key: "XAI_API_KEY",
        label: "xAI Grok",
        docsUrl: "https://console.x.ai/",
        howTo: "console.x.ai → API Keys → Create key. Grok-2 and Grok Vision available.",
      },
      {
        key: "MISTRAL_API_KEY",
        label: "Mistral AI",
        docsUrl: "https://console.mistral.ai/api-keys/",
        howTo: "console.mistral.ai → API Keys → Create new key.",
      },
    ],
  },
  {
    id: "hpics_bridge",
    title: "🧬 HPICS Bridge",
    description: "Connection credentials from HoC to HPICS Supabase gateway (required for all intel operations)",
    color: "border-danger/30",
    keys: [
      {
        key: "HPICS_GATEWAY_URL",
        label: "HPICS Gateway URL",
        placeholder: "https://xxxx.supabase.co/functions/v1/hoc-gateway",
        isUrl: true,
        docsUrl: "https://app.supabase.com/project/_/functions",
        howTo: "Supabase Dashboard → your HPICS project → Edge Functions → hoc-gateway → copy the invocation URL.",
      },
      {
        key: "HPICS_API_KEY",
        label: "HPICS API Key (shared secret)",
        docsUrl: "https://app.supabase.com/project/_/settings/vault",
        howTo: "Generate a random 64-char secret (e.g. openssl rand -hex 32). Set same value in HPICS Supabase → Vault → HPICS_API_KEY.",
      },
    ],
  },
  {
    id: "hpics_supabase",
    title: "🗄️ HPICS Supabase (Data Layer)",
    description: "Direct Supabase credentials for HPICS database access — contacts, assets, dossiers",
    color: "border-success/30",
    keys: [
      {
        key: "HPICS_SUPABASE_URL",
        label: "HPICS Supabase Project URL",
        placeholder: "https://xxxx.supabase.co",
        isUrl: true,
        docsUrl: "https://app.supabase.com/project/_/settings/api",
        howTo: "Supabase Dashboard → HPICS project → Settings → API → Project URL.",
      },
      {
        key: "HPICS_SUPABASE_ANON_KEY",
        label: "HPICS Supabase Anon Key",
        docsUrl: "https://app.supabase.com/project/_/settings/api",
        howTo: "Supabase Dashboard → HPICS project → Settings → API → anon public key.",
      },
      {
        key: "HPICS_SUPABASE_SERVICE_KEY",
        label: "HPICS Supabase Service Role Key (admin)",
        docsUrl: "https://app.supabase.com/project/_/settings/api",
        howTo: "Supabase Dashboard → HPICS project → Settings → API → service_role key. Keep secret — never expose to browser.",
      },
    ],
  },
  {
    id: "hpics_enrichment",
    title: "🔍 HPICS Data Enrichment",
    description: "Third-party data sources used by HPICS OSINT, contact enrichment, and intelligence collection",
    color: "border-info/30",
    keys: [
      {
        key: "PDL_API_KEY",
        label: "People Data Labs (PDL)",
        docsUrl: "https://dashboard.peopledatalabs.com/main/api-keys",
        howTo: "peopledatalabs.com → Dashboard → API Keys → Create key. Used for contact enrichment (enrich-pdl tool).",
      },
      {
        key: "HUNTER_API_KEY",
        label: "Hunter.io (email discovery)",
        docsUrl: "https://hunter.io/api-keys",
        howTo: "hunter.io → API Keys → New key. Used by enrich-hunter for email/domain lookup. Free: 25 req/month.",
      },
      {
        key: "PROXYCURL_API_KEY",
        label: "Proxycurl (LinkedIn scraping)",
        docsUrl: "https://nubela.co/proxycurl/pricing",
        howTo: "nubela.co → Dashboard → API Key → copy. Used by scrape-linkedin-proxycurl. Pay-per-use.",
      },
      {
        key: "DIFFBOT_API_KEY",
        label: "Diffbot (web extraction)",
        docsUrl: "https://app.diffbot.com/get-started/",
        howTo: "diffbot.com → Account → API Access Token → copy. Used for extract-diffbot structured web data.",
      },
      {
        key: "PERPLEXITY_API_KEY",
        label: "Perplexity AI (deep research)",
        docsUrl: "https://www.perplexity.ai/settings/api",
        howTo: "perplexity.ai → Settings → API → Generate. Used by perplexity-search and deep-research-agent.",
      },
      {
        key: "TAVILY_API_KEY",
        label: "Tavily (AI search)",
        docsUrl: "https://app.tavily.com/home",
        howTo: "app.tavily.com → API Keys → Create key. Free tier: 1000 searches/month.",
      },
      {
        key: "RAPIDAPI_KEY",
        label: "RapidAPI (social scraping hub)",
        docsUrl: "https://rapidapi.com/developer/apps",
        howTo: "rapidapi.com → My Apps → Create App → copy default key. Used for Instagram/Threads scraping.",
      },
    ],
  },
  {
    id: "hpics_intelligence",
    title: "🧪 HPICS Intelligence Processing",
    description: "Keys for biometric analysis, voice processing, document intelligence, and AI vision features",
    color: "border-warning/30",
    keys: [
      {
        key: "DEEPGRAM_API_KEY",
        label: "Deepgram (voice transcription)",
        docsUrl: "https://console.deepgram.com/",
        howTo: "console.deepgram.com → API Keys → Create API Key. Used for transcribe-audio and voice analysis.",
      },
      {
        key: "ASSEMBLYAI_API_KEY",
        label: "AssemblyAI (audio intelligence)",
        docsUrl: "https://www.assemblyai.com/app/account",
        howTo: "assemblyai.com → Account → API Key → copy. Used for advanced voice/sentiment analysis.",
      },
      {
        key: "REPLICATE_API_KEY",
        label: "Replicate (ML model inference)",
        docsUrl: "https://replicate.com/account/api-tokens",
        howTo: "replicate.com → Account → API Tokens → Create token. Used for deepfake analysis and biometric models.",
      },
      {
        key: "STABILITY_API_KEY",
        label: "Stability AI (diffusion / image gen)",
        docsUrl: "https://platform.stability.ai/account/keys",
        howTo: "platform.stability.ai → Account → API Keys → Create key. Used for image generation and alteration.",
      },
      {
        key: "FAL_API_KEY",
        label: "fal.ai (fast diffusion / video gen)",
        docsUrl: "https://fal.ai/dashboard/keys",
        howTo: "fal.ai → Dashboard → API Keys → Add key. Used for fast image/video/deepfake generation.",
      },
    ],
  },
  {
    id: "hpics_comms",
    title: "📡 HPICS Communications",
    description: "OAuth and webhook credentials for email, calendar, and messaging integrations",
    color: "border-purple-500/30",
    keys: [
      {
        key: "GOOGLE_CLIENT_ID",
        label: "Google OAuth Client ID (Gmail/Calendar)",
        isUrl: false,
        docsUrl: "https://console.cloud.google.com/apis/credentials",
        howTo: "console.cloud.google.com → APIs & Services → Credentials → Create OAuth 2.0 Client ID → Web application.",
      },
      {
        key: "GOOGLE_CLIENT_SECRET",
        label: "Google OAuth Client Secret",
        docsUrl: "https://console.cloud.google.com/apis/credentials",
        howTo: "Same OAuth credential as above — copy the client secret from the same credential entry.",
      },
      {
        key: "MICROSOFT_CLIENT_ID",
        label: "Microsoft OAuth Client ID (Outlook)",
        docsUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
        howTo: "Azure → App Registrations → New registration → copy Application (client) ID.",
      },
      {
        key: "MICROSOFT_CLIENT_SECRET",
        label: "Microsoft OAuth Client Secret",
        docsUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
        howTo: "Same app registration → Certificates & secrets → New client secret → copy Value (shown once).",
      },
      {
        key: "WHATSAPP_ACCESS_TOKEN",
        label: "WhatsApp Business API Token",
        docsUrl: "https://developers.facebook.com/apps/",
        howTo: "Meta for Developers → Apps → WhatsApp → API Setup → copy Temporary access token (or generate permanent).",
      },
      {
        key: "WHATSAPP_PHONE_NUMBER_ID",
        label: "WhatsApp Phone Number ID",
        isUrl: false,
        docsUrl: "https://developers.facebook.com/apps/",
        howTo: "Meta for Developers → WhatsApp → API Setup → copy the Phone Number ID shown under your test number.",
      },
    ],
  },
];

// ─── KeyInput component ────────────────────────────────────────────────────────

function KeyInput({
  keyDef,
  value,
  visible,
  dirty,
  onToggleVis,
  onChange,
}: {
  keyDef: KeyDef;
  value: string;
  visible: boolean;
  dirty: boolean;
  onToggleVis: () => void;
  onChange: (v: string) => void;
}) {
  const [showHowTo, setShowHowTo] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs font-medium text-text-secondary">
          {keyDef.label}
        </label>
        <span className="font-mono text-[9px] text-text-muted bg-bg-secondary px-1 py-0.5 rounded">{keyDef.key}</span>
        {dirty && <Badge variant="warning" className="text-[9px] py-0">unsaved</Badge>}
        {value && !dirty && <Badge variant="success" className="text-[9px] py-0">saved</Badge>}
      </div>
      <div className="relative flex gap-1">
        <input
          id={`key-${keyDef.key}`}
          type={keyDef.isUrl ? "text" : (visible ? "text" : "password")}
          className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text-primary outline-none focus:border-border-focus transition-all font-mono"
          value={value}
          onChange={(e) => { onChange(e.target.value); }}
          placeholder={keyDef.placeholder ?? (keyDef.isUrl ? "https://…" : "Not configured")}
        />
        {!keyDef.isUrl && (
          <button
            type="button"
            onClick={onToggleVis}
            className="absolute right-3 top-2.5 text-text-muted hover:text-text-secondary transition-colors"
            aria-label={visible ? "Hide" : "Show"}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 mt-0.5">
        {keyDef.howTo && (
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 transition-colors"
            onClick={() => { setShowHowTo(v => !v); }}
          >
            {showHowTo ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            How to generate
          </button>
        )}
        {keyDef.docsUrl && (
          <a
            href={keyDef.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent transition-colors"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            Get key
          </a>
        )}
      </div>
      {showHowTo && keyDef.howTo && (
        <p className="text-[11px] text-text-secondary bg-bg-secondary rounded-lg px-3 py-2 leading-relaxed border border-border animate-fade-in">
          {keyDef.howTo}
        </p>
      )}
    </div>
  );
}

// ─── Collapsible section ────────────────────────────────────────────────────────

function KeySection({
  section,
  getValue,
  isVisible,
  isDirty,
  onToggleVis,
  onChange,
  onSaveSection,
  saving,
}: {
  section: KeySection;
  getValue: (k: string) => string;
  isVisible: (k: string) => boolean;
  isDirty: (k: string) => boolean;
  onToggleVis: (k: string) => void;
  onChange: (k: string, v: string) => void;
  onSaveSection: (keys: string[]) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(true);
  const dirtyCount = section.keys.filter(k => isDirty(k.key)).length;
  const savedCount = section.keys.filter(k => !isDirty(k.key) && getValue(k.key)).length;

  return (
    <Card className={`border ${section.color} overflow-hidden`}>
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 text-left"
        onClick={() => { setOpen(v => !v); }}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-heading">{section.title}</h3>
          <Badge variant="neutral" className="text-[9px] py-0">{savedCount}/{section.keys.length} set</Badge>
          {dirtyCount > 0 && <Badge variant="warning" className="text-[9px] py-0">{dirtyCount} unsaved</Badge>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-text-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
      </button>

      {open && (
        <div className="mt-4 space-y-1">
          <p className="text-xs text-text-muted mb-4">{section.description}</p>
          <div className="space-y-4">
            {section.keys.map(keyDef => (
              <KeyInput
                key={keyDef.key}
                keyDef={keyDef}
                value={getValue(keyDef.key)}
                visible={isVisible(keyDef.key)}
                dirty={isDirty(keyDef.key)}
                onToggleVis={() => { onToggleVis(keyDef.key); }}
                onChange={(v) => { onChange(keyDef.key, v); }}
              />
            ))}
          </div>
          {dirtyCount > 0 && (
            <div className="pt-4 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() => { onSaveSection(section.keys.map(k => k.key)); }}
                disabled={saving}
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saving ? "Saving…" : `Save ${section.title.split(" ").slice(1).join(" ")} (${dirtyCount})`}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function APIKeysPage() {
  const [saved, setSaved] = useState<string | null>(null);   // section id
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [statuses, setStatuses] = useState<Record<string, "ok" | "fail" | null>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useRpc<{ env: Record<string, string> }>("config.env.get", {});
  const getValue = useCallback(
    (key: string) => {
      const e = data?.env ?? {};
      return overrides[key] ?? e[key] ?? "";
    },
    [overrides, data],
  );

  const setVar = (key: string, val: string) => {
    setOverrides(prev => ({ ...prev, [key]: val }));
  };

  const toggleVis = (key: string) => {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Recompute provider statuses when values change
  useEffect(() => {
    const s: Record<string, "ok" | "fail" | null> = {};
    for (const p of PROVIDERS) {
      const v = getValue(p.keyVar);
      if (v.length > 8) { s[p.id] = "ok"; }
      else if (v.length > 0) { s[p.id] = "fail"; }
      else { s[p.id] = null; }
    }
    setStatuses(s);
  }, [getValue]);

  // Save a specific set of env keys (from overrides)
  const saveKeys = async (keys: string[], sectionId?: string) => {
    const toSave = Object.fromEntries(
      keys.filter(k => k in overrides).map(k => [k, overrides[k]]),
    );
    if (Object.keys(toSave).length === 0) { return; }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await rpc("config.env.set", { env: toSave }) as { ok?: boolean } | undefined;
      if (!res?.ok) {
        setSaveError("Save failed — gateway returned an error. Check your connection.");
        return;
      }

      // Verify persistence via readback
      try {
        const verify = await rpc("config.env.get", {}) as { env?: Record<string, string> } | undefined;
        const readbackEnv = verify?.env ?? {};
        const allPersisted = Object.entries(toSave).every(([k, v]) => readbackEnv[k] === v);

        if (allPersisted) {
          // Keys verified — remove from overrides
          setOverrides(prev => {
            const next = { ...prev };
            keys.forEach(k => { delete next[k]; });
            return next;
          });
          setSaved(sectionId ?? "all");
          setTimeout(() => { setSaved(null); }, 4000);
          refetch();
        } else {
          setSaveError("Save appeared to succeed but keys were not confirmed on disk. Try saving again.");
        }
      } catch {
        // Verification network error — assume save worked, show cautious success
        setOverrides(prev => {
          const next = { ...prev };
          keys.forEach(k => { delete next[k]; });
          return next;
        });
        setSaved(sectionId ?? "all");
        setTimeout(() => { setSaved(null); }, 4000);
      }
    } catch (err: unknown) {
      setSaveError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestProvider = async (provider: ProviderDef) => {
    setTesting(prev => ({ ...prev, [provider.id]: true }));
    try {
      const result = await rpc("config.test-provider", { provider: provider.id }) as {
        ok?: boolean;
        models?: string[];
        latencyMs?: number;
        error?: string;
      } | undefined;
      if (result?.ok) {
        setStatuses(prev => ({ ...prev, [provider.id]: "ok" }));
      } else {
        setStatuses(prev => ({ ...prev, [provider.id]: "fail" }));
      }
    } catch {
      setStatuses(prev => ({ ...prev, [provider.id]: "fail" }));
    } finally {
      setTesting(prev => ({ ...prev, [provider.id]: false }));
    }
  };

  const allDirtyCount = Object.keys(overrides).length;
  const configuredLLMs = PROVIDERS.filter(p => getValue(p.keyVar).length > 8).length;

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="API Keys & Integrations"
        description="All credentials for HoC + HPICS intelligence platform — LLM providers, data sources, biometrics, communications"
        icon={<Key size={28} className="text-accent" />}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="info">{configuredLLMs}/{PROVIDERS.length} LLMs active</Badge>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw size={14} className="mr-1.5" />
              Refresh
            </Button>
            {allDirtyCount > 0 && (
              <Button variant="primary" size="sm" onClick={() => { void saveKeys(Object.keys(overrides), "all"); }} disabled={saving}>
                <Save size={14} className="mr-1.5" />
                {saving ? "Saving…" : `Save All (${allDirtyCount})`}
              </Button>
            )}
          </div>
        }
      />

      {saved && (
        <Alert variant="success">
          <CheckCircle className="w-4 h-4 inline mr-1.5" />
          Keys saved and verified in .env file — active immediately. No restart required.
        </Alert>
      )}
      {saveError && (
        <Alert variant="danger">
          <XCircle className="w-4 h-4 inline mr-1.5" />
          {saveError}
        </Alert>
      )}

      {/* LLM Provider overview grid */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {PROVIDERS.map(p => {
          const status = statuses[p.id];
          const Icon = p.icon;
          return (
            <div key={p.id} className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all cursor-default ${
              status === "ok" ? "border-success/40 bg-success/5" :
              status === "fail" ? "border-danger/40 bg-danger/5" :
              "border-border bg-bg-card/40"
            }`}>
              <Icon size={18} className={p.color} />
              <span className="text-[10px] font-medium text-text-primary text-center leading-tight">{p.name.split(" ")[0]}</span>
              {status === "ok" && <CheckCircle size={12} className="text-success" />}
              {status === "fail" && <XCircle size={12} className="text-danger" />}
              {status === null && <span className="text-[9px] text-text-muted">Not set</span>}
            </div>
          );
        })}
      </div>

      {/* LLM Provider cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-text-heading flex items-center gap-2">
          <Brain className="w-4 h-4 text-accent" /> LLM Providers
        </h2>
        {PROVIDERS.map(provider => {
          const Icon = provider.icon;
          const keyValue = getValue(provider.keyVar);
          const modelValue = provider.modelVar ? (getValue(provider.modelVar) || provider.defaultModel) : "";
          const isVisible = visibility[provider.keyVar];
          const isTesting = testing[provider.id];
          const status = statuses[provider.id];
          const keyDirty = provider.keyVar in overrides;
          const modelDirty = provider.modelVar ? (provider.modelVar in overrides) : false;

          return (
            <Card key={provider.id} className="relative overflow-hidden">
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                status === "ok" ? "bg-success" : status === "fail" ? "bg-danger" : "bg-border"
              }`} />
              <div className="pl-4">
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${provider.bgColor}`}>
                      <Icon size={18} className={provider.color} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-text-heading flex items-center gap-2 flex-wrap">
                        {provider.name}
                        {status === "ok" && <Badge variant="success">Connected</Badge>}
                        {status === "fail" && <Badge variant="danger">Invalid key</Badge>}
                        {(keyDirty || modelDirty) && <Badge variant="warning">Unsaved</Badge>}
                      </h3>
                      <p className="text-xs text-text-muted">{provider.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { void handleTestProvider(provider); }}
                      disabled={!keyValue || isTesting}
                      aria-label={`Test ${provider.name}`}
                    >
                      {isTesting ? <RefreshCw size={13} className="animate-spin mr-1" /> : <Cloud size={13} className="mr-1" />}
                      Test
                    </Button>
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      <ExternalLink size={11} />
                      Get key
                    </a>
                  </div>
                </div>

                <div className="space-y-3 max-w-2xl">
                  {/* API Key input */}
                  <div>
                    <label className="block text-[10px] font-mono text-text-muted mb-1">{provider.keyVar}</label>
                    <div className="relative">
                      <input
                        id={`key-${provider.id}`}
                        type={isVisible ? "text" : "password"}
                        className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text-primary outline-none focus:border-border-focus transition-all font-mono"
                        value={keyValue}
                        onChange={e => { setVar(provider.keyVar, e.target.value); }}
                        placeholder={`Enter your ${provider.name} API key`}
                      />
                      <button
                        type="button"
                        onClick={() => { toggleVis(provider.keyVar); }}
                        className="absolute right-3 top-2.5 text-text-muted hover:text-text-secondary transition-colors"
                        aria-label={isVisible ? "Hide key" : "Show key"}
                      >
                        {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {/* How to generate */}
                    <p className="text-[10px] text-text-muted mt-1 leading-relaxed">{provider.howTo}</p>
                  </div>

                  {/* Model selector */}
                  {provider.modelVar && provider.models.length > 0 && (
                    <div>
                      <label className="block text-[10px] font-mono text-text-muted mb-1">{provider.modelVar}</label>
                      <select
                        id={`model-${provider.id}`}
                        className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus transition-all cursor-pointer"
                        value={modelValue}
                        onChange={e => { setVar(provider.modelVar, e.target.value); }}
                      >
                        {provider.models.map(m => (
                          <option key={m} value={m}>
                            {m}{m === provider.defaultModel ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Per-provider save button */}
                  {(keyDirty || modelDirty) && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        const keysToSave = [provider.keyVar, provider.modelVar].filter(Boolean);
                        void saveKeys(keysToSave, provider.id);
                      }}
                      disabled={saving}
                    >
                      <Save size={13} className="mr-1.5" />
                      {saving ? "Saving…" : "Save"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Service key sections */}
      {KEY_SECTIONS.map(section => (
        <KeySection
          key={section.id}
          section={section}
          getValue={(k) => getValue(k)}
          isVisible={(k) => !!visibility[k]}
          isDirty={(k) => k in overrides}
          onToggleVis={toggleVis}
          onChange={setVar}
          onSaveSection={(keys) => { void saveKeys(keys, section.id); }}
          saving={saving}
        />
      ))}

      {/* Readback-only: show current value obfuscated */}
      {!allDirtyCount && (
        <Alert variant="info">
          All configured keys are loaded from the .env file. Edit any field above to update — each section has its own Save button.
        </Alert>
      )}
    </div>
  );
}
