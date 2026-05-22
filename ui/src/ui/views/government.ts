import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export type BillStatus = "Proposed" | "InCommittee" | "OnFloor" | "Passed" | "Vetoed" | "Failed";
export type CaseStatus = "Filed" | "InProgress" | "Resolved" | "Appealed";
export type DepartmentType =
  | "Treasury"
  | "Defense"
  | "Commerce"
  | "Education"
  | "Health"
  | "Energy"
  | "Research"
  | "Infrastructure";

export interface Official {
  citizenId: string;
  role: string;
  department?: DepartmentType;
  appointedAt: number;
}

export interface Law {
  id: string;
  title: string;
  description: string;
  passedAt: number;
  sponsor: string;
}

export interface Bill {
  id: string;
  title: string;
  description: string;
  sponsor: string;
  status: BillStatus;
  proposedAt: number;
  votesFor: number;
  votesAgainst: number;
}

export interface CourtCase {
  id: string;
  plaintiff: string;
  defendant: string;
  description: string;
  status: CaseStatus;
  filedAt: number;
  verdict?: string;
}

export interface Department {
  type: DepartmentType;
  head: string | null;
  staffCount: number;
  budget: number;
  responsibilities: string[];
}

export interface ElectionInfo {
  id: string;
  position: string;
  candidates: string[];
  winner: string | null;
  totalVotes: number;
  heldAt: number;
}

export interface ConstitutionArticle {
  number: number;
  title: string;
  text: string;
  ratifiedAt: number;
}

export interface Constitution {
  preamble: string;
  articles: ConstitutionArticle[];
  totalAmendments: number;
  lawCount: number;
}

export interface GovernmentStatus {
  president: Official | null;
  cabinet: Official[];
  senators: number;
  representatives: number;
  laws: Law[];
  pendingBills: Bill[];
  cases: CourtCase[];
  departments: Department[];
  recentElections: ElectionInfo[];
  constitution?: Constitution;
  /** @deprecated — use constitution.totalAmendments */
  amendments?: number;
  /** @deprecated — use constitution.preamble */
  constitutionPreamble?: string;
}

export interface GovernmentProps {
  loading: boolean;
  status: GovernmentStatus | null;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onHoldElection: (position: string) => void;
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

function billStatusColor(status: BillStatus): string {
  const colors: Record<BillStatus, string> = {
    Proposed: "#6366f1",
    InCommittee: "#f59e0b",
    OnFloor: "#06b6d4",
    Passed: "#10b981",
    Vetoed: "#ef4444",
    Failed: "var(--muted)",
  };
  return colors[status];
}

function caseStatusColor(status: CaseStatus): string {
  const colors: Record<CaseStatus, string> = {
    Filed: "#6366f1",
    InProgress: "#f59e0b",
    Resolved: "#10b981",
    Appealed: "#ef4444",
  };
  return colors[status];
}

// ─── Render ───────────────────────────────────────────────────────

const GOV_SECTIONS = ["executive", "legislature", "judiciary", "departments", "elections"] as const;

export function renderGovernment(props: GovernmentProps): TemplateResult {
  const { loading, status } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading government data…</p>
      </div>
    `;
  }

  if (!status) {
    return html`
      <div class="republic-empty">
        <span class="republic-empty__icon">${icon("shield")}</span>
        <h3>Government Not Established</h3>
        <p>Start the simulation and elect your first president to establish the republic.</p>
        <button type="button" class="republic-btn" @click=${props.onRefresh}>Check Status</button>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-government">
      <!-- Constitution Banner -->
      <div class="republic-constitution">
        <div class="republic-constitution__icon">${icon("shield")}</div>
        <div class="republic-constitution__text">
          <h2>Constitution of the HoC Republic</h2>
          <p class="republic-constitution__preamble">${status?.constitution?.preamble ?? "No constitution established yet."}</p>
          <span class="republic-constitution__amendments">
            ${status.constitution?.totalAmendments ?? 0} Amendments Ratified
            ${status.constitution?.articles?.length ? html` · ${status.constitution.articles.length} Articles` : nothing}
            ${status.constitution?.lawCount ? html` · ${status.constitution.lawCount} Laws` : nothing}
          </span>
        </div>
      </div>

      ${
        status.constitution?.articles?.length
          ? html`
        <div class="republic-card republic-card--wide republic-card--animated">
          <div class="republic-card__header">
            <h3>📜 Constitutional Articles</h3>
            <span class="republic-badge">${status.constitution.articles.length} articles</span>
          </div>
          <div class="republic-list">
            ${status.constitution.articles.map(
              (a) => html`
              <div class="republic-list__item">
                <div>
                  <strong>Article ${a.number}: ${a.title}</strong>
                  <p style="margin:0.25rem 0 0;opacity:0.8;font-size:0.875rem">${a.text}</p>
                </div>
                <time style="font-size:0.75rem;opacity:0.5">Ratified ${new Date(a.ratifiedAt).toLocaleDateString()}</time>
              </div>
            `,
            )}
          </div>
        </div>
      `
          : nothing
      }

      <!-- Section Tabs -->
      <div class="republic-tabs" role="tablist" aria-label="Government sections">
        ${GOV_SECTIONS.map(
          (s) => html`
            <button type="button"
              role="tab"
              aria-selected=${props.activeSection === s}
              aria-controls="gov-section-${s}"
              class="republic-tabs__tab ${props.activeSection === s ? "republic-tabs__tab--active" : ""}"
              @click=${() => props.onSectionChange(s)}>
              ${s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          `,
        )}
      </div>

      <!-- Section Content -->
      <div class="republic-section" id="gov-section-${props.activeSection}" role="tabpanel">
        ${props.activeSection === "executive" ? renderExecutive(status) : nothing}
        ${props.activeSection === "legislature" ? renderLegislature(status) : nothing}
        ${props.activeSection === "judiciary" ? renderJudiciary(status) : nothing}
        ${props.activeSection === "departments" ? renderDepartments(status) : nothing}
        ${props.activeSection === "elections" ? renderElections(status, props) : nothing}
      </div>
    </div>
  `;
}

function renderExecutive(gov: GovernmentStatus): TemplateResult {
  return html`
    <div class="republic-cards">
      <div class="republic-card republic-card--featured">
        <div class="republic-card__header">
          <h3>President</h3>
          <span class="republic-tag republic-tag--gold">Executive</span>
        </div>
        ${
          gov.president
            ? html`
            <div class="republic-official">
              <div class="republic-official__avatar">🏛️</div>
              <div class="republic-official__info">
                <strong>${gov.president.role}</strong>
                <span>Since ${new Date(gov.president.appointedAt).toLocaleDateString()}</span>
              </div>
            </div>
          `
            : html`
                <p class="republic-card__empty">No president elected yet</p>
              `
        }
      </div>

      <div class="republic-card">
        <div class="republic-card__header">
          <h3>Cabinet</h3>
          <span class="republic-badge">${gov.cabinet.length} Members</span>
        </div>
        ${
          gov.cabinet.length > 0
            ? html`
            <div class="republic-list">
              ${gov.cabinet.map(
                (m) => html`
                  <div class="republic-list__item">
                    <span class="republic-list__title">${m.role}</span>
                    ${m.department ? html`<span class="republic-tag">${m.department}</span>` : nothing}
                  </div>
                `,
              )}
            </div>
          `
            : html`
                <p class="republic-card__empty">No cabinet members appointed</p>
              `
        }
      </div>
    </div>
  `;
}

function renderLegislature(gov: GovernmentStatus): TemplateResult {
  return html`
    <div class="republic-cards">
      <div class="republic-card">
        <div class="republic-card__header">
          <h3>Legislative Chambers</h3>
        </div>
        <div class="republic-metrics republic-metrics--compact">
          <div class="republic-metric">
            <div class="republic-metric__value">${gov.senators}</div>
            <div class="republic-metric__label">Senators</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${gov.representatives}</div>
            <div class="republic-metric__label">Representatives</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${gov.laws.length}</div>
            <div class="republic-metric__label">Laws Passed</div>
          </div>
        </div>
      </div>

      <div class="republic-card republic-card--wide">
        <div class="republic-card__header">
          <h3>Pending Bills</h3>
          <span class="republic-badge">${gov.pendingBills.length} Active</span>
        </div>
        ${
          gov.pendingBills.length > 0
            ? html`
            <div class="republic-pipeline">
              ${gov.pendingBills.map(
                (b) => html`
                  <div class="republic-pipeline__item">
                    <div class="republic-pipeline__status">
                      <span class="republic-dot" style="background:${billStatusColor(b.status)}"></span>
                      <span class="republic-pipeline__label">${b.status}</span>
                    </div>
                    <div class="republic-pipeline__body">
                      <strong>${b.title}</strong>
                      <p>${b.description}</p>
                      <div class="republic-pipeline__votes">
                        <span class="republic-vote republic-vote--for">✓ ${b.votesFor}</span>
                        <span class="republic-vote republic-vote--against">✗ ${b.votesAgainst}</span>
                      </div>
                    </div>
                  </div>
                `,
              )}
            </div>
          `
            : html`
                <p class="republic-card__empty">No pending bills</p>
              `
        }
      </div>

      <div class="republic-card republic-card--wide">
        <div class="republic-card__header">
          <h3>Enacted Laws</h3>
          <span class="republic-badge">${gov.laws.length}</span>
        </div>
        ${
          gov.laws.length > 0
            ? html`
            <div class="republic-list">
              ${gov.laws.length > 15 ? html`<div class="republic-list__item"><span class="republic-list__meta">${gov.laws.length - 15} more laws not shown</span></div>` : nothing}
              ${gov.laws.slice(0, 15).map(
                (l) => html`
                  <div class="republic-list__item">
                    <span class="republic-list__title">${l.title}</span>
                    <span class="republic-list__meta">${new Date(l.passedAt).toLocaleDateString()}</span>
                  </div>
                `,
              )}
            </div>
          `
            : html`
                <p class="republic-card__empty">No laws enacted yet</p>
              `
        }
      </div>
    </div>
  `;
}

function renderJudiciary(gov: GovernmentStatus): TemplateResult {
  return html`
    <div class="republic-cards">
      <div class="republic-card republic-card--wide">
        <div class="republic-card__header">
          <h3>Court Cases</h3>
          <span class="republic-badge">${gov.cases.length}</span>
        </div>
        ${
          gov.cases.length > 0
            ? html`
            <div class="republic-list">
              ${gov.cases.map(
                (c) => html`
                  <div class="republic-list__item republic-list__item--case">
                    <div class="republic-list__left">
                      <span class="republic-dot" style="background:${caseStatusColor(c.status)}"></span>
                      <div>
                        <strong>${c.plaintiff} vs ${c.defendant}</strong>
                        <p>${c.description}</p>
                      </div>
                    </div>
                    <div class="republic-list__right">
                      <span class="republic-tag">${c.status}</span>
                      ${c.verdict ? html`<span class="republic-verdict">${c.verdict}</span>` : nothing}
                    </div>
                  </div>
                `,
              )}
            </div>
          `
            : html`
                <p class="republic-card__empty">No cases filed yet</p>
              `
        }
      </div>
    </div>
  `;
}

function renderDepartments(gov: GovernmentStatus): TemplateResult {
  return html`
    <div class="republic-dept-grid">
      ${gov.departments.map(
        (d) => html`
          <div class="republic-dept">
            <div class="republic-dept__header">
              <h4>${d.type}</h4>
              ${
                d.head
                  ? html`
                      <span class="republic-tag republic-tag--sm">Led</span>
                    `
                  : nothing
              }
            </div>
            <div class="republic-dept__stats">
              <span>${d.staffCount} staff</span>
              <span>${formatBudget(d.budget)}</span>
            </div>
            <ul class="republic-dept__duties">
              ${d.responsibilities.slice(0, 3).map((r) => html`<li>${r}</li>`)}
            </ul>
          </div>
        `,
      )}
    </div>
  `;
}

function renderElections(gov: GovernmentStatus, props: GovernmentProps): TemplateResult {
  return html`
    <div class="republic-cards">
      <div class="republic-card">
        <div class="republic-card__header">
          <h3>Hold Election</h3>
        </div>
        <div class="republic-election-controls">
          <button type="button" class="republic-btn" @click=${() => props.onHoldElection("President")}>
            🗳️ Presidential Election
          </button>
          <button type="button" class="republic-btn republic-btn--secondary" @click=${() => props.onHoldElection("Senate")}>
            🗳️ Senate Election
          </button>
        </div>
      </div>

      <div class="republic-card republic-card--wide">
        <div class="republic-card__header">
          <h3>Election History</h3>
        </div>
        ${
          gov.recentElections.length > 0
            ? html`
            <div class="republic-list">
              ${gov.recentElections.map(
                (e) => html`
                  <div class="republic-list__item">
                    <strong>${e.position}</strong>
                    <span>${e.candidates.length} candidates · ${e.totalVotes} votes</span>
                    ${e.winner ? html`<span class="republic-tag republic-tag--gold">Winner: ${e.winner}</span>` : nothing}
                    <time>${new Date(e.heldAt).toLocaleDateString()}</time>
                  </div>
                `,
              )}
            </div>
          `
            : html`
                <p class="republic-card__empty">No elections held yet</p>
              `
        }
      </div>
    </div>
  `;
}

function formatBudget(n: number): string {
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `$${(n / 1_000).toFixed(1)}K`;
  }
  return `$${n.toFixed(0)}`;
}
