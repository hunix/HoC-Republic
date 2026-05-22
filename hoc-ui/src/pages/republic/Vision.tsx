import { Eye, Image, FileText, BarChart2 } from "lucide-react";
import { useState } from "react";
import { PageHeader, Card, Badge, Button, StatCard, Alert, RpcStatus } from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

type VisionResult = {
  text?: string;
  description?: string;
  labels?: string[];
  confidence?: number;
  charts?: string[];
};

export function VisionPage() {
  const {
    data: diagData,
    loading: rpcLoading,
    error: rpcError,
    refetch,
  } = useRpc<{ ready?: boolean; model?: string; capabilities?: string[] }>(
    "republic.vision.diagnostics",
    {},
    [],
    { staleTimeMs: 20_000 },
  );

  // All hooks must be declared before any early return (Rules of Hooks)
  const [imageUrl, setImageUrl] = useState("");
  const [mode, setMode] = useState<"describe" | "ocr" | "analyzeUI" | "readChart">("describe");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisionResult | null>(null);
  const [compareUrl2, setCompareUrl2] = useState("");
  const [actionError, setActionError] = useState("");

  if (rpcLoading || rpcError) {
    return <RpcStatus loading={rpcLoading} error={rpcError} onRetry={refetch} />;
  }

  const modes: Array<{ key: typeof mode; label: string; icon: React.ReactNode; method: string }> = [
    {
      key: "describe",
      label: "Describe",
      icon: <Eye size={14} />,
      method: "republic.vision.describe",
    },
    { key: "ocr", label: "OCR", icon: <FileText size={14} />, method: "republic.vision.ocr" },
    {
      key: "analyzeUI",
      label: "Analyze UI",
      icon: <Image size={14} />,
      method: "republic.vision.analyzeUI",
    },
    {
      key: "readChart",
      label: "Read Chart",
      icon: <BarChart2 size={14} />,
      method: "republic.vision.readChart",
    },
  ];

  async function runVision() {
    if (!imageUrl.trim()) {return;}
    setLoading(true);
    setActionError("");
    setResult(null);
    const m = modes.find((x) => x.key === mode)!;
    try {
      const r = await rpc<VisionResult>(m.method, { imageUrl: imageUrl.trim() });
      setResult(r);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function compareImages() {
    if (!imageUrl.trim() || !compareUrl2.trim()) {return;}
    setLoading(true);
    setActionError("");
    setResult(null);
    try {
      const r = await rpc<VisionResult>("republic.vision.compare", {
        imageUrl1: imageUrl.trim(),
        imageUrl2: compareUrl2.trim(),
      });
      setResult(r);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const capabilities = diagData?.capabilities ?? [];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Vision Engine"
        description="AI image analysis: describe, OCR, UI analysis, chart reading, and comparison"
        icon={<Eye size={28} />}
      />

      {actionError && <Alert variant="danger">{actionError}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          label="Status"
          value={diagData?.ready ? "Ready" : "Offline"}
          icon={<Eye size={16} />}
        />
        <StatCard label="Model" value={diagData?.model ?? "—"} icon={<Image size={16} />} />
        <StatCard label="Capabilities" value={capabilities.length} icon={<BarChart2 size={16} />} />
      </div>

      {/* Mode select */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4">🔭 Analysis Mode</h3>
        <div className="flex gap-2 flex-wrap mb-4">
          {modes.map((m) => (
            <Button
              key={m.key}
              size="sm"
              variant={mode === m.key ? "primary" : "outline"}
              icon={m.icon}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <input
            className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted font-mono"
            placeholder="Image URL (https://...)..."
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />

          {/* Image preview */}
          {imageUrl && (
            <div className="h-40 bg-bg-secondary border border-border/30 rounded-lg overflow-hidden flex items-center justify-center">
              <img
                src={imageUrl}
                alt="Preview"
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          <Button
            onClick={runVision}
            loading={loading}
            icon={<Eye size={14} />}
            disabled={!imageUrl.trim()}
          >
            Analyze
          </Button>
        </div>
      </Card>

      {/* Compare Mode */}
      <Card>
        <h3 className="font-semibold text-text-heading mb-4 flex items-center gap-2">
          <BarChart2 size={16} /> Compare Images
        </h3>
        <div className="flex flex-col gap-3">
          <input
            className="w-full px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-primary placeholder:text-text-muted font-mono"
            placeholder="Second image URL..."
            value={compareUrl2}
            onChange={(e) => setCompareUrl2(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={compareImages}
            loading={loading}
            disabled={!imageUrl.trim() || !compareUrl2.trim()}
          >
            Compare
          </Button>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <h3 className="font-semibold text-text-heading mb-4">📊 Results</h3>
          {result.confidence != null && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-text-muted">Confidence:</span>
              <Badge
                variant={
                  result.confidence > 0.8
                    ? "success"
                    : result.confidence > 0.6
                      ? "warning"
                      : "neutral"
                }
              >
                {(result.confidence * 100).toFixed(1)}%
              </Badge>
            </div>
          )}
          {result.description && (
            <div className="mb-3">
              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                Description
              </p>
              <p className="text-sm text-text-primary">{result.description}</p>
            </div>
          )}
          {result.text && (
            <div className="mb-3">
              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
                Extracted Text (OCR)
              </p>
              <pre className="text-xs font-mono bg-bg-secondary border border-border/30 rounded p-3 whitespace-pre-wrap text-text-secondary">
                {result.text}
              </pre>
            </div>
          )}
          {result.labels && result.labels.length > 0 && (
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2">
                Labels
              </p>
              <div className="flex flex-wrap gap-2">
                {result.labels.map((l, i) => (
                  <Badge key={i} variant="info">
                    {l}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
