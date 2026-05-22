/**
 * Channels — Communication Channels Manager (compact design)
 */
import {
  Globe,
  MessageSquare,
  Hash,
  Bell,
  RefreshCw,
  Settings,
  QrCode,
  Smartphone,
  Copy,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useState, useCallback } from "react";
import { PageHeader, Card, Badge, Button, Alert, Tabs, StatCard } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ── Types ────────────────────────────────────────────────────────

type ChannelPlatform =
  | "Discord"
  | "Telegram"
  | "Slack"
  | "iMessage"
  | "Signal"
  | "Nostr"
  | "WhatsApp"
  | "Google Chat";

interface ChannelConfig {
  platform: ChannelPlatform;
  icon: string;
  connected: boolean;
  username?: string;
  webhook?: string;
  messages: number;
  latency: string;
  phoneNumber?: string;
}

const CHANNELS_DEFAULT: ChannelConfig[] = [
  {
    platform: "Discord",
    icon: "🎮",
    connected: true,
    username: "HoC Bot#4821",
    messages: 4821,
    latency: "12ms",
  },
  {
    platform: "Telegram",
    icon: "✈️",
    connected: true,
    username: "@hoc_republic_bot",
    messages: 2341,
    latency: "35ms",
  },
  { platform: "Slack", icon: "💼", connected: false, messages: 0, latency: "—" },
  { platform: "iMessage", icon: "💬", connected: false, messages: 0, latency: "—" },
  { platform: "Signal", icon: "🔒", connected: false, messages: 0, latency: "—" },
  {
    platform: "Nostr",
    icon: "🌐",
    connected: true,
    username: "npub1hoc...3f92",
    messages: 890,
    latency: "120ms",
  },
  { platform: "WhatsApp", icon: "📱", connected: false, messages: 0, latency: "—" },
  { platform: "Google Chat", icon: "💬", connected: false, messages: 0, latency: "—" },
];

// ── WhatsApp Wizard ──────────────────────────────────────────────

interface WASettings {
  phoneNumber: string;
  displayName: string;
  webhookUrl: string;
  rateLimit: number;
  maxLength: number;
  allowGroups: boolean;
  allowMedia: boolean;
  language: string;
}

function WhatsAppWizard({ onRefetch }: { onRefetch: () => void }) {
  const [step, setStep] = useState<"number" | "qr" | "connected">("number");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState<WASettings>({
    phoneNumber: "",
    displayName: "HoC Republic",
    webhookUrl: "",
    rateLimit: 10,
    maxLength: 4096,
    allowGroups: true,
    allowMedia: true,
    language: "en",
  });

  const generateQR = useCallback(async () => {
    if (!phoneNumber.trim()) {
      return;
    }
    setQrLoading(true);
    try {
      const res = await rpc<{ ok: boolean; qrCode?: string; pairingCode?: string }>(
        "channels.whatsapp.generateQR",
        { phoneNumber: phoneNumber.trim() },
      );
      if (res.ok) {
        setQrCode(res.qrCode ?? res.pairingCode ?? "MOCK_QR");
        setStep("qr");
      }
    } catch {
      setQrCode("MOCK_QR");
      setStep("qr");
    } finally {
      setQrLoading(false);
    }
  }, [phoneNumber]);

  const copyPairing = useCallback(() => {
    if (!qrCode || qrCode === "MOCK_QR") {
      return;
    }
    void navigator.clipboard.writeText(qrCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [qrCode]);

  const saveSettings = useCallback(async () => {
    try {
      await rpc("channels.whatsapp.configure", { ...settings, phoneNumber });
      onRefetch();
    } catch {
      /* silent */
    }
  }, [settings, phoneNumber, onRefetch]);

  return (
    <div className="space-y-3">
      {step === "number" && (
        <Card compact className="space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-green-400" />
            <div>
              <h3 className="text-xs font-semibold text-text-heading">Link WhatsApp</h3>
              <p className="text-[10px] text-text-muted">Connect via QR code pairing</p>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-text-muted mb-0.5 block">
              Phone (with country code)
            </label>
            <input
              type="tel"
              placeholder="+1 555 000 1234"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full bg-bg-input border border-border/40 rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-muted mb-0.5 block">Display Name</label>
            <input
              type="text"
              value={settings.displayName}
              onChange={(e) => setSettings((s) => ({ ...s, displayName: e.target.value }))}
              className="w-full bg-bg-input border border-border/40 rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/60 transition-colors"
            />
          </div>
          <Button
            size="sm"
            icon={<QrCode size={13} />}
            onClick={generateQR}
            disabled={!phoneNumber.trim() || qrLoading}
            loading={qrLoading}
          >
            Generate QR
          </Button>
        </Card>
      )}

      {step === "qr" && (
        <Card compact className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-text-heading flex items-center gap-1.5">
              <QrCode size={14} className="text-green-400" /> Scan QR
            </h3>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={11} />}
              onClick={() => void generateQR()}
              aria-label="Regenerate"
            />
          </div>
          <div className="flex justify-center">
            {qrCode === "MOCK_QR" ? (
              <div className="w-[160px] h-[160px] bg-white rounded-lg flex flex-col items-center justify-center gap-1 p-2">
                <div className="grid grid-cols-10 gap-px w-[130px] h-[130px]">
                  {Array.from({ length: 100 }, (_, i) => (
                    <div
                      key={i}
                      className="rounded-[1px]"
                      style={{
                        background:
                          Math.sin(i * 7.3 + 1.2) > 0.1 ||
                          i < 10 ||
                          i > 89 ||
                          i % 10 === 0 ||
                          i % 10 === 9
                            ? "#111"
                            : "#fff",
                      }}
                    />
                  ))}
                </div>
                <p className="text-[8px] text-gray-500">{phoneNumber}</p>
              </div>
            ) : (
              <img
                src={`data:image/png;base64,${qrCode}`}
                alt="WhatsApp QR"
                className="w-[160px] h-[160px] rounded-lg"
              />
            )}
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              icon={copied ? <CheckCircle size={11} /> : <Copy size={11} />}
              onClick={copyPairing}
              className="flex-1"
            >
              {copied ? "Copied" : "Copy Code"}
            </Button>
            <Button
              size="sm"
              icon={<ChevronRight size={11} />}
              onClick={() => {
                setStep("connected");
                onRefetch();
              }}
              className="flex-1"
            >
              Confirm
            </Button>
          </div>
        </Card>
      )}

      {step === "connected" && (
        <Card compact className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-400" />
            <h3 className="text-xs font-semibold text-text-heading">Connected</h3>
            <Badge variant="success" dot>
              Live
            </Badge>
          </div>
          <p className="text-[10px] text-text-muted">📱 {phoneNumber || "Your number"}</p>
          <Button variant="outline" size="sm" onClick={() => setStep("number")} className="w-full">
            Relink
          </Button>
        </Card>
      )}

      {/* Policy */}
      <Card compact className="space-y-3">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
          <Settings size={10} /> WhatsApp Policy
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { key: "rateLimit" as const, label: "Rate (msg/min)", type: "number" },
            { key: "maxLength" as const, label: "Max Length", type: "number" },
          ].map((f) => (
            <div key={f.key}>
              <label className="text-[10px] text-text-muted mb-0.5 block">{f.label}</label>
              <input
                type={f.type}
                value={settings[f.key]}
                onChange={(e) => setSettings((s) => ({ ...s, [f.key]: Number(e.target.value) }))}
                className="w-full bg-bg-input border border-border/40 rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/60"
              />
            </div>
          ))}
          <div>
            <label className="text-[10px] text-text-muted mb-0.5 block">Webhook (optional)</label>
            <input
              type="url"
              placeholder="https://…"
              value={settings.webhookUrl}
              onChange={(e) => setSettings((s) => ({ ...s, webhookUrl: e.target.value }))}
              className="w-full bg-bg-input border border-border/40 rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-muted mb-0.5 block">Language</label>
            <select
              value={settings.language}
              onChange={(e) => setSettings((s) => ({ ...s, language: e.target.value }))}
              className="w-full bg-bg-input border border-border/40 rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/60"
            >
              {["en", "ar", "fr", "de", "zh", "ja", "es", "ru"].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          {[
            { key: "allowGroups" as const, label: "Groups" },
            { key: "allowMedia" as const, label: "Media" },
          ].map((f) => (
            <div key={f.key} className="flex items-center justify-between py-0.5">
              <span className="text-xs text-text-secondary">{f.label}</span>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, [f.key]: !s[f.key] }))}
                className="text-accent"
              >
                {settings[f.key] ? (
                  <ToggleRight size={18} />
                ) : (
                  <ToggleLeft size={18} className="text-text-muted" />
                )}
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" onClick={saveSettings} icon={<CheckCircle size={12} />}>
          Save Policy
        </Button>
      </Card>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export function ChannelsPage() {
  const [tab, setTab] = useState("overview");
  const [processing, setProcessing] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [globalSettings, setGlobalSettings] = useState({
    rateLimit: "10",
    maxLength: "2000",
    retries: "3",
    language: "English",
  });

  // oxlint-disable-next-line no-unused-vars
  const { data, refetch, loading, error } = useRpc<{
    channels?:
      | Record<
          string,
          {
            connected?: boolean;
            configured?: boolean;
            username?: string;
            phoneNumber?: string;
            [key: string]: unknown;
          }
        >
      | Array<Partial<ChannelConfig> & { platform?: string; name?: string }>;
    routingRules?: { event: string; route: string; active: boolean }[];
    settings?: { rateLimit?: string; maxLength?: string; retries?: string; language?: string };
  }>("channels.status", {});

  const liveChannels: ChannelConfig[] = (() => {
    const raw = data?.channels;
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw.map((c) => ({
        platform: (c?.platform ?? c?.name ?? "Unknown") as ChannelPlatform,
        icon: (c as { icon?: string })?.icon ?? "🔌",
        connected: c?.connected ?? false,
        username: c?.username,
        webhook: (c as { webhook?: string })?.webhook,
        messages:
          typeof (c as { messages?: number })?.messages === "number"
            ? (c as { messages: number }).messages
            : 0,
        latency: (c as { latency?: string })?.latency ?? "—",
        phoneNumber: c?.phoneNumber,
      }));
    }
    return Object.entries(raw).map(([id, summary]) => {
      const PLATFORM_MAP: Record<string, ChannelPlatform> = {
        whatsapp: "WhatsApp",
        telegram: "Telegram",
        discord: "Discord",
        slack: "Slack",
        imessage: "iMessage",
        signal: "Signal",
        nostr: "Nostr",
        googlechat: "Google Chat",
      };
      const ICON_MAP: Record<string, string> = {
        whatsapp: "📱",
        telegram: "✈️",
        discord: "🎮",
        slack: "💼",
        imessage: "💬",
        signal: "🔒",
        nostr: "🌐",
        googlechat: "💬",
      };
      const platform =
        PLATFORM_MAP[id.toLowerCase()] ??
        ((id.charAt(0).toUpperCase() + id.slice(1)) as ChannelPlatform);
      const s = summary as {
        connected?: boolean;
        configured?: boolean;
        username?: string;
        phoneNumber?: string;
        messages?: number;
        latency?: string;
      };
      return {
        platform,
        icon: ICON_MAP[id.toLowerCase()] ?? "🔌",
        connected: s?.connected ?? s?.configured ?? false,
        username: s?.username,
        messages: typeof s?.messages === "number" ? s.messages : 0,
        latency: s?.latency ?? "—",
        phoneNumber: s?.phoneNumber,
      };
    });
  })();
  const channels: ChannelConfig[] = liveChannels.length > 0 ? liveChannels : CHANNELS_DEFAULT;

  const routingRules = Array.isArray(data?.routingRules)
    ? data.routingRules
    : [
        { event: "Agent Task Complete", route: "Discord #notifications", active: true },
        { event: "System Alert", route: "Telegram + Discord", active: true },
        { event: "New Citizen Born", route: "Discord #events", active: true },
        { event: "Election Held", route: "All channels", active: false },
        { event: "Economy Report", route: "Telegram", active: true },
        { event: "Research Complete", route: "WhatsApp + Telegram", active: true },
      ];

  async function toggle(platform: ChannelPlatform, connected: boolean) {
    setProcessing(platform);
    setMutationError(null);
    try {
      await rpc(connected ? "channels.disconnect" : "channels.connect", { platform });
      refetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : `Failed`);
    } finally {
      setProcessing(null);
    }
  }

  async function saveSettings() {
    setMutationError(null);
    try {
      await rpc("channels.settings.update", globalSettings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed");
    }
  }

  const connected = channels.filter((c) => c.connected).length;
  const sortedByLatency = [...channels]
    .filter((c) => c.connected && c.latency && c.latency !== "—")
    .toSorted(
      (a, b) => parseInt(String(a.latency ?? "9999")) - parseInt(String(b.latency ?? "9999")),
    );
  const lowestLatency = sortedByLatency[0];
  const totalMessages = channels.reduce(
    (s, c) => s + (typeof c.messages === "number" ? c.messages : 0),
    0,
  );

  return (
    <div className="animate-fade-in space-y-5 p-5">
      {mutationError && <Alert variant="danger">{mutationError}</Alert>}
      <PageHeader
        title="Channels"
        description={`${connected}/${channels.length} connected · ${totalMessages.toLocaleString()} msgs`}
        icon={<Globe size={20} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={13} />}
            aria-label="Refresh"
            onClick={refetch}
          />
        }
      />

      {error && (
        <div className="flex items-center gap-1.5 p-2 bg-warning/10 border border-warning/30 rounded-lg text-[10px] text-text-muted">
          <AlertTriangle size={11} className="text-warning shrink-0" />
          Gateway unavailable — cached data
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Connected"
          value={`${connected}/${channels.length}`}
          icon={<Globe size={14} />}
        />
        <StatCard
          label="Messages"
          value={totalMessages.toLocaleString()}
          icon={<MessageSquare size={14} />}
        />
        <StatCard label="Active" value={connected} icon={<Hash size={14} />} />
        <StatCard
          label="Best Latency"
          value={lowestLatency?.latency ?? "—"}
          sub={lowestLatency?.platform}
          icon={<Bell size={14} />}
        />
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "routing", label: "Routing" },
          { id: "whatsapp", label: "WhatsApp" },
          { id: "settings", label: "Settings" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {channels.map((ch) => (
            <Card
              key={ch.platform}
              compact
              className={ch.connected ? "border-success/30" : "opacity-70"}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">{ch.icon}</span>
                  <span className="text-xs font-semibold text-text-heading">{ch.platform}</span>
                </div>
                <Badge variant={ch.connected ? "success" : "neutral"} dot>
                  {ch.connected ? "Live" : "Off"}
                </Badge>
              </div>
              {ch.connected ? (
                <div className="space-y-0.5 text-[10px] text-text-muted mb-2">
                  {ch.username && <p>{ch.username}</p>}
                  <p>
                    {ch.messages.toLocaleString()} msgs · {ch.latency}
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-text-muted mb-2">
                  {ch.platform === "WhatsApp" ? "Use WhatsApp tab →" : "Not connected"}
                </p>
              )}
              <Button
                variant={ch.connected ? "outline" : "primary"}
                size="sm"
                className="w-full"
                onClick={() => void toggle(ch.platform, ch.connected)}
                disabled={processing === ch.platform}
                loading={processing === ch.platform}
              >
                {ch.connected ? "Disconnect" : ch.platform === "WhatsApp" ? "Setup →" : "Connect"}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {tab === "routing" && (
        <Card compact>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Routing Rules
          </h3>
          <div className="space-y-1">
            {routingRules.map((rule, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-border/20 hover:border-border/40 transition-colors"
              >
                <div>
                  <p className="text-xs font-medium text-text-heading">{rule.event}</p>
                  <p className="text-[10px] text-text-muted flex items-center gap-0.5">
                    <ChevronRight size={9} /> {rule.route}
                  </p>
                </div>
                <Badge variant={rule.active ? "success" : "neutral"} dot>
                  {rule.active ? "Active" : "Off"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "whatsapp" && <WhatsAppWizard onRefetch={refetch} />}

      {tab === "settings" && (
        <Card compact>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Global Settings
          </h3>
          <div className="space-y-2">
            {[
              { key: "rateLimit" as const, label: "Rate Limit (msg/min)", type: "number" },
              { key: "maxLength" as const, label: "Max Length (chars)", type: "number" },
              { key: "retries" as const, label: "Retries", type: "number" },
              { key: "language" as const, label: "Language", type: "text" },
            ].map((f) => (
              <div
                key={f.key}
                className="flex items-center justify-between py-1 border-b border-border/10 last:border-0 gap-3"
              >
                <span className="text-xs text-text-secondary">{f.label}</span>
                <input
                  type={f.type}
                  value={globalSettings[f.key]}
                  onChange={(e) => setGlobalSettings((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="bg-bg-input border border-border/40 rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent/60 w-28 text-right"
                />
              </div>
            ))}
            <Button
              size="sm"
              icon={settingsSaved ? <CheckCircle size={12} /> : <Settings size={12} />}
              onClick={() => void saveSettings()}
            >
              {settingsSaved ? "Saved!" : "Save"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
