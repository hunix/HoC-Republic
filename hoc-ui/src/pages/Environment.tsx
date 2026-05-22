import { Lock, Save, Shield } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Button, Alert, Tabs, RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

const KNOWN_VARS = {
  Providers: [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
    "QIANFAN_API_KEY",
    "DEEPSEEK_API_KEY",
    "COHERE_API_KEY",
    "GOOGLE_GENAI_API_KEY",
  ],
  Databases: [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENCLAW_REDIS_URL",
    "OPENCLAW_REDIS_HOST",
    "OPENCLAW_REDIS_PORT",
    "OPENCLAW_REDIS_PASSWORD",
    "BING_SEARCH_V7_SUBSCRIPTION_KEY",
    "BRAVE_API_KEY",
  ],
  System: [
    "REPUBLIC_MASTER_KEY",
    "OPENCLAW_LIVE_GATEWAY",
    "OPENCLAW_TEST_ENV",
    "PORT",
    "OPENCLAW_STATE_DIR",
    "TZ",
  ],
};

export function EnvironmentPage() {
  const [tab, setTab] = useState("Providers");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const { data, loading, error, refetch } = useRpc<{ env: Record<string, string> }>(
    "config.env.get",
    {},
  );

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const env = data?.env || {};

  const handleSave = async () => {
    setSaving(true);
    try {
      await rpc("config.env.set", { env: overrides });
      setOverrides({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const setVar = (key: string, val: string) => {
    setOverrides((prev) => ({ ...prev, [key]: val }));
  };

  const getValue = (key: string) => overrides[key] ?? env[key] ?? "";

  const currentVars = KNOWN_VARS[tab as keyof typeof KNOWN_VARS] ?? [];

  return (
    <div className="animate-fade-in space-y-5 p-5 max-w-4xl mx-auto">
      <PageHeader
        title="Environment"
        description={`${Object.keys(env).length} secrets · ${Object.keys(overrides).length} pending`}
        icon={<Shield size={20} />}
        actions={
          <Button
            size="sm"
            icon={<Save size={13} />}
            onClick={handleSave}
            disabled={saving || Object.keys(overrides).length === 0}
          >
            {saving ? "Syncing…" : "Sync"}
          </Button>
        }
      />

      {saved && <Alert variant="success">Secrets synced</Alert>}

      <Tabs
        tabs={Object.keys(KNOWN_VARS).map((k) => ({ id: k, label: k }))}
        active={tab}
        onChange={setTab}
      />

      <Card compact>
        <div className="space-y-2">
          {currentVars.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <label
                className="text-[10px] font-mono text-text-muted w-56 shrink-0 truncate"
                title={k}
              >
                {k}
              </label>
              <div className="relative flex-1">
                <input
                  type="password"
                  className="w-full bg-bg-input border border-border rounded-lg px-2.5 py-1.5 pr-7 text-xs text-text-primary outline-none focus:border-accent/50 transition-all"
                  value={getValue(k)}
                  onChange={(e) => setVar(k, e.target.value)}
                  placeholder="Not set"
                />
                <Lock
                  size={10}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
