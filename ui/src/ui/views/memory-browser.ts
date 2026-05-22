import { html, nothing, type TemplateResult } from "lit";
import { paginate, getPage, setPage, renderPaginationControls } from "./pagination.js";
import type {
  CitizenMemoryView,
  CollectiveEntry,
  EpisodicMemory,
  SemanticMemory,
  Relationship,
  CitizenSummary,
} from "../republic-types.ts";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export type MemorySection = "episodic" | "semantic" | "relationships" | "collective";

export interface MemoryBrowserProps {
  loading: boolean;
  memory: CitizenMemoryView | null;
  collective: CollectiveEntry[];
  citizenId: string | null;
  citizens: CitizenSummary[];
  activeSection: MemorySection;
  searchQuery: string;
  onSectionChange: (section: MemorySection) => void;
  onCitizenChange: (id: string) => void;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  expandedMemoryId?: string | null;
  onToggleMemory: (id: string) => void;
}

/** Client-side memory filter */
function filterByQuery<T extends object>(items: T[], query: string): T[] {
  if (!query.trim()) {
    return items;
  }
  const lower = query.toLowerCase();
  return items.filter((item) => {
    const text = JSON.stringify(item).toLowerCase();
    return text.includes(lower);
  });
}

// ─── Main Render ──────────────────────────────────────────────────

export function renderMemoryBrowser(props: MemoryBrowserProps): TemplateResult {
  const { loading, memory, collective, citizenId, citizens, activeSection, searchQuery } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading memory banks…</p>
      </div>
    `;
  }

  // Apply search filter to all memory types
  const filteredEpisodic = filterByQuery(memory?.episodic ?? [], searchQuery);
  const filteredSemantic = filterByQuery(memory?.semantic ?? [], searchQuery);
  const filteredRels = filterByQuery(memory?.relationships ?? [], searchQuery);
  const filteredCollective = filterByQuery(collective, searchQuery);

  const sections: { key: MemorySection; label: string; count: number }[] = [
    { key: "episodic", label: "Episodic", count: filteredEpisodic.length },
    { key: "semantic", label: "Semantic", count: filteredSemantic.length },
    { key: "relationships", label: "Relationships", count: filteredRels.length },
    { key: "collective", label: "Collective", count: filteredCollective.length },
  ];

  const totalMemories =
    filteredEpisodic.length +
    filteredSemantic.length +
    filteredRels.length +
    filteredCollective.length;

  return html`
    <div class="republic-view republic-memory">
      <!-- Hero -->
      <div class="republic-hero republic-hero--memory">
        <div class="republic-hero__header">
          <h2 class="republic-hero__title">${icon("brain")} Memory Browser</h2>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="republic-badge">${totalMemories} memories</span>
            <button type="button" class="republic-btn republic-btn--sm" @click=${props.onRefresh}>↻ Refresh</button>
          </div>
        </div>

        <!-- Search + Citizen Selection -->
        <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
          <div class="republic-memory-citizen" style="flex:1;min-width:200px;">
            <label>Citizen:</label>
            <input type="text" class="republic-input republic-input--sm"
              list="citizens-list"
              .value=${citizenId ?? ""}
              placeholder="Search citizen ID or name…"
              @change=${(e: Event) => props.onCitizenChange((e.target as HTMLInputElement).value)} />
            <datalist id="citizens-list">
              ${citizens.map((c) => html`<option value=${c.id}>Generation ${c.generation} ${c.specialization}</option>`)}
            </datalist>
          </div>
          <div style="flex:1;min-width:200px;">
            <label style="color:var(--muted,#94a3b8);font-size:12px;">🔍 Search memories:</label>
            <input type="text" class="republic-input republic-input--sm"
              .value=${searchQuery}
              placeholder="Filter by keyword…"
              @input=${(e: Event) => props.onSearchChange((e.target as HTMLInputElement).value)} />
          </div>
        </div>
      </div>

      <!-- Tab Bar -->
      <div class="republic-tabs">
        ${sections.map(
          (s) => html`<button type="button"
            class="republic-tabs__tab ${activeSection === s.key ? "republic-tabs__tab--active" : ""}"
            @click=${() => props.onSectionChange(s.key)}>
            ${s.label}
            <span class="republic-badge republic-badge--sm">${s.count}</span>
          </button>`,
        )}
      </div>

      <!-- Content -->
      ${activeSection === "episodic" ? renderEpisodic(filteredEpisodic, props) : nothing}
      ${activeSection === "semantic" ? renderSemantic(filteredSemantic, props) : nothing}
      ${activeSection === "relationships" ? renderRelationships(filteredRels) : nothing}
      ${activeSection === "collective" ? renderCollective(filteredCollective, props) : nothing}
    </div>
  `;
}

// ─── Episodic ─────────────────────────────────────────────────────

function renderEpisodic(memories: EpisodicMemory[], props: MemoryBrowserProps): TemplateResult {
  if (memories.length === 0) {
    return html`
      <div class="republic-card"><p class="republic-card__empty">No episodic memories</p></div>
    `;
  }
  const paged = paginate(memories, getPage("mem-episodic"), 25);
  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header"><h3>Episodic Memories</h3></div>
      <div class="republic-list">
        ${paged.items.map(
          (m, i) => {
            const globalIdx = paged.page * paged.pageSize + i;
            return html`
            <div class="republic-list__item" style="cursor:pointer;flex-wrap:wrap" @click=${() => props.onToggleMemory(`episodic-${globalIdx}`)}>
              <div style="display:flex;width:100%;align-items:center;">
                <span class="republic-dot" style="background:hsl(${Math.round(m.importance * 120)},70%,50%); box-shadow: 0 0 8px hsl(${Math.round(m.importance * 120)},70%,50%)"></span>
                <div class="republic-list__left">
                  <div class="republic-list__title">Tick ${m.tick}</div>
                  <div class="republic-list__meta">${m.description}</div>
                </div>
                <div class="republic-list__right">
                  <span class="republic-badge" title="Importance">★ ${m.importance.toFixed(2)}</span>
                  <span class="republic-badge" title="Valence">${m.valence >= 0 ? "😊" : "😟"} ${m.valence.toFixed(2)}</span>
                </div>
              </div>
              ${
                props.expandedMemoryId === `episodic-${globalIdx}`
                  ? html`
                <div style="width:100%;margin-top:12px;padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;font-size:13px;color:var(--text-strong);line-height:1.5;">
                  <strong>Context:</strong> ${(m as unknown as { context?: string }).context || "No contextual context logged."}<br/>
                  <strong>Full Record:</strong> ${JSON.stringify(m, null, 2)}
                </div>
              `
                  : nothing
              }
            </div>
          `;
          },
        )}
      </div>
      ${renderPaginationControls(paged.page, paged.totalPages, (p) => setPage("mem-episodic", p), { totalItems: paged.totalItems })}
    </div>
  `;
}

// ─── Semantic ─────────────────────────────────────────────────────

function renderSemantic(memories: SemanticMemory[], props: MemoryBrowserProps): TemplateResult {
  if (memories.length === 0) {
    return html`
      <div class="republic-card"><p class="republic-card__empty">No semantic memories</p></div>
    `;
  }

  const byDomain = new Map<string, SemanticMemory[]>();
  for (const m of memories) {
    const d = m.domain || "General";
    if (!byDomain.has(d)) {
      byDomain.set(d, []);
    }
    byDomain.get(d)!.push(m);
  }

  return html`
    ${[...byDomain.entries()].map(
      ([domain, list]) => html`
        <div class="republic-card republic-card--wide">
          <div class="republic-card__header">
            <h3>${domain}</h3>
            <span class="republic-badge">${list.length} concepts</span>
          </div>
          <div class="republic-table-wrap">
            <table class="republic-table">
              <thead><tr><th>Concept</th><th>Confidence</th><th>Learned</th></tr></thead>
              <tbody>
                ${list.map(
                  (
                    m,
                    i,
                  ) => html`<tr style="cursor:pointer" @click=${() => props.onToggleMemory(`semantic-${domain}-${i}`)}>
                    <td>${m.concept}</td>
                    <td>
                      <div class="republic-gauge republic-gauge--sm">
                        <div class="republic-gauge__fill republic-gauge__fill--info" style="width:${Math.round(m.confidence * 100)}%"></div>
                      </div>
                      ${(m.confidence * 100).toFixed(0)}%
                    </td>
                    <td>Tick ${m.learnedAt}</td>
                  </tr>
                  ${
                    props.expandedMemoryId === `semantic-${domain}-${i}`
                      ? html`
                    <tr>
                      <td colspan="3" style="padding:12px;background:rgba(255,255,255,0.05);font-size:13px;color:var(--text-strong);">
                        <strong>Full Record:</strong> <pre style="margin:4px 0 0 0;white-space:pre-wrap">${JSON.stringify(m, null, 2)}</pre>
                      </td>
                    </tr>
                  `
                      : nothing
                  }
                  `,
                )}
              </tbody>
            </table>
          </div>
        </div>
      `,
    )}
  `;
}

// ─── Relationships ────────────────────────────────────────────────

function renderRelationships(rels: Relationship[]): TemplateResult {
  if (rels.length === 0) {
    return html`
      <div class="republic-card"><p class="republic-card__empty">No relationships</p></div>
    `;
  }

  const paged = paginate(rels, getPage("mem-rels"), 25);

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header"><h3>Social Relationships</h3></div>
      <div class="republic-table-wrap">
        <table class="republic-table">
          <thead><tr><th>Citizen</th><th>Trust</th><th>Interactions</th><th>Last</th></tr></thead>
          <tbody>
            ${paged.items.map(
              (r) => html`<tr>
                <td>${r.citizenId}</td>
                <td>
                  <span class="${r.trust >= 0 ? "republic-text--success" : "republic-text--danger"}">${r.trust.toFixed(2)}</span>
                </td>
                <td>${r.interactions}</td>
                <td>Tick ${r.lastInteraction}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
      ${renderPaginationControls(paged.page, paged.totalPages, (p) => setPage("mem-rels", p), { totalItems: paged.totalItems })}
    </div>
  `;
}

// ─── Collective ───────────────────────────────────────────────────

function renderCollective(entries: CollectiveEntry[], props: MemoryBrowserProps): TemplateResult {
  if (entries.length === 0) {
    return html`
      <div class="republic-card"><p class="republic-card__empty">No collective memories</p></div>
    `;
  }
  const paged = paginate(entries, getPage("mem-collective"), 25);
  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header"><h3>Collective Memory</h3></div>
      <div class="republic-list">
        ${paged.items.map(
          (
            e,
            i,
          ) => {
            const globalIdx = paged.page * paged.pageSize + i;
            return html`<div class="republic-list__item" style="cursor:pointer;flex-wrap:wrap" @click=${() => props.onToggleMemory(`collective-${globalIdx}`)}>
            <div style="display:flex;width:100%;align-items:center;">
              <span class="republic-badge">${e.type}</span>
              <div class="republic-list__left">
                <div class="republic-list__title">${e.content}</div>
              </div>
              <div class="republic-list__right">
                <span class="republic-badge republic-tag--gold">★ ${e.importance.toFixed(2)}</span>
              </div>
            </div>
            ${
              props.expandedMemoryId === `collective-${globalIdx}`
                ? html`
              <div style="width:100%;margin-top:12px;padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;font-size:13px;color:var(--text-strong);line-height:1.5;">
                <strong>Full Record:</strong> ${JSON.stringify(e, null, 2)}
              </div>
            `
                : nothing
            }
          </div>`;
          },
        )}
      </div>
      ${renderPaginationControls(paged.page, paged.totalPages, (p) => setPage("mem-collective", p), { totalItems: paged.totalItems })}
    </div>
  `;
}
