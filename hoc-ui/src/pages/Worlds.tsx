import { Globe2, Play, ExternalLink, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { PageHeader, Button, Card, Badge, EmptyState, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

interface ProductionFile {
  id: string;
  filename: string;
  title: string;
  creator: string;
  creatorId: string;
  category: string;
  fileSize: number;
  createdAt: string;
  tick: number;
  servePath?: string;
}

const THEME_COLORS: Record<string, string> = {
  cyberpunk: "#ff0066",
  forest: "#44ff88",
  ocean: "#0088ff",
  space: "#aa44ff",
  cave: "#00ffcc",
  city: "#ffcc00",
  desert: "#ff8844",
  arctic: "#88ccff",
};

const THEME_EMOJIS: Record<string, string> = {
  cyberpunk: "🌆",
  forest: "🌲",
  ocean: "🌊",
  space: "🛸",
  cave: "💎",
  city: "🏙️",
  desert: "🏜️",
  arctic: "🌌",
};

function getTheme(world: ProductionFile): string {
  const name = (world.title + world.filename).toLowerCase();
  if (name.includes("cyberpunk")) {
    return "cyberpunk";
  }
  if (name.includes("forest") || name.includes("enchanted")) {
    return "forest";
  }
  if (name.includes("ocean")) {
    return "ocean";
  }
  if (name.includes("space") || name.includes("station")) {
    return "space";
  }
  if (name.includes("crystal") || name.includes("cave")) {
    return "cave";
  }
  if (name.includes("city")) {
    return "city";
  }
  if (name.includes("desert")) {
    return "desert";
  }
  if (name.includes("arctic") || name.includes("aurora")) {
    return "arctic";
  }
  return "space";
}

export function WorldsPage() {
  const { data, loading, error, refetch } = useRpc<{ files?: ProductionFile[] }>(
    "republic.productions.files",
    { category: "3d-models", limit: 100 },
  );
  const [selected, setSelected] = useState<ProductionFile | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setSelected(null);
  }, [data]);

  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }

  const worlds = (data?.files ?? []).filter(
    (f) =>
      f.filename?.endsWith(".html") ||
      !!f.title
        ?.toLowerCase()
        .match(
          /city|forest|ocean|space|crystal|desert|arctic|cyberpunk|world|3d|scene|environment/,
        ),
  );

  function openInTab(world: ProductionFile) {
    const url = world.servePath ?? `/republic-output/3d-models/${world.filename}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="animate-fade-in space-y-5 p-5">
      <PageHeader
        title="3D Worlds"
        description={`${worlds.length} environment${worlds.length !== 1 ? "s" : ""}`}
        icon={<Globe2 size={20} />}
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

      {/* Preview Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2 bg-bg-primary border-b border-border">
            <span className="text-xs font-semibold text-text-heading truncate flex-1">
              {selected.title}
            </span>
            <span className="text-[10px] text-text-muted">{selected.creator}</span>
            <Button
              variant="ghost"
              size="sm"
              icon={<ExternalLink size={11} />}
              onClick={() => openInTab(selected)}
              aria-label="Open in tab"
            />
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} aria-label="Close">
              ✕
            </Button>
          </div>
          <iframe
            ref={iframeRef}
            src={selected.servePath ?? `/republic-output/3d-models/${selected.filename}`}
            className="flex-1 border-0 w-full h-full"
            sandbox="allow-scripts allow-same-origin allow-popups"
            title={selected.title}
          />
        </div>
      )}

      {worlds.length === 0 ? (
        <EmptyState
          title="No 3D Worlds"
          description="Citizens generate Three.js environments automatically."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {worlds.map((world) => {
            const theme = getTheme(world);
            const themeColor = THEME_COLORS[theme] ?? "#aa44ff";
            const emoji = THEME_EMOJIS[theme] ?? "🌐";
            return (
              <Card
                key={world.id}
                hover
                onClick={() => setSelected(world)}
                className="overflow-hidden cursor-pointer"
              >
                <div
                  className="h-28 flex items-center justify-center text-4xl relative border-b border-border/20"
                  style={{
                    background: `radial-gradient(ellipse at center, ${themeColor}20, var(--bg-secondary))`,
                  }}
                >
                  {emoji}
                  <Badge variant="info" className="absolute top-1.5 right-1.5 !text-[9px]">
                    Three.js
                  </Badge>
                </div>
                <div className="p-2.5 space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-text-heading truncate">
                      {world.title}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {world.creator} · {(world.fileSize / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Play size={10} />}
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(world);
                      }}
                    >
                      Preview
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ExternalLink size={10} />}
                      aria-label={`Open ${world.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openInTab(world);
                      }}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
