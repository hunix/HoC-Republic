// oxlint-disable-next-line no-unused-vars
import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";
import { paginate, getPage, setPage, renderPaginationControls } from "./pagination.js";

// ─── Types ────────────────────────────────────────────────────────

export type Currency = "USD" | "BTC" | "ETH" | "Credits";
export type ResourceType = "ComputeHours" | "StorageGB" | "BandwidthGB" | "APICredits";
export type TransactionType =
  | "TaxCollection"
  | "ResourcePurchase"
  | "Salary"
  | "Trade"
  | "Investment"
  | "Donation";
export type HarvesterType = "Microwork" | "APIService" | "CryptoMining";

export interface CurrencyBalance {
  currency: Currency;
  balance: number;
  change24h: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  timestamp: number;
}

export interface HarvesterStatus {
  type: HarvesterType;
  enabled: boolean;
  earning: number;
  earningCurrency: Currency;
  tasksCompleted: number;
  successRate: number;
  lastHarvest: number;
}

export interface ResourceCost {
  resource: ResourceType;
  unitCost: number;
  available: number;
  consumed: number;
}

export interface TreasuryReport {
  balances: CurrencyBalance[];
  totalValueUSD: number;
  taxRate: number;
  recentTransactions: Transaction[];
  harvesters: HarvesterStatus[];
  resources: ResourceCost[];
  dailyRevenue: number;
  dailyExpenses: number;
}

export interface EconomyProps {
  loading: boolean;
  treasury: TreasuryReport | null;
  onToggleHarvester: (type: HarvesterType, enabled: boolean) => void;
  onAdjustTaxRate: (rate: number) => void;
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

function currencyIcon(c: Currency): string {
  const map: Record<Currency, string> = { USD: "💵", BTC: "₿", ETH: "⟠", Credits: "🪙" };
  return map[c];
}

function currencyFormat(amount: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${(amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === "BTC") {
    return `${(amount ?? 0).toFixed(8)} BTC`;
  }
  if (currency === "ETH") {
    return `${(amount ?? 0).toFixed(6)} ETH`;
  }
  return `${(amount ?? 0).toLocaleString()} ¤`;
}

function changeIndicator(change: number): TemplateResult {
  if (change > 0) {
    return html`<span class="republic-change republic-change--up">▲ ${change.toFixed(1)}%</span>`;
  }
  if (change < 0) {
    return html`<span class="republic-change republic-change--down">▼ ${Math.abs(change).toFixed(1)}%</span>`;
  }
  return html`
    <span class="republic-change republic-change--flat">━ 0%</span>
  `;
}

function txTypeIcon(type: TransactionType): string {
  const map: Record<TransactionType, string> = {
    TaxCollection: "🏛️",
    ResourcePurchase: "📦",
    Salary: "💰",
    Trade: "🔄",
    Investment: "📈",
    Donation: "🎁",
  };
  return map[type];
}

// ─── Render ───────────────────────────────────────────────────────

export function renderEconomy(props: EconomyProps): TemplateResult {
  const { loading, treasury } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading economy data…</p>
      </div>
    `;
  }

  if (!treasury) {
    return html`
      <div class="republic-empty">
        <span class="republic-empty__icon">${icon("dollarSign")}</span>
        <h3>Treasury Not Initialized</h3>
        <p>The economy engine hasn't been started. Initialize the simulation to generate economic activity.</p>
        <button type="button" class="republic-btn" @click=${props.onRefresh}>Check Status</button>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-economy">
      <!-- Treasury Hero -->
      ${renderTreasuryHero(treasury)}

      <!-- Revenue & Expenses -->
      ${renderRevenuePanel(treasury)}

      <!-- Resource Harvesters -->
      ${renderHarvesters(treasury, props)}

      <!-- Resources & Costs -->
      ${renderResources(treasury)}

      <!-- Transaction History -->
      ${renderTransactions(treasury)}
    </div>
  `;
}

function renderTreasuryHero(t: TreasuryReport): TemplateResult {
  return html`
    <div class="republic-hero republic-hero--economy">
      <div class="republic-hero__header">
        <h2 class="republic-hero__title">${icon("dollarSign")} National Treasury</h2>
        <span class="republic-hero__badge republic-hero__badge--lg">
          ${currencyFormat(t.totalValueUSD, "USD")} Total
        </span>
      </div>

      <div class="republic-balances">
        ${t.balances.map(
          (b) => html`
            <div class="republic-balance">
              <div class="republic-balance__icon">${currencyIcon(b.currency)}</div>
              <div class="republic-balance__info">
                <div class="republic-balance__amount">${currencyFormat(b.balance, b.currency)}</div>
                <div class="republic-balance__label">${b.currency}</div>
              </div>
              ${changeIndicator(b.change24h)}
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderRevenuePanel(t: TreasuryReport): TemplateResult {
  const net = t.dailyRevenue - t.dailyExpenses;
  return html`
    <div class="republic-cards republic-cards--three">
      <div class="republic-card">
        <div class="republic-card__header"><h3>Daily Revenue</h3></div>
        <div class="republic-metric republic-metric--lg">
          <div class="republic-metric__value republic-metric__value--green">${currencyFormat(t.dailyRevenue, "USD")}</div>
        </div>
      </div>
      <div class="republic-card">
        <div class="republic-card__header"><h3>Daily Expenses</h3></div>
        <div class="republic-metric republic-metric--lg">
          <div class="republic-metric__value republic-metric__value--red">${currencyFormat(t.dailyExpenses, "USD")}</div>
        </div>
      </div>
      <div class="republic-card">
        <div class="republic-card__header"><h3>Net Flow</h3></div>
        <div class="republic-metric republic-metric--lg">
          <div class="republic-metric__value ${net >= 0 ? "republic-metric__value--green" : "republic-metric__value--red"}">
            ${net >= 0 ? "+" : ""}${currencyFormat(net, "USD")}
          </div>
        </div>
      </div>
    </div>

    <!-- Tax Rate -->
    <div class="republic-card republic-card--compact">
      <div class="republic-card__header">
        <h3>Tax Rate</h3>
        <span class="republic-badge">${(t.taxRate * 100).toFixed(1)}%</span>
      </div>
      <div class="republic-tax-bar">
        <div class="republic-tax-bar__fill" style="width:${t.taxRate * 100}%"></div>
      </div>
    </div>
  `;
}

function renderHarvesters(t: TreasuryReport, props: EconomyProps): TemplateResult {
  return html`
    <div class="republic-section-header">
      <h3>Resource Harvesters</h3>
    </div>
    <div class="republic-harvesters">
      ${t.harvesters.map(
        (h) => html`
          <div class="republic-harvester ${h.enabled ? "republic-harvester--active" : "republic-harvester--disabled"}">
            <div class="republic-harvester__header">
              <h4>${h.type}</h4>
              <label class="republic-toggle">
                <input type="checkbox" ?checked=${h.enabled}
                  @change=${(e: Event) => props.onToggleHarvester(h.type, (e.target as HTMLInputElement).checked)} />
                <span class="republic-toggle__slider"></span>
              </label>
            </div>
            <div class="republic-harvester__stats">
              <div class="republic-harvester__stat">
                <span class="republic-harvester__label">Earning</span>
                <span class="republic-harvester__value">${currencyFormat(h.earning, h.earningCurrency)}/hr</span>
              </div>
              <div class="republic-harvester__stat">
                <span class="republic-harvester__label">Tasks Done</span>
                <span class="republic-harvester__value">${h.tasksCompleted.toLocaleString()}</span>
              </div>
              <div class="republic-harvester__stat">
                <span class="republic-harvester__label">Success</span>
                <span class="republic-harvester__value">${(h.successRate * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function renderResources(t: TreasuryReport): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>Resources</h3>
      </div>
      <div class="republic-resource-grid">
        ${t.resources.map((r) => {
          const usage = r.available > 0 ? (r.consumed / r.available) * 100 : 0;
          return html`
              <div class="republic-resource">
                <div class="republic-resource__name">${r.resource}</div>
                <div class="republic-resource__bar">
                  <div class="republic-resource__fill" style="width:${usage}%"></div>
                </div>
                <div class="republic-resource__info">
                  <span>${r.consumed.toLocaleString()} / ${r.available.toLocaleString()}</span>
                  <span>${currencyFormat(r.unitCost, "USD")}/unit</span>
                </div>
              </div>
            `;
        })}
      </div>
    </div>
  `;
}

function renderTransactions(t: TreasuryReport): TemplateResult {
  if (t.recentTransactions.length === 0) {
    return html``;
  }

  const paged = paginate(t.recentTransactions, getPage("econ-tx"), 20);

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>Recent Transactions</h3>
        <span class="republic-badge">${t.recentTransactions.length}</span>
      </div>
      <div class="republic-tx-list">
        ${paged.items.map(
          (tx) => html`
            <div class="republic-tx">
              <span class="republic-tx__icon">${txTypeIcon(tx.type)}</span>
              <div class="republic-tx__body">
                <strong>${tx.type}</strong>
                <span>${tx.description}</span>
              </div>
              <div class="republic-tx__amount ${tx.type === "TaxCollection" || tx.type === "Trade" ? "republic-tx__amount--in" : "republic-tx__amount--out"}">
                ${tx.type === "TaxCollection" ? "+" : "-"}${currencyFormat(tx.amount, tx.currency)}
              </div>
              <time class="republic-tx__time">${new Date(tx.timestamp).toLocaleTimeString()}</time>
            </div>
          `,
        )}
      </div>
      ${renderPaginationControls(paged.page, paged.totalPages, (p) => setPage("econ-tx", p), { totalItems: paged.totalItems })}
    </div>
  `;
}
