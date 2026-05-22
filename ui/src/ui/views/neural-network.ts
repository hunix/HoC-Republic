import { html, svg, nothing, type TemplateResult } from "lit";
import type {
  GenomePoolEntry,
  NetworkGraph,
  DnaStrand,
  LineageTree,
  FitnessLandscape,
} from "../republic-types.ts";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export interface NeuralNetworkProps {
  loading: boolean;
  genomes: GenomePoolEntry[];
  selectedGenomeId: string | null;
  network: NetworkGraph | null;
  dna: DnaStrand | null;
  lineage: LineageTree | null;
  landscape: FitnessLandscape | null;
  onSelectGenome: (id: string) => void;
  onRefresh: () => void;
}

// ─── Main Render ──────────────────────────────────────────────────

export function renderNeuralNetwork(props: NeuralNetworkProps): TemplateResult {
  const { loading, genomes, selectedGenomeId, network, dna, lineage, landscape } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading neural genomes…</p>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-neural">
      <!-- Hero / Genome Selector -->
      <div class="republic-hero republic-hero--neural">
        <div class="republic-hero__header">
          <h2 class="republic-hero__title">${icon("cpu")} Neural Network Viewer</h2>
          <span class="republic-hero__badge">${genomes.length} genomes</span>
        </div>

        ${
          genomes.length > 0
            ? html`<div class="republic-genome-selector">
              <label>Select Genome:</label>
              <select class="republic-select"
                @change=${(e: Event) => props.onSelectGenome((e.target as HTMLSelectElement).value)}>
                ${genomes.map(
                  (g) => html`<option value=${g.id} ?selected=${g.id === selectedGenomeId}>
                    ${g.label} (Gen ${g.generation}, Fitness ${g.fitness.toFixed(3)})
                  </option>`,
                )}
              </select>
              <button type="button" class="republic-btn republic-btn--sm" @click=${props.onRefresh}>↻ Refresh</button>
            </div>`
            : html`
                <p class="republic-card__empty">
                  No genomes in pool yet — start the simulation to evolve neural networks.
                </p>
              `
        }
      </div>

      <!-- Network Graph + DNA Stats side by side -->
      ${
        network
          ? html`<div class="republic-neural__panels">
            ${renderNetworkGraph(network)}
            ${dna ? renderDnaStats(dna) : nothing}
          </div>`
          : nothing
      }

      <!-- Genome Pool Summary -->
      ${
        genomes.length > 0
          ? html`<div class="republic-neural__pool">
            ${renderGenomePool(genomes)}
          </div>`
          : nothing
      }

      <!-- Lineage + Fitness -->
      <div class="republic-neural__bottom">
        ${lineage ? renderLineageSummary(lineage) : nothing}
        ${landscape ? renderFitnessChart(landscape) : nothing}
      </div>
    </div>
  `;
}

// ─── Network Graph (layered) ──────────────────────────────────────

function renderNetworkGraph(graph: NetworkGraph): TemplateResult {
  const { nodes, edges, topology, totalWeights } = graph;
  const maxLayer = topology.length - 1;
  const maxLayerSize = Math.max(...topology);
  const canvasW = 640;
  const canvasH = Math.max(320, maxLayerSize * 40 + 60);
  const layerSpacing = canvasW / (maxLayer + 1);

  // Build position lookup
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const layerSize = topology[node.layer];
    const x = layerSpacing * (node.layer + 0.5);
    const y = (canvasH / (layerSize + 1)) * (node.index + 1);
    positions.set(node.id, { x, y });
  }

  // Find max weight magnitude for normalization
  const maxMag = edges.reduce((m, e) => Math.max(m, e.magnitude), 0.001);

  return html`
    <div class="republic-card republic-card--neural-graph">
      <div class="republic-card__header">
        <h3>Neural Network Topology</h3>
        <span class="republic-badge">${totalWeights} weights</span>
      </div>
      <div class="republic-neural-canvas">
        <svg viewBox="0 0 ${canvasW} ${canvasH}" class="republic-neural-svg">
          <!-- Edges -->
          ${edges.map((e) => {
            const src = positions.get(e.source);
            const tgt = positions.get(e.target);
            if (!src || !tgt) {
              return nothing;
            }
            const norm = e.magnitude / maxMag;
            const opacity = 0.1 + norm * 0.8;
            const width = 0.5 + norm * 3;
            const color =
              e.weight >= 0 ? `rgba(99, 102, 241, ${opacity})` : `rgba(239, 68, 68, ${opacity})`;
            return svg`<line x1=${src.x} y1=${src.y} x2=${tgt.x} y2=${tgt.y}
              stroke=${color} stroke-width=${width} />`;
          })}
          <!-- Nodes -->
          ${nodes.map((n) => {
            const pos = positions.get(n.id);
            if (!pos) {
              return nothing;
            }
            const isInput = n.layer === 0;
            const isOutput = n.layer === maxLayer;
            const fill = isInput ? "#34d399" : isOutput ? "#f59e0b" : "#6366f1";
            const r = isInput || isOutput ? 10 : 7;
            return svg`
              <circle cx=${pos.x} cy=${pos.y} r=${r} fill=${fill} stroke="#1e1b4b" stroke-width="1.5">
                <title>${n.label}</title>
              </circle>`;
          })}
          <!-- Layer Labels -->
          ${topology.map((_, i) => {
            const x = layerSpacing * (i + 0.5);
            const label = i === 0 ? "Input" : i === maxLayer ? "Output" : `Hidden ${i}`;
            return svg`<text x=${x} y=${canvasH - 8} text-anchor="middle"
              font-size="11" fill="var(--muted)">${label} (${topology[i]})</text>`;
          })}
        </svg>
      </div>
      <div class="republic-neural-legend">
        <span><span style="color:#34d399">●</span> Input</span>
        <span><span style="color:#6366f1">●</span> Hidden</span>
        <span><span style="color:#f59e0b">●</span> Output</span>
        <span><span style="color:#6366f1">—</span> Positive weight</span>
        <span><span style="color:#ef4444">—</span> Negative weight</span>
      </div>
    </div>
  `;
}

// ─── DNA Stats Panel ──────────────────────────────────────────────

function renderDnaStats(dna: DnaStrand): TemplateResult {
  const { stats, weights, generation, fitness, genomeId } = dna;
  // Mini weight distribution bars
  const buckets = Array.from({ length: 20 }, () => 0);
  const maxW = stats.maxMagnitude || 1;
  for (const w of weights) {
    const idx = Math.min(19, Math.floor(w.normalizedMagnitude * 20));
    buckets[idx]++;
  }
  const maxBucket = Math.max(1, ...buckets);

  return html`
    <div class="republic-card republic-card--dna-stats">
      <div class="republic-card__header">
        <h3>DNA Analysis</h3>
        <span class="republic-badge">${dna.label}</span>
      </div>
      <div class="republic-metrics republic-metrics--compact">
        <div class="republic-metric"><span class="republic-metric__value">${genomeId.slice(0, 8)}</span><span class="republic-metric__label">ID</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${generation}</span><span class="republic-metric__label">Generation</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${fitness.toFixed(4)}</span><span class="republic-metric__label">Fitness</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${weights.length}</span><span class="republic-metric__label">Weights</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${stats.meanMagnitude.toFixed(4)}</span><span class="republic-metric__label">Mean |W|</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${stats.maxMagnitude.toFixed(4)}</span><span class="republic-metric__label">Max |W|</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${(stats.sparsity * 100).toFixed(1)}%</span><span class="republic-metric__label">Sparsity</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${stats.variance.toFixed(6)}</span><span class="republic-metric__label">Variance</span></div>
      </div>
      <div class="republic-dna-distribution">
        <h4>Weight Distribution</h4>
        <div class="republic-dna-bars">
          ${buckets.map(
            (count, i) => html`<div class="republic-dna-bar"
              style="height:${(count / maxBucket) * 100}%;background:hsl(${240 - i * 12},70%,60%)"
              title="${((i / 20) * maxW).toFixed(3)} - ${(((i + 1) / 20) * maxW).toFixed(3)}: ${count} weights">
            </div>`,
          )}
        </div>
      </div>
    </div>
  `;
}

// ─── Genome Pool Table ────────────────────────────────────────────

function renderGenomePool(genomes: GenomePoolEntry[]): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>Genome Pool</h3>
        <span class="republic-badge">${genomes.length} genomes</span>
      </div>
      <div class="republic-table-wrap">
        <table class="republic-table">
          <thead>
            <tr>
              <th>Label</th><th>Gen</th><th>Fitness</th><th>Weights</th><th>Parents</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${genomes.slice(0, 30).map(
              (g) => html`<tr>
                <td>${g.label}</td>
                <td>${g.generation}</td>
                <td class="${g.fitness > 0 ? "republic-text--success" : ""}">${g.fitness.toFixed(4)}</td>
                <td>${g.weightCount}</td>
                <td>${g.parentIds ? g.parentIds.length : "—"}</td>
                <td>${g.createdAt}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Lineage Summary ──────────────────────────────────────────────

function renderLineageSummary(tree: LineageTree): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>Lineage Tree</h3>
        <span class="republic-badge">${tree.nodes.length} nodes</span>
      </div>
      <div class="republic-metrics republic-metrics--compact">
        <div class="republic-metric"><span class="republic-metric__value">${tree.maxGeneration}</span><span class="republic-metric__label">Max Generation</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${tree.rootIds.length}</span><span class="republic-metric__label">Root Genomes</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${tree.nodes.filter((n) => n.childIds.length > 0).length}</span><span class="republic-metric__label">Parents</span></div>
        <div class="republic-metric"><span class="republic-metric__value">${tree.nodes.filter((n) => n.childIds.length === 0).length}</span><span class="republic-metric__label">Leaves</span></div>
      </div>
      <div class="republic-list">
        ${tree.rootIds.slice(0, 8).map((rootId) => {
          const root = tree.nodes.find((n) => n.id === rootId);
          if (!root) {
            return nothing;
          }
          return html`<div class="republic-list__item">
            <span class="republic-dot" style="background:#6366f1"></span>
            <div>
              <strong>${root.label}</strong>
              <span>Gen ${root.generation} → ${root.childIds.length} children, Fitness ${root.fitness.toFixed(4)}</span>
            </div>
          </div>`;
        })}
      </div>
    </div>
  `;
}

// ─── Fitness Chart ────────────────────────────────────────────────

function renderFitnessChart(landscape: FitnessLandscape): TemplateResult {
  const { points, maxFitness, minFitness, maxGeneration } = landscape;
  if (points.length === 0) {
    return html`
      <div class="republic-card"><p class="republic-card__empty">No fitness data yet</p></div>
    `;
  }

  const svgW = 400;
  const svgH = 200;
  const pad = 30;

  const fitnessRange = maxFitness - minFitness || 1;
  const genRange = maxGeneration || 1;

  const toX = (gen: number) => pad + (gen / genRange) * (svgW - 2 * pad);
  const toY = (fit: number) => svgH - pad - ((fit - minFitness) / fitnessRange) * (svgH - 2 * pad);

  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>Fitness Landscape</h3>
        <span class="republic-badge">${points.length} points</span>
      </div>
      <svg viewBox="0 0 ${svgW} ${svgH}" class="republic-fitness-svg">
        <!-- Axes -->
        <line x1=${pad} y1=${svgH - pad} x2=${svgW - pad} y2=${svgH - pad} stroke="#334155" stroke-width="1" />
        <line x1=${pad} y1=${pad} x2=${pad} y2=${svgH - pad} stroke="#334155" stroke-width="1" />
        <text x=${svgW / 2} y=${svgH - 5} text-anchor="middle" font-size="10" fill="var(--muted)">Generation</text>
        <text x="5" y=${svgH / 2} text-anchor="middle" font-size="10" fill="var(--muted)" transform="rotate(-90 10 ${svgH / 2})">Fitness</text>

        <!-- Data points -->
        ${points.map(
          (p) => html`<circle cx=${toX(p.generation)} cy=${toY(p.fitness)} r="3"
            fill="#6366f1" opacity="0.7">
            <title>${p.label}: Gen ${p.generation}, Fitness ${p.fitness.toFixed(4)}</title>
          </circle>`,
        )}
      </svg>
    </div>
  `;
}
