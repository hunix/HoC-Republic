/**
 * ContactIntelligencePage — HPICS Contact Intelligence Hub
 *
 * Browse your real-world contacts with all their stored assets (audio / images / video).
 * Select any asset to run HPICS analysis: voice cloning prep, deepfake detection,
 * facial biometrics, dossier generation, behavioral prediction, and network analysis.
 *
 * Route: /intel/contacts
 */

import { useState } from "react";
import {
  Users, Search, Mic, Image, Video, FileText, Brain, Eye, Network,
  Target, RefreshCw, Play, Download, Shield, Zap, ScanEye,
  UserCheck, Loader2, Check, X,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, EmptyState, PageHeader, RpcStatus, StatCard, Tabs,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  avatarUrl?: string;
  tags?: string[];
  company?: string;
  location?: string;
  enriched?: boolean;
  hasAudio?: boolean;
  hasImages?: boolean;
  hasVideos?: boolean;
  assetCount?: number;
  lastAnalyzed?: string;
  intelligenceScore?: number;
}

interface Asset {
  id: string;
  url: string;
  type: "audio" | "image" | "video" | "document";
  name: string;
  size?: number;
  mime?: string;
  createdAt?: string;
  duration?: number;
  thumbnail?: string;
}

interface AnalysisResult {
  id: string;
  contactId: string;
  contactName: string;
  timestamp: number;
  type: string;
  tool: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface ContactsListData {
  contacts?: Contact[];
  total?: number;
  hasMore?: boolean;
}

interface AssetsData {
  assets?: Asset[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(b?: number) {
  if (!b) { return "—"; }
  if (b < 1024) { return `${b}B`; }
  if (b < 1024 * 1024) { return `${(b / 1024).toFixed(1)}KB`; }
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

function formatDuration(s?: number) {
  if (!s) { return null; }
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function AssetTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; variant: "info" | "success" | "warning" | "neutral" }> = {
    audio: { label: "Audio", variant: "info" },
    image: { label: "Image", variant: "success" },
    video: { label: "Video", variant: "warning" },
    document: { label: "Doc", variant: "neutral" },
  };
  const cfg = map[type] ?? { label: type, variant: "neutral" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ─── Analysis actions config ──────────────────────────────────────────────────

const VOICE_ANALYSES = [
  { key: "comprehensive", label: "Comprehensive Analysis", icon: Mic, desc: "Full deception + stress + stylometric profile" },
  { key: "deception", label: "Deception Detection", icon: Shield, desc: "Linguistic deception indicators" },
  { key: "stress", label: "Stress Analysis", icon: Zap, desc: "Voice stress correlators" },
  { key: "stylometric", label: "Stylometric Fingerprint", icon: Brain, desc: "Unique voice pattern identification" },
];

const FACE_ANALYSES = [
  { key: "biometrics", label: "Facial Biometrics", icon: ScanEye, desc: "Face vectors, age estimate, emotion map" },
  { key: "deepfake", label: "Deepfake Detection", icon: Eye, desc: "AI-manipulation artifact detection" },
  { key: "microexpression", label: "Microexpression Analysis", icon: Brain, desc: "Involuntary micro-expression timeline" },
  { key: "emotion", label: "Emotion Recognition", icon: UserCheck, desc: "Emotion category and intensity mapping" },
];

const CONTACT_OPERATIONS = [
  { key: "enrich", label: "Auto-Enrich", icon: Search, rpc: "hpics.contacts.enrich", desc: "OSINT + digital footprint enrichment" },
  { key: "dossier", label: "Generate Dossier", icon: FileText, rpc: "hpics.contacts.dossier", desc: "Full intelligence dossier" },
  { key: "aggregate", label: "Aggregate Intel", icon: Brain, rpc: "hpics.contacts.aggregate", desc: "Mosaic view: voice + media + social" },
  { key: "network", label: "Network Analysis", icon: Network, rpc: "hpics.contacts.network", desc: "Social graph, power nodes, influence" },
  { key: "predict", label: "Behavioral Prediction", icon: Target, rpc: "hpics.contacts.predict", desc: "Next actions, trajectory, breaking points" },
];

// ─── Contact Card ─────────────────────────────────────────────────────────────

function ContactCard({ contact, selected, onSelect }: {
  contact: Contact;
  selected: boolean;
  onSelect: (c: Contact) => void;
}) {
  return (
    <Card
      className={`p-3 cursor-pointer transition-all ${selected ? "border-accent bg-accent/5 shadow-md" : "hover:border-border-hover hover:bg-bg-card"}`}
      onClick={() => { onSelect(contact); }}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 overflow-hidden ${selected ? "ring-2 ring-accent" : ""}`}
          style={{ background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-info) 100%)" }}>
          {contact.avatarUrl
            ? <img src={contact.avatarUrl} alt={contact.name} className="w-full h-full object-cover" />
            : <span className="text-white text-sm font-bold">{contact.name.slice(0, 2).toUpperCase()}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-text-heading truncate">{contact.name}</span>
            {selected && <Check className="w-3 h-3 text-accent shrink-0" />}
          </div>
          {contact.email && <p className="text-xs text-text-muted truncate">{contact.email}</p>}
          {contact.company && <p className="text-xs text-text-muted truncate">{contact.company}</p>}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {contact.hasAudio && <Badge variant="info" className="text-[9px] py-0">🎵 Audio</Badge>}
            {contact.hasImages && <Badge variant="success" className="text-[9px] py-0">🖼 Images</Badge>}
            {contact.hasVideos && <Badge variant="warning" className="text-[9px] py-0">🎬 Video</Badge>}
            {contact.enriched && <Badge variant="purple" className="text-[9px] py-0">Enriched</Badge>}
          </div>
        </div>
        {typeof contact.intelligenceScore === "number" && (
          <div className="text-right shrink-0">
            <div className="text-xs font-bold text-accent">{contact.intelligenceScore}%</div>
            <div className="text-[9px] text-text-muted">Intel</div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Asset Grid ───────────────────────────────────────────────────────────────

function AssetGrid({ assets, selectedIds, onToggle }: {
  assets: Asset[];
  selectedIds: Set<string>;
  onToggle: (asset: Asset) => void;
}) {
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-8 h-8" />}
        title="No assets found"
        description="This contact has no stored media assets in HPICS"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {assets.map(asset => {
        const isSelected = selectedIds.has(asset.id);
        return (
          <div
            key={asset.id}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { onToggle(asset); } }}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? "border-accent bg-accent/5 shadow" : "border-border hover:border-border-hover bg-bg-card"}`}
            onClick={() => { onToggle(asset); }}
          >
            <div className="flex items-start gap-2.5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? "bg-accent" : "bg-bg-secondary"}`}>
                {asset.type === "audio" && <Mic className={`w-4 h-4 ${isSelected ? "text-white" : "text-info"}`} />}
                {asset.type === "image" && <Image className={`w-4 h-4 ${isSelected ? "text-white" : "text-success"}`} />}
                {asset.type === "video" && <Video className={`w-4 h-4 ${isSelected ? "text-white" : "text-warning"}`} />}
                {asset.type === "document" && <FileText className={`w-4 h-4 ${isSelected ? "text-white" : "text-text-muted"}`} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <AssetTypeBadge type={asset.type} />
                  {isSelected && <Check className="w-3 h-3 text-accent" />}
                </div>
                <p className="text-xs font-medium text-text-primary truncate">{asset.name}</p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {formatBytes(asset.size)}
                  {asset.type === "audio" && asset.duration && ` · ${formatDuration(asset.duration) ?? ""}`}
                  {asset.createdAt && ` · ${new Date(asset.createdAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <a href={asset.url} target="_blank" rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-bg-input text-text-muted hover:text-accent transition-colors"
                  onClick={e => { e.stopPropagation(); }}
                  aria-label="Open asset">
                  <Download className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Analysis Result Card ─────────────────────────────────────────────────────

function ResultCard({ result, onDismiss }: { result: AnalysisResult; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4 animate-fade-in">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={result.ok ? "success" : "danger"}>{result.ok ? "OK" : "Error"}</Badge>
          <span className="text-xs font-semibold text-text-heading">{result.contactName}</span>
          <span className="text-xs text-text-muted">— {result.type}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-text-muted">{new Date(result.timestamp).toLocaleTimeString()}</span>
          <button type="button" onClick={onDismiss} className="text-text-muted hover:text-danger transition-colors" aria-label="Dismiss result">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="font-mono text-[10px] text-text-muted mb-2">{result.tool}</p>
      {result.error && <p className="text-xs text-danger">{result.error}</p>}
      {result.ok && result.data && (
        <>
          <Button variant="ghost" size="sm" onClick={() => { setOpen(v => !v); }}>
            {open ? "Hide" : "Show"} result
          </Button>
          {open && (
            <pre className="mt-2 text-xs text-text-secondary bg-bg-secondary rounded p-3 overflow-auto max-h-60">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ContactIntelligencePage() {
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [assetFilter, setAssetFilter] = useState<"all" | "audio" | "image" | "video">("all");
  const [activeTab, setActiveTab] = useState("contacts");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [runningOp, setRunningOp] = useState<string | null>(null);
  const [assetTypeFilter] = useState("all");

  // Contact list
  const { data: contactsData, loading: cLoad, error: cErr, refetch: cRefetch } =
    useRpc<ContactsListData>("hpics.contacts.list", { search: search || undefined, limit: 100 });

  // Assets for selected contact
  const { data: assetsData, loading: aLoad, error: aErr, refetch: aRefetch } =
    useRpc<AssetsData>(
      "hpics.contacts.assets.list",
      { contactId: selectedContact?.id, type: assetTypeFilter },
      [selectedContact?.id],
    );

  const contacts = contactsData?.contacts ?? [];
  const assets = assetsData?.assets ?? [];
  const filteredAssets = assetFilter === "all" ? assets : assets.filter(a => a.type === assetFilter);

  const audioAssets = assets.filter(a => a.type === "audio");
  const imageAssets = assets.filter(a => a.type === "image");
  const videoAssets = assets.filter(a => a.type === "video");

  const selectedAssetObjects = assets.filter(a => selectedAssets.has(a.id));
  const selectedAudio = selectedAssetObjects.filter(a => a.type === "audio");
  const selectedImages = selectedAssetObjects.filter(a => a.type === "image" || a.type === "video");

  function toggleAsset(asset: Asset) {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.add(asset.id);
      }
      return next;
    });
  }

  function selectContact(c: Contact) {
    setSelectedContact(c);
    setSelectedAssets(new Set());
    setActiveTab("assets");
  }

  function addResult(r: Omit<AnalysisResult, "id">) {
    setResults(prev => [{ ...r, id: `${Date.now()}-${Math.random()}` }, ...prev].slice(0, 50));
  }

  async function runAnalysis(op: string, rpcMethod: string, extraParams?: Record<string, unknown>) {
    if (!selectedContact) { return; }
    setRunningOp(op);
    try {
      const result = (await rpc(rpcMethod, {
        contactId: selectedContact.id,
        ...extraParams,
      })) as { ok: boolean; data?: unknown; dossier?: unknown; error?: string };
      addResult({
        contactId: selectedContact.id,
        contactName: selectedContact.name,
        timestamp: Date.now(),
        type: op,
        tool: rpcMethod,
        ok: result.ok,
        data: result.data ?? result.dossier,
        error: result.error,
      });
      setActiveTab("results");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addResult({
        contactId: selectedContact.id,
        contactName: selectedContact.name,
        timestamp: Date.now(),
        type: op,
        tool: rpcMethod,
        ok: false,
        error: msg,
      });
      setActiveTab("results");
    } finally {
      setRunningOp(null);
    }
  }

  async function runVoiceAnalysis(analysis: { key: string; label: string }) {
    if (!selectedContact || selectedAudio.length === 0) { return; }
    setRunningOp(`voice-${analysis.key}`);
    for (const asset of selectedAudio) {
      try {
        const result = (await rpc("hpics.contacts.analyze.voice", {
          contactId: selectedContact.id,
          assetId: asset.id,
          assetUrl: asset.url,
          analysisType: analysis.key,
        })) as { ok: boolean; data?: unknown; error?: string };
        addResult({
          contactId: selectedContact.id,
          contactName: selectedContact.name,
          timestamp: Date.now(),
          type: `Voice: ${analysis.label} — ${asset.name}`,
          tool: "hpics.contacts.analyze.voice",
          ok: result.ok,
          data: result.data,
          error: result.error,
        });
      } catch (err) {
        addResult({
          contactId: selectedContact.id,
          contactName: selectedContact.name,
          timestamp: Date.now(),
          type: `Voice: ${analysis.label} — ${asset.name}`,
          tool: "hpics.contacts.analyze.voice",
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setRunningOp(null);
    setActiveTab("results");
  }

  async function runFaceAnalysis(analysis: { key: string; label: string }) {
    if (!selectedContact || selectedImages.length === 0) { return; }
    setRunningOp(`face-${analysis.key}`);
    for (const asset of selectedImages) {
      try {
        const result = (await rpc("hpics.contacts.analyze.face", {
          contactId: selectedContact.id,
          assetId: asset.id,
          assetUrl: asset.url,
          analysisType: analysis.key,
          mediaType: asset.type,
        })) as { ok: boolean; data?: unknown; error?: string };
        addResult({
          contactId: selectedContact.id,
          contactName: selectedContact.name,
          timestamp: Date.now(),
          type: `Face: ${analysis.label} — ${asset.name}`,
          tool: "hpics.contacts.analyze.face",
          ok: result.ok,
          data: result.data,
          error: result.error,
        });
      } catch (err) {
        addResult({
          contactId: selectedContact.id,
          contactName: selectedContact.name,
          timestamp: Date.now(),
          type: `Face: ${analysis.label} — ${asset.name}`,
          tool: "hpics.contacts.analyze.face",
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setRunningOp(null);
    setActiveTab("results");
  }

  const TABS = [
    { id: "contacts", label: `Contacts (${contacts.length})` },
    { id: "assets", label: selectedContact ? `Assets (${assets.length})` : "Assets" },
    { id: "voice", label: "Voice Analysis" },
    { id: "face", label: "Face / Deepfake" },
    { id: "intelligence", label: "Intelligence" },
    { id: "results", label: `Results (${results.length})` },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Contact Intelligence Hub"
        description="Browse contacts, select media assets, and run HPICS intelligence analysis"
        icon={<Users className="w-6 h-6 text-accent" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => { cRefetch(); if (selectedContact) { aRefetch(); } }} aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        }
      />

      {selectedContact && (
        <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-xl">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
            style={{ background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-info) 100%)" }}>
            <span className="text-white font-bold text-xs">{selectedContact.name.slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-text-heading text-sm">{selectedContact.name}</span>
            {selectedContact.email && <span className="text-xs text-text-muted ml-2">{selectedContact.email}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs text-text-muted">
            {selectedAssets.size > 0 && (
              <Badge variant="info">{selectedAssets.size} asset{selectedAssets.size !== 1 ? "s" : ""} selected</Badge>
            )}
            <button type="button" onClick={() => { setSelectedContact(null); setSelectedAssets(new Set()); setActiveTab("contacts"); }}
              className="text-text-muted hover:text-danger transition-colors" aria-label="Clear selection">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Contacts" value={`${contactsData?.total ?? contacts.length}`} icon={<Users className="w-5 h-5 text-accent" />} />
        <StatCard label="Selected Assets" value={`${selectedAssets.size}`} icon={<FileText className="w-5 h-5 text-info" />} />
        <StatCard label="Audio Files" value={selectedContact ? `${audioAssets.length}` : "—"} icon={<Mic className="w-5 h-5 text-warning" />} />
        <StatCard label="Results" value={`${results.length}`} icon={<Brain className="w-5 h-5 text-success" />} />
      </div>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ── CONTACTS ── */}
      {activeTab === "contacts" && (
        <div className="space-y-4">
          <RpcStatus loading={cLoad} error={cErr} onRetry={cRefetch} />

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="search" value={search} onChange={e => { setSearch(e.target.value); }}
              placeholder="Search contacts by name, email, company…"
              className="w-full bg-bg-input border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" />
          </div>

          {!cLoad && contacts.length === 0 ? (
            <EmptyState icon={<Users className="w-8 h-8" />} title="No contacts found"
              description="HPICS contact database is empty or not configured" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {contacts.map(c => (
                <ContactCard key={c.id} contact={c} selected={selectedContact?.id === c.id} onSelect={selectContact} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ASSETS ── */}
      {activeTab === "assets" && (
        <div className="space-y-4">
          {!selectedContact ? (
            <Alert variant="info">Select a contact from the <strong>Contacts</strong> tab to browse their assets.</Alert>
          ) : (
            <>
              <RpcStatus loading={aLoad} error={aErr} onRetry={aRefetch} />

              <div className="flex gap-2 flex-wrap">
                {(["all", "audio", "image", "video"] as const).map(f => (
                  <Button key={f} variant={assetFilter === f ? "primary" : "outline"} size="sm"
                    onClick={() => { setAssetFilter(f); }}>
                    {f === "all" ? `All (${assets.length})` :
                      f === "audio" ? `🎵 Audio (${audioAssets.length})` :
                      f === "image" ? `🖼 Images (${imageAssets.length})` :
                      `🎬 Video (${videoAssets.length})`}
                  </Button>
                ))}
                {selectedAssets.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedAssets(new Set()); }}>
                    Clear selection ({selectedAssets.size})
                  </Button>
                )}
              </div>

              {!aLoad && (
                <AssetGrid assets={filteredAssets} selectedIds={selectedAssets} onToggle={toggleAsset} />
              )}

              {selectedAssets.size > 0 && (
                <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
                  <span className="text-xs text-text-muted self-center">{selectedAssets.size} asset{selectedAssets.size !== 1 ? "s" : ""} selected — run:</span>
                  {selectedAudio.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => { setActiveTab("voice"); }}>
                      <Mic className="w-3 h-3 mr-1" /> Voice Analysis
                    </Button>
                  )}
                  {selectedImages.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => { setActiveTab("face"); }}>
                      <ScanEye className="w-3 h-3 mr-1" /> Face / Deepfake
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── VOICE ANALYSIS ── */}
      {activeTab === "voice" && (
        <div className="space-y-4">
          {!selectedContact ? (
            <Alert variant="info">Select a contact first, then choose their audio files from the <strong>Assets</strong> tab.</Alert>
          ) : selectedAudio.length === 0 && selectedAssets.size === 0 ? (
            <Alert variant="warning">
              No audio assets selected. Go to <strong>Assets</strong> tab and select audio files (🎵) to analyze.
            </Alert>
          ) : (
            <>
              {selectedAudio.length > 0 && (
                <div className="p-3 bg-info-bg border border-info/20 rounded-lg">
                  <p className="text-xs text-info font-medium mb-1">Selected audio ({selectedAudio.length})</p>
                  {selectedAudio.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-xs text-text-secondary">
                      <Mic className="w-3 h-3 shrink-0" />
                      <span className="truncate">{a.name}</span>
                      <span className="text-text-muted shrink-0">{formatBytes(a.size)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {VOICE_ANALYSES.map(analysis => (
                  <Card key={analysis.key} className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <analysis.icon className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm text-text-heading">{analysis.label}</p>
                        <p className="text-xs text-text-muted">{analysis.desc}</p>
                      </div>
                    </div>
                    <Button variant="primary" size="sm" className="w-full"
                      disabled={selectedAudio.length === 0 || runningOp !== null}
                      onClick={() => { void runVoiceAnalysis(analysis); }}>
                      {runningOp === `voice-${analysis.key}`
                        ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Analyzing…</>
                        : <><Play className="w-3 h-3 mr-1.5" />Run on {selectedAudio.length} file{selectedAudio.length !== 1 ? "s" : ""}</>
                      }
                    </Button>
                  </Card>
                ))}
              </div>

              <Alert variant="info">
                Results will appear in the <strong>Results</strong> tab. Voice analysis tools run on HPICS
                voice-router and take ~5–15 seconds per file.
              </Alert>
            </>
          )}
        </div>
      )}

      {/* ── FACE / DEEPFAKE ── */}
      {activeTab === "face" && (
        <div className="space-y-4">
          {!selectedContact ? (
            <Alert variant="info">Select a contact first, then choose their images/videos from the <strong>Assets</strong> tab.</Alert>
          ) : selectedImages.length === 0 ? (
            <Alert variant="warning">
              No image/video assets selected. Go to <strong>Assets</strong> tab and select 🖼 images or 🎬 videos.
            </Alert>
          ) : (
            <>
              <div className="p-3 bg-success-bg border border-success/20 rounded-lg">
                <p className="text-xs text-success font-medium mb-1">Selected media ({selectedImages.length})</p>
                {selectedImages.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-text-secondary">
                    {a.type === "image" ? <Image className="w-3 h-3 shrink-0" /> : <Video className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{a.name}</span>
                    <Badge variant={a.type === "image" ? "success" : "warning"} className="text-[9px]">{a.type}</Badge>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FACE_ANALYSES.map(analysis => (
                  <Card key={analysis.key} className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <analysis.icon className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm text-text-heading">{analysis.label}</p>
                        <p className="text-xs text-text-muted">{analysis.desc}</p>
                      </div>
                    </div>
                    <Button variant="danger" size="sm" className="w-full"
                      disabled={selectedImages.length === 0 || runningOp !== null}
                      onClick={() => { void runFaceAnalysis(analysis); }}>
                      {runningOp === `face-${analysis.key}`
                        ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Analyzing…</>
                        : <><ScanEye className="w-3 h-3 mr-1.5" />Analyze {selectedImages.length} file{selectedImages.length !== 1 ? "s" : ""}</>
                      }
                    </Button>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── INTELLIGENCE ── */}
      {activeTab === "intelligence" && (
        <div className="space-y-4">
          {!selectedContact ? (
            <Alert variant="info">Select a contact from the <strong>Contacts</strong> tab to run intelligence operations.</Alert>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 bg-bg-card rounded-lg border border-border">
                <Brain className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-text-heading">Intelligence Operations for {selectedContact.name}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CONTACT_OPERATIONS.map(op => (
                  <Card key={op.key} className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <op.icon className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm text-text-heading">{op.label}</p>
                        <p className="text-xs text-text-muted">{op.desc}</p>
                        <p className="font-mono text-[10px] text-text-muted mt-1">{op.rpc}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="w-full"
                      disabled={runningOp === op.key}
                      onClick={() => { void runAnalysis(op.label, op.rpc); }}>
                      {runningOp === op.key
                        ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Running…</>
                        : <><Play className="w-3 h-3 mr-1.5" />Run</>
                      }
                    </Button>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["standard", "deep", "agis"] as const).map(depth => (
                  <Card key={depth} className="p-4">
                    <p className="font-semibold text-sm text-text-heading mb-1">
                      {depth === "standard" ? "📋 Standard Dossier" : depth === "deep" ? "📂 Deep Dossier" : "🌀 AGIS Dossier"}
                    </p>
                    <p className="text-xs text-text-muted mb-3">
                      {depth === "standard" ? "Intelligence dossier from HPICS data" :
                       depth === "deep" ? "Enhanced multi-layer dossier" :
                       "Full AGIS cascade intelligence (slowest)"}
                    </p>
                    <Button variant={depth === "agis" ? "warning" : "outline"} size="sm" className="w-full"
                      disabled={runningOp !== null}
                      onClick={() => { void runAnalysis(`Dossier (${depth})`, "hpics.contacts.dossier", { depth }); }}>
                      {runningOp === `Dossier (${depth})` ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                      Generate
                    </Button>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── RESULTS ── */}
      {activeTab === "results" && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <EmptyState icon={<Brain className="w-8 h-8" />} title="No results yet"
              description="Select a contact and run analysis from any tab"
              action={<Button variant="outline" onClick={() => { setActiveTab("contacts"); }}>Browse contacts</Button>} />
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setResults([]); }}>Clear all</Button>
              </div>
              {results.map(r => (
                <ResultCard key={r.id} result={r} onDismiss={() => { setResults(prev => prev.filter(x => x.id !== r.id)); }} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
