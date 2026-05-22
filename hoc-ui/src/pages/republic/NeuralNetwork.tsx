import { Network, Zap, GitBranch } from "lucide-react";
import { useRef } from "react";
import { PageHeader, Card, StatCard, Badge , RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

interface NNode {
  id: string;
  label: string;
  x: number;
  y: number;
  type: "input" | "hidden" | "output";
  activation: number;
}

interface NEdge {
  from: string;
  to: string;
  weight: number;
}

const LAYER_CONFIGS = [
  {
    type: "input" as const,
    labels: ["Observation", "Memory", "Context", "Goals", "Environment"],
    x: 80,
  },
  { type: "hidden" as const, labels: ["H1", "H2", "H3", "H4", "H5", "H6"], x: 280 },
  { type: "hidden" as const, labels: ["H7", "H8", "H9", "H10"], x: 460 },
  { type: "output" as const, labels: ["Action", "Response", "Planning", "Reflection"], x: 640 },
];

const TYPE_COLOR: Record<string, string> = {
  input: "#06b6d4",
  hidden: "#6366f1",
  output: "#10b981",
};

// Simple deterministic pseudo-random based on seed (no Math.random)
function seeded(seed: number, min = 0, max = 1): number {
  const x = Math.sin(seed + 1) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

function buildGraph(): { nodes: NNode[]; edges: NEdge[] } {
  const nodes: NNode[] = [];
  const allLayers: NNode[][] = [];
  let idCounter = 0;

  LAYER_CONFIGS.forEach((layer) => {
    const count = layer.labels.length;
    const layerNodes: NNode[] = layer.labels.map((label, i) => {
      const node: NNode = {
        id: `n${idCounter}`,
        label,
        x: layer.x,
        y: 60 + i * (280 / (count - 1 || 1)),
        type: layer.type,
        activation: seeded(idCounter++, 0, 1),
      };
      return node;
    });
    nodes.push(...layerNodes);
    allLayers.push(layerNodes);
  });

  const edges: NEdge[] = [];
  let edgeSeed = 1000;
  for (let l = 0; l < allLayers.length - 1; l++) {
    for (const from of allLayers[l]) {
      for (const to of allLayers[l + 1]) {
        edges.push({ from: from.id, to: to.id, weight: seeded(edgeSeed++, -1, 1) });
      }
    }
  }

  return { nodes, edges };
}

const { nodes, edges } = buildGraph();

export function NeuralNetworkPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { data, loading, error, refetch } = useRpc<{
    totalNodes?: number;
    totalEdges?: number;
    activePaths?: number;
    avgActivation?: number;
    nodesOverride?: typeof nodes;
    edgesOverride?: typeof edges;
  }>("republic.neural-network.status", {});
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  }
  const displayNodes = data?.nodesOverride ?? nodes;
  const displayEdges = data?.edgesOverride ?? edges;
  const totalNodes = data?.totalNodes ?? displayNodes.length;
  const totalEdges = data?.totalEdges ?? displayEdges.length;
  const activePaths = data?.activePaths ?? displayNodes.filter((n) => n.activation > 0.5).length;
  const avgActivation =
    data?.avgActivation ??
    Math.round(
      displayNodes.reduce((s, n) => s + (n.activation ?? 0), 0) / Math.max(displayNodes.length, 1),
    );
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Neural Network"
        description="Real-time visualization of the republic's cognitive neural graph"
        icon={<Network size={28} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Nodes" value={totalNodes} icon={<Network size={16} />} />
        <StatCard label="Connections" value={totalEdges} icon={<GitBranch size={16} />} />
        <StatCard label="Active Paths" value={activePaths} icon={<Zap size={16} />} />
        <StatCard label="Avg Activation" value={`${avgActivation}%`} icon={<Zap size={16} />} />
      </div>

      {/* Legend */}
      <div className="flex gap-4">
        {Object.entries(TYPE_COLOR).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: color }} />
            <span className="text-xs text-text-muted capitalize">{type} layer</span>
          </div>
        ))}
        <div className="flex items-center gap-2 ml-4">
          <span className="w-8 h-0.5 bg-success opacity-60" />
          <span className="text-xs text-text-muted">Positive weight</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 h-0.5 bg-danger opacity-60" />
          <span className="text-xs text-text-muted">Negative weight</span>
        </div>
      </div>

      <Card className="overflow-auto">
        <svg ref={svgRef} viewBox="0 0 720 340" className="w-full" style={{ minHeight: 320 }}>
          {/* Edges */}
          <g>
            {edges.map((e, i) => {
              const from = nodes.find((n) => n.id === e.from)!;
              const to = nodes.find((n) => n.id === e.to)!;
              const isPositive = e.weight > 0;
              const opacity = Math.abs(e.weight) * 0.4;
              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isPositive ? "#10b981" : "#ef4444"}
                  strokeWidth={Math.abs(e.weight) * 1.5}
                  strokeOpacity={opacity}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((n) => {
              const color = TYPE_COLOR[n.type];
              const r = 12 + n.activation * 8;
              return (
                <g key={n.id}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r}
                    fill={color}
                    fillOpacity={0.15 + n.activation * 0.55}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <circle cx={n.x} cy={n.y} r={4} fill={color} fillOpacity={0.9} />
                  <text
                    x={n.x}
                    y={n.y - r - 4}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={9}
                    fontFamily="monospace"
                  >
                    {n.label}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Layer labels */}
          {LAYER_CONFIGS.map((layer, i) => (
            <text
              key={i}
              x={layer.x}
              y={310}
              textAnchor="middle"
              fill="#64748b"
              fontSize={10}
              fontFamily="monospace"
              fontWeight="600"
            >
              {layer.type === "output"
                ? "Output"
                : layer.type === "input"
                  ? "Input"
                  : `Hidden ${i}`}
            </text>
          ))}
        </svg>
      </Card>

      <Card>
        <h3 className="font-semibold text-text-heading mb-3">🧬 Layer Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {LAYER_CONFIGS.map((layer, i) => {
            const layerNodes = nodes.filter(
              (n) => n.type === layer.type && Math.abs(n.x - layer.x) < 5,
            );
            const avgActivation =
              layerNodes.reduce((s, n) => s + n.activation, 0) / (layerNodes.length || 1);
            return (
              <div key={i} className="bg-bg-secondary rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-xs font-semibold capitalize"
                    style={{ color: TYPE_COLOR[layer.type] }}
                  >
                    {layer.type === "output"
                      ? "Output"
                      : layer.type === "input"
                        ? "Input"
                        : `Hidden ${i}`}
                  </span>
                  <Badge variant="neutral">{layer.labels.length} nodes</Badge>
                </div>
                <p className="text-xs text-text-muted">
                  Avg activation:{" "}
                  <span className="font-semibold text-text-secondary">
                    {(avgActivation * 100).toFixed(0)}%
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
