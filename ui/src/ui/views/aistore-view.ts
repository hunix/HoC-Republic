/**
 * AIStore — AI Citizen Marketplace View
 *
 * A fully-featured marketplace for browsing, searching, and purchasing
 * digital products created by AI citizens. Features:
 * - Responsive product grid with category filtering
 * - Real-time search across titles, descriptions, and creators
 * - Sort by price, rating, newest
 * - Star ratings and review counts
 * - Category-colored product cards with emoji thumbnails
 * - Skeleton loading states
 * - Pagination
 * - Gallery and analytics tabs
 *
 * Architecture: Pure render functions, single template return,
 * no early returns or template switching (bulletproof Lit compatibility).
 */

import { html, nothing, type TemplateResult } from "lit";
import "./aistore.css";

// ─── Domain Types ────────────────────────────────────────────────

export interface Listing {
  id: string;
  citizenId: string;
  citizenName: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  visibility: "public" | "internal" | "both";
  rating: number;
  reviewCount: number;
  createdAt: string;
  active: boolean;
  /** Path relative to repo root, e.g. republic-output/music/abc.wav */
  filePath?: string;
  outputId?: string;
  fileSize?: number;
}

export interface Production {
  id?: string;
  category: string;
  title: string;
  creatorName: string;
  creatorId: string;
  filename: string;
  tick: number;
  timestamp: string;
  fileSize?: number;
}

export interface MarketplaceDiagnostics {
  totalListings: number;
  activeListings: number;
  publicListings: number;
  internalListings: number;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  publicEnabled: boolean;
  internalEnabled: boolean;
}

export interface AIStoreProps {
  loading: boolean;
  listings: Listing[];
  productions: Production[];
  diagnostics: MarketplaceDiagnostics | null;
  activeTab: "listings" | "gallery" | "stats";
  selectedCategory: string | null;
  searchQuery: string;
  sortBy: string;
  onTabChange: (tab: "listings" | "gallery" | "stats") => void;
  onCategorySelect: (cat: string | null) => void;
  onRefresh: () => void;
}

// ─── Constants ───────────────────────────────────────────────────

const PAGE_SIZE = 24;

const CATEGORY_META: Record<string, { emoji: string; color: string; gradient: string }> = {
  art: { emoji: "🖼️", color: "#818cf8", gradient: "linear-gradient(135deg, #6366f1, #818cf8)" },
  music: { emoji: "🎵", color: "#f472b6", gradient: "linear-gradient(135deg, #ec4899, #f472b6)" },
  video: { emoji: "🎬", color: "#fb923c", gradient: "linear-gradient(135deg, #f97316, #fb923c)" },
  code: { emoji: "💻", color: "#34d399", gradient: "linear-gradient(135deg, #10b981, #34d399)" },
  games: { emoji: "🎮", color: "#f87171", gradient: "linear-gradient(135deg, #ef4444, #f87171)" },
  websites: {
    emoji: "🌐",
    color: "#60a5fa",
    gradient: "linear-gradient(135deg, #3b82f6, #60a5fa)",
  },
  research: {
    emoji: "🔬",
    color: "#a78bfa",
    gradient: "linear-gradient(135deg, #8b5cf6, #a78bfa)",
  },
  screenplays: {
    emoji: "🎭",
    color: "#fbbf24",
    gradient: "linear-gradient(135deg, #f59e0b, #fbbf24)",
  },
  "3d-models": {
    emoji: "🧊",
    color: "#2dd4bf",
    gradient: "linear-gradient(135deg, #14b8a6, #2dd4bf)",
  },
  designs: { emoji: "✏️", color: "#c084fc", gradient: "linear-gradient(135deg, #a855f7, #c084fc)" },
  podcasts: {
    emoji: "🎙️",
    color: "#fb7185",
    gradient: "linear-gradient(135deg, #f43f5e, #fb7185)",
  },
  inventions: {
    emoji: "💡",
    color: "#fcd34d",
    gradient: "linear-gradient(135deg, #eab308, #fcd34d)",
  },
  "ml-models": {
    emoji: "🧠",
    color: "#38bdf8",
    gradient: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
  },
  datasets: {
    emoji: "📊",
    color: "#4ade80",
    gradient: "linear-gradient(135deg, #22c55e, #4ade80)",
  },
  docs: { emoji: "📄", color: "#94a3b8", gradient: "linear-gradient(135deg, #64748b, #94a3b8)" },
  journals: {
    emoji: "📓",
    color: "#a3e635",
    gradient: "linear-gradient(135deg, #84cc16, #a3e635)",
  },
  dreams: { emoji: "🌙", color: "#c4b5fd", gradient: "linear-gradient(135deg, #a78bfa, #c4b5fd)" },
  chronicles: {
    emoji: "📜",
    color: "#fdba74",
    gradient: "linear-gradient(135deg, #fb923c, #fdba74)",
  },
  evolution: {
    emoji: "🧬",
    color: "#6ee7b7",
    gradient: "linear-gradient(135deg, #34d399, #6ee7b7)",
  },
  ads: { emoji: "📢", color: "#fcd34d", gradient: "linear-gradient(135deg, #fbbf24, #fcd34d)" },
};

function getCatMeta(cat: string) {
  return (
    CATEGORY_META[cat] ?? {
      emoji: "📦",
      color: "#94a3b8",
      gradient: "linear-gradient(135deg, #64748b, #94a3b8)",
    }
  );
}

// ─── Module-level pagination state ───────────────────────────────
let _currentPage = 0;
let _searchQuery = "";
let _sortBy = "newest";
let _selectedListing: Listing | null = null;

// Pre-computed waveform heights (never re-random on each render)
// 40 bars: sin wave + fixed pseudo-random, computed ONCE at module load
const WAVEFORM_BARS: number[] = Array.from({ length: 40 }, (_, i) => {
  // Use a deterministic pseudo-random via golden ratio
  const pseudo = (i * 0.6180339887) % 1;
  return Math.round(10 + Math.sin(i * 0.5) * 20 + pseudo * 18);
});

/** Reset all module-level state — call when navigating away from AI Store */
export function resetAIStoreState(): void {
  _selectedListing = null;
  _currentPage = 0;
  _searchQuery = "";
  _sortBy = "newest";
}

function requestAppUpdate(): void {
  const host = document.querySelector("hoc-app");
  if (host && "requestUpdate" in host) {
    (host as unknown as { requestUpdate: () => void }).requestUpdate();
  }
}

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

// ─── Main Render ─────────────────────────────────────────────────

export function renderAIStore(props: AIStoreProps): TemplateResult {
  const { loading, listings, productions, diagnostics, activeTab, onTabChange, onRefresh } = props;
  const selectedCategory = props.selectedCategory;
  const hasData = listings.length > 0 || diagnostics !== null;

  // If a product is selected, show its detail page
  if (_selectedListing) {
    return html`
      <div class="aistore">
        ${renderProductDetail(_selectedListing)}
      </div>
    `;
  }

  return html`
    <div class="aistore">
      ${renderHero(diagnostics, listings, loading, onRefresh)}
      ${renderTabs(activeTab, onTabChange)}
      ${loading && !hasData ? renderSkeletons() : nothing}
      ${!loading && !hasData ? renderEmpty(onRefresh) : nothing}
      ${hasData && activeTab === "listings" ? renderListingsTab(listings, productions, selectedCategory, props.onCategorySelect) : nothing}
      ${hasData && activeTab === "gallery" ? renderGalleryTab(listings) : nothing}
      ${hasData && activeTab === "stats" ? renderStatsTab(diagnostics, listings) : nothing}
    </div>
  `;
}

// ─── Hero ────────────────────────────────────────────────────────

function renderHero(
  diag: MarketplaceDiagnostics | null,
  listings: Listing[],
  loading: boolean,
  onRefresh: () => void,
): TemplateResult {
  const totalProducts = diag?.activeListings ?? listings.length;
  const totalOrders = diag?.completedOrders ?? 0;
  const avgRating =
    listings.length > 0
      ? (listings.reduce((s, l) => s + l.rating, 0) / listings.length).toFixed(1)
      : "0.0";
  const categories = new Set(listings.map((l) => l.category)).size;

  return html`
    <div class="aistore-hero">
      <div class="aistore-hero__inner">
        <div>
          <h1 class="aistore-hero__title">🏪 AIStore</h1>
          <p class="aistore-hero__subtitle">AI-crafted digital products by autonomous citizens</p>
        </div>
        <div class="aistore-hero__stats">
          <div class="aistore-hero__stat">
            <div class="aistore-hero__stat-value">${totalProducts}</div>
            <div class="aistore-hero__stat-label">Products</div>
          </div>
          <div class="aistore-hero__stat">
            <div class="aistore-hero__stat-value">${totalOrders}</div>
            <div class="aistore-hero__stat-label">Sales</div>
          </div>
          <div class="aistore-hero__stat">
            <div class="aistore-hero__stat-value">${avgRating}</div>
            <div class="aistore-hero__stat-label">Avg Rating</div>
          </div>
          <div class="aistore-hero__stat">
            <div class="aistore-hero__stat-value">${categories}</div>
            <div class="aistore-hero__stat-label">Categories</div>
          </div>
        </div>
        <div class="aistore-hero__actions">
          <button type="button" class="aistore-hero__btn" @click=${onRefresh} ?disabled=${loading}>
            ${loading ? "⏳" : "↻"} Refresh
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Tabs ────────────────────────────────────────────────────────

function renderTabs(
  active: "listings" | "gallery" | "stats",
  onChange: (tab: "listings" | "gallery" | "stats") => void,
): TemplateResult {
  const tabs = [
    { id: "listings" as const, label: "🛒 Products" },
    { id: "gallery" as const, label: "🎨 Gallery" },
    { id: "stats" as const, label: "📊 Analytics" },
  ];
  return html`
    <div class="aistore-tabs">
      ${tabs.map(
        (t) => html`
        <button type="button"
          class="aistore-tabs__tab ${active === t.id ? "aistore-tabs__tab--active" : ""}"
          @click=${() => onChange(t.id)}
        >${t.label}</button>
      `,
      )}
    </div>
  `;
}

// ─── Skeletons ───────────────────────────────────────────────────

function renderSkeletons(): TemplateResult {
  return html`
    <div class="aistore-skeleton-grid">
      ${Array.from(
        { length: 8 },
        () => html`
          <div class="aistore-skeleton-card">
            <div class="aistore-skeleton-card__bar"></div>
          </div>
        `,
      )}
    </div>
  `;
}

// ─── Empty State ─────────────────────────────────────────────────

function renderEmpty(onRefresh: () => void): TemplateResult {
  return html`
    <div class="aistore-empty">
      <div class="aistore-empty__icon">🏪</div>
      <h3 class="aistore-empty__title">AIStore Awaiting Products</h3>
      <p class="aistore-empty__desc">
        Start the Republic simulation to populate the store with citizen-created
        digital products — art, music, code, ML models, and more.
      </p>
      <button type="button" class="aistore-empty__btn" @click=${onRefresh}>↻ Refresh Store</button>
    </div>
  `;
}

// ─── Listings Tab ────────────────────────────────────────────────

function renderListingsTab(
  listings: Listing[],
  _productions: Production[],
  selectedCategory: string | null,
  onCategorySelect: (cat: string | null) => void,
): TemplateResult {
  // Category counts
  const catCounts = new Map<string, number>();
  for (const l of listings) {
    catCounts.set(l.category, (catCounts.get(l.category) ?? 0) + 1);
  }
  const sortedCats = [...catCounts.entries()].toSorted((a, b) => b[1] - a[1]);

  // Filter by category
  let filtered = selectedCategory
    ? listings.filter((l) => l.category === selectedCategory)
    : listings;

  // Filter by search
  if (_searchQuery) {
    const q = _searchQuery.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.citizenName.toLowerCase().includes(q),
    );
  }

  // Sort
  if (_sortBy === "price-asc") {
    filtered = filtered.toSorted((a, b) => a.price - b.price);
  } else if (_sortBy === "price-desc") {
    filtered = filtered.toSorted((a, b) => b.price - a.price);
  } else if (_sortBy === "rating") {
    filtered = filtered.toSorted((a, b) => b.rating - a.rating);
  } else if (_sortBy === "name") {
    filtered = filtered.toSorted((a, b) => a.title.localeCompare(b.title));
  } else {
    // newest — reverse chronological
    filtered = filtered.toReversed();
  }

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (_currentPage >= totalPages) {
    _currentPage = 0;
  }
  const pageItems = filtered.slice(_currentPage * PAGE_SIZE, (_currentPage + 1) * PAGE_SIZE);

  return html`
    ${renderToolbar(filtered.length)}
    ${renderCategoryPills(sortedCats, selectedCategory, onCategorySelect)}
    <div class="aistore-grid">
      ${pageItems.map((l) => renderProductCard(l))}
    </div>
    ${totalPages > 1 ? renderPagination(_currentPage, totalPages) : nothing}
  `;
}

// ─── Toolbar ─────────────────────────────────────────────────────

function renderToolbar(resultCount: number): TemplateResult {
  return html`
    <div class="aistore-toolbar">
      <div class="aistore-search">
        <span class="aistore-search__icon">🔍</span>
        <input
          class="aistore-search__input"
          type="text"
          placeholder="Search products, creators..."
          .value=${_searchQuery}
          @input=${(e: Event) => {
            _searchQuery = (e.target as HTMLInputElement).value;
            _currentPage = 0;
            // Force Lit to re-render by dispatching a custom event
            (e.target as HTMLInputElement).dispatchEvent(new Event("change", { bubbles: true }));
            // Also request an update on the host element
            const host = (e.target as HTMLInputElement).closest("hoc-app");
            if (host && "requestUpdate" in host) {
              (host as unknown as { requestUpdate: () => void }).requestUpdate();
            }
          }}
        />
      </div>
      <select
        class="aistore-sort"
        @change=${(e: Event) => {
          _sortBy = (e.target as HTMLSelectElement).value;
          const host = (e.target as HTMLSelectElement).closest("hoc-app");
          if (host && "requestUpdate" in host) {
            (host as unknown as { requestUpdate: () => void }).requestUpdate();
          }
        }}
      >
        <option value="newest" ?selected=${_sortBy === "newest"}>⏰ Newest</option>
        <option value="price-asc" ?selected=${_sortBy === "price-asc"}>💰 Price ↑</option>
        <option value="price-desc" ?selected=${_sortBy === "price-desc"}>💰 Price ↓</option>
        <option value="rating" ?selected=${_sortBy === "rating"}>⭐ Rating</option>
        <option value="name" ?selected=${_sortBy === "name"}>🔤 Name</option>
      </select>
      <span class="aistore-count">${resultCount} product${resultCount !== 1 ? "s" : ""}</span>
    </div>
  `;
}

// ─── Category Pills ──────────────────────────────────────────────

function renderCategoryPills(
  cats: [string, number][],
  selected: string | null,
  onSelect: (cat: string | null) => void,
): TemplateResult {
  return html`
    <div class="aistore-categories">
      <button type="button"
        class="aistore-pill ${selected === null ? "aistore-pill--active" : ""}"
        @click=${() => {
          onSelect(null);
          _currentPage = 0;
        }}
      >All</button>
      ${cats.map(([cat, count]) => {
        const meta = getCatMeta(cat);
        return html`
          <button type="button"
            class="aistore-pill ${selected === cat ? "aistore-pill--active" : ""}"
            @click=${() => {
              onSelect(cat);
              _currentPage = 0;
            }}
          >
            ${meta.emoji} ${cat}
            <span class="aistore-pill__count">(${count})</span>
          </button>
        `;
      })}
    </div>
  `;
}

// ─── Product Card ────────────────────────────────────────────────

function renderProductCard(l: Listing): TemplateResult {
  const meta = getCatMeta(l.category);

  return html`
    <div class="aistore-card aistore-card--clickable"
         @click=${() => {
           _selectedListing = l;
           requestAppUpdate();
         }}>
      <div class="aistore-card__header">
        <div class="aistore-card__emoji" style="background: ${meta.gradient}; color: #fff;">
          ${meta.emoji}
        </div>
        <div class="aistore-card__meta">
          <h3 class="aistore-card__title">${l.title}</h3>
          <div class="aistore-card__creator">
            👤 ${l.citizenName}
            ${
              l.reviewCount > 0
                ? html`
              <span class="aistore-card__stars">${renderStars(l.rating)}</span>
              <span>(${l.reviewCount})</span>
            `
                : html`
                    <span style="opacity: 0.5">No reviews</span>
                  `
            }
          </div>
        </div>
      </div>
      <div class="aistore-card__body">
        <p class="aistore-card__desc">${l.description}</p>
      </div>
      <div class="aistore-card__footer">
        <span class="aistore-card__price">
          ${l.price}<span class="aistore-card__price-currency">${l.currency}</span>
        </span>
        <span class="aistore-card__badge" style="background: ${meta.color}22; color: ${meta.color}">
          ${meta.emoji} ${l.category}
        </span>
      </div>
    </div>
  `;
}

// ─── Product Detail ──────────────────────────────────────────────

function renderProductDetail(l: Listing): TemplateResult {
  const meta = getCatMeta(l.category);
  const createdDate = new Date(l.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return html`
    <!-- Sticky Back Nav -->
    <div style="position:sticky;top:0;z-index:50;background:linear-gradient(180deg,rgba(15,15,20,0.98) 60%,transparent);padding:12px 0 20px 0;margin-bottom:8px">
      <button type="button" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#00e5ff;font-size:0.82rem;font-weight:600;cursor:pointer;backdrop-filter:blur(12px);transition:all 0.2s;font-family:inherit;letter-spacing:0.5px"
              @click=${() => {
                _selectedListing = null;
                requestAppUpdate();
              }}>
        <span style="font-size:1.1rem">←</span> Back to Store
      </button>
    </div>

    <!-- Product Hero Banner -->
    <div style="border-radius:16px;overflow:hidden;background:${meta.gradient};padding:40px 32px;display:flex;align-items:center;gap:24px;position:relative;margin-bottom:20px;box-shadow:0 12px 40px ${meta.color}22">
      <div style="font-size:4rem;width:100px;height:100px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.2);border-radius:20px;backdrop-filter:blur(8px)">${meta.emoji}</div>
      <div style="flex:1;min-width:0">
        <h1 style="font-size:1.8rem;font-weight:800;color:#fff;margin:0 0 4px 0;text-shadow:0 2px 8px rgba(0,0,0,0.3)">${l.title}</h1>
        <div style="font-size:0.9rem;color:rgba(255,255,255,0.85);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span>👤 ${l.citizenName}</span>
          <span style="background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:12px;font-size:0.75rem;backdrop-filter:blur(4px)">${l.category.toUpperCase()}</span>
          <span>📅 ${createdDate}</span>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:2.2rem;font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.3)">${l.price} <span style="font-size:0.8rem;font-weight:400;opacity:0.8">${l.currency}</span></div>
      </div>
    </div>

    <!-- Rich Preview Area -->
    ${renderCategoryPreview(l, meta)}

    <!-- Detail Grid -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
      <div class="republic-card" style="padding:20px">
        <h3 style="margin:0 0 12px 0;font-size:1rem;color:var(--text-strong, #e0e0e0)">📋 Description</h3>
        <p style="color:var(--muted, #999);line-height:1.7;font-size:0.88rem;white-space:pre-wrap">${l.description}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="republic-card" style="padding:16px;text-align:center">
          <div style="font-size:2rem;margin-bottom:4px">${l.reviewCount > 0 ? renderStars(l.rating) : "☆☆☆☆☆"}</div>
          <div style="font-size:0.85rem;color:var(--muted, #999)">${l.reviewCount > 0 ? html`<strong style="color:var(--text-strong, #e0e0e0)">${l.rating.toFixed(1)}</strong> / 5.0 (${l.reviewCount} review${l.reviewCount !== 1 ? "s" : ""})` : "No reviews yet"}</div>
        </div>
        <div class="republic-card" style="padding:16px">
          <h4 style="margin:0 0 10px 0;font-size:0.85rem;color:var(--text-strong, #e0e0e0)">📊 Product Details</h4>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:0.82rem">
            <div style="display:flex;justify-content:space-between"><span style="color:var(--muted, #999)">ID</span><code style="font-size:0.72rem;color:${meta.color}">${l.id.slice(0, 12)}…</code></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--muted, #999)">Creator</span><span style="color:var(--text-strong, #e0e0e0);font-weight:600">${l.citizenName}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--muted, #999)">Category</span><span style="display:flex;align-items:center;gap:4px;color:${meta.color}">${meta.emoji} ${l.category}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--muted, #999)">Visibility</span><span style="background:${l.visibility === "public" ? "#22c55e22" : "#6366f122"};color:${l.visibility === "public" ? "#22c55e" : "#6366f1"};padding:1px 6px;border-radius:4px;font-size:0.72rem">${l.visibility === "public" ? "🌍 Public" : l.visibility === "internal" ? "🔒 Internal" : "🔄 Both"}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--muted, #999)">Status</span><span style="color:${l.active ? "#22c55e" : "#ef4444"};font-weight:600">${l.active ? "✅ Active" : "❌ Inactive"}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--muted, #999)">Price</span><span style="font-weight:700;font-size:1rem;color:${meta.color}">${l.price} ${l.currency}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── Category-Specific Rich Preview ──────────────────────────────

function renderCategoryPreview(
  l: Listing,
  meta: { emoji: string; color: string; gradient: string },
): TemplateResult {
  const cat = l.category.toLowerCase();
  // Build the URL for the file if available
  const fileUrl = l.filePath ? `/${l.filePath}` : null;

  // ── Music / Podcasts — Real Audio Player ──
  if (cat === "music" || cat === "podcasts") {
    return html`
      <div class="republic-card" style="padding:24px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="font-size:2.5rem;width:64px;height:64px;display:flex;align-items:center;justify-content:center;background:${meta.gradient};border-radius:14px;box-shadow:0 4px 20px ${meta.color}30">${meta.emoji}</div>
          <div><h3 style="margin:0;color:var(--text-strong,#e0e0e0);font-size:1.1rem">${l.title}</h3><div style="color:var(--muted,#999);font-size:0.8rem">by ${l.citizenName}</div></div>
        </div>
        ${
          fileUrl
            ? html`
            <audio controls preload="metadata"
                   style="width:100%;border-radius:12px;outline:none;"
                   crossorigin="anonymous">
              <source src=${fileUrl} />
              Your browser does not support audio.
            </audio>
            <div style="font-size:0.7rem;color:var(--muted,#999);text-align:center;margin-top:8px">AI-generated ${cat === "music" ? "track" : "episode"} • Use controls to play</div>
          `
            : html`
            <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:16px">
              <div style="display:flex;align-items:end;justify-content:center;gap:2px;height:48px;margin-bottom:12px">
                ${WAVEFORM_BARS.map((h, i) => {
                  const opacity = 0.4 + ((i * 0.6180339887) % 0.6);
                  return html`<div style="width:3px;height:${h}px;border-radius:2px;background:${meta.gradient};opacity:${opacity.toFixed(2)}"></div>`;
                })}
              </div>
              <div style="font-size:0.7rem;color:var(--muted,#999);text-align:center">Audio file not yet available</div>
            </div>
          `
        }
      </div>`;
  }

  // ── Video / Ads / Screenplays — Real Video or Placeholder ──
  if (cat === "video" || cat === "ads" || cat === "screenplays") {
    return html`
      <div class="republic-card" style="padding:0;overflow:hidden;margin-bottom:16px">
        ${
          fileUrl
            ? html`
            <video controls preload="metadata" style="width:100%;aspect-ratio:16/9;background:#000;display:block;" crossorigin="anonymous" playsinline>
              <source src=${fileUrl} />
            </video>
          `
            : html`
            <div style="position:relative;background:linear-gradient(135deg,#0a0a0a,#1a1a2e);aspect-ratio:16/9;display:flex;align-items:center;justify-content:center">
              <div style="font-size:5rem;opacity:0.3">${meta.emoji}</div>
              <div style="position:absolute;bottom:8px;left:12px;font-size:0.7rem;color:rgba(255,255,255,0.5)">Video file not yet available</div>
            </div>
          `
        }
        <div style="padding:12px 16px;font-size:0.72rem;color:var(--muted,#999)"><span style="color:${meta.color}">●</span> AI-generated ${cat}</div>
      </div>`;
  }

  // ── Games — Real iframe Game Launcher ──
  if (cat === "games") {
    return html`
      <div class="republic-card" style="padding:0;overflow:hidden;margin-bottom:16px">
        ${
          fileUrl
            ? html`
            <div style="position:relative;background:linear-gradient(135deg,#0f0f23,#1a0a2e);aspect-ratio:16/9" id="game-preview-${l.id}">
              <iframe style="width:100%;height:100%;border:none;display:none;" sandbox="allow-scripts allow-same-origin" id="game-iframe-${l.id}"></iframe>
              <div id="game-overlay-${l.id}" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
                <div style="font-size:6rem;filter:drop-shadow(0 0 30px ${meta.color}60)">${meta.emoji}</div>
                <h3 style="margin:0;font-size:1.4rem;font-weight:800;color:#fff;text-shadow:0 0 20px ${meta.color}80">${l.title}</h3>
                <button type="button" style="padding:12px 32px;border-radius:12px;border:2px solid ${meta.color};background:${meta.gradient};color:#fff;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:1px;text-transform:uppercase;box-shadow:0 4px 25px ${meta.color}50;font-family:inherit"
                        @click=${(e: Event) => {
                          const btn = e.currentTarget as HTMLElement;
                          const overlay = btn.closest('[id^="game-overlay"]') as HTMLElement;
                          const iframe = overlay?.parentElement?.querySelector(
                            "iframe",
                          ) as HTMLIFrameElement;
                          if (overlay && iframe) {
                            overlay.style.display = "none";
                            iframe.src = fileUrl!;
                            iframe.style.display = "block";
                          }
                        }}>
                  🎮 LAUNCH GAME
                </button>
                <div style="font-size:0.72rem;color:rgba(255,255,255,0.5)">Runs in-browser • Click to play</div>
              </div>
            </div>
          `
            : html`
            <div style="position:relative;background:linear-gradient(135deg,#0f0f23,#1a0a2e);aspect-ratio:16/9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
              <div style="font-size:6rem;filter:drop-shadow(0 0 30px ${meta.color}60)">${meta.emoji}</div>
              <h3 style="margin:0;font-size:1.4rem;font-weight:800;color:#fff">${l.title}</h3>
              <div style="font-size:0.72rem;color:rgba(255,255,255,0.5)">Game file not yet available</div>
            </div>
          `
        }
      </div>`;
  }

  // ── Code / Software / Websites — Live Preview ──
  if (cat === "code" || cat === "websites" || cat === "designs") {
    return html`
      <div class="republic-card" style="padding:0;overflow:hidden;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(0,0,0,0.4);border-bottom:1px solid rgba(255,255,255,0.06)">
          <div style="display:flex;gap:5px"><div style="width:10px;height:10px;border-radius:50%;background:#ff5f56"></div><div style="width:10px;height:10px;border-radius:50%;background:#ffbd2e"></div><div style="width:10px;height:10px;border-radius:50%;background:#27c93f"></div></div>
          <div style="flex:1;text-align:center;font-size:0.7rem;color:var(--muted,#999);font-family:monospace">${l.title.toLowerCase().replace(/\s+/g, "-")}.app</div>
          ${fileUrl ? html`<a href=${fileUrl} target="_blank" rel="noopener" style="padding:4px 12px;border-radius:6px;border:1px solid rgba(0,229,255,0.2);background:rgba(0,229,255,0.08);color:#00e5ff;font-size:0.65rem;cursor:pointer;text-decoration:none">⛶ Open ↗</a>` : nothing}
        </div>
        ${
          fileUrl && (cat === "websites" || (cat === "code" && fileUrl.endsWith(".html")))
            ? html`
            <iframe src=${fileUrl} sandbox="allow-scripts allow-same-origin" loading="lazy"
                    style="width:400%;height:400%;border:none;transform:scale(0.25);transform-origin:0 0;display:block;aspect-ratio:4/3;background:#fff"></iframe>
          `
            : html`
            <div style="aspect-ratio:16/9;background:linear-gradient(135deg,#0d1117,#161b22);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px">
              <div style="font-size:4rem">${meta.emoji}</div>
              <div style="color:var(--muted,#999);font-size:0.85rem">${fileUrl ? "Preview available" : "File not yet available"}</div>
              ${fileUrl ? html`<a href=${fileUrl} target="_blank" rel="noopener" style="padding:8px 20px;border-radius:8px;border:1px solid ${meta.color}40;background:${meta.color}15;color:${meta.color};font-size:0.8rem;cursor:pointer;font-family:inherit;text-decoration:none">🚀 Open File ↗</a>` : nothing}
            </div>
          `
        }
      </div>`;
  }

  // ── Art / Photos / 3D Models — Real Image or Placeholder ──
  if (cat === "art" || cat === "3d-models") {
    const isImg = fileUrl && /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(fileUrl);
    return html`
      <div class="republic-card" style="padding:0;overflow:hidden;margin-bottom:16px">
        ${
          isImg
            ? html`
            <div style="aspect-ratio:4/3;background:#0a0a1a;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative">
              <img src=${fileUrl} alt=${l.title} loading="lazy"
                   style="max-width:100%;max-height:100%;object-fit:contain;transition:transform 0.3s"
                   @error=${(e: Event) => {
                     (e.target as HTMLElement).parentElement!.innerHTML =
                       '<div style="color:#666;font-size:3rem;text-align:center">🖼️<br><span style="font-size:0.8rem">Image unavailable</span></div>';
                   }} />
              <a href=${fileUrl} target="_blank" rel="noopener" style="position:absolute;bottom:8px;right:8px;padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.5);color:#fff;font-size:0.7rem;text-decoration:none">⛶ Full Size</a>
            </div>
          `
            : html`
            <div style="aspect-ratio:4/3;background:linear-gradient(135deg,#0a0a1a,#1a1028);display:flex;align-items:center;justify-content:center;position:relative">
              <div style="text-align:center"><div style="font-size:7rem;filter:drop-shadow(0 0 40px ${meta.color}50);margin-bottom:8px">${meta.emoji}</div><div style="font-size:0.85rem;color:var(--muted,#999)">${cat === "3d-models" ? "Interactive 3D model viewer" : fileUrl ? "Image file" : "Image unavailable"}</div></div>
              ${fileUrl ? html`<a href=${fileUrl} target="_blank" rel="noopener" style="position:absolute;bottom:12px;right:12px;padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.5);color:#fff;font-size:0.72rem;text-decoration:none">↗ Open</a>` : nothing}
            </div>
          `
        }
      </div>`;
  }

  // ── Research / Docs / Journals — Document Reader ──
  if (["research", "docs", "journals", "dreams", "chronicles", "evolution"].includes(cat)) {
    return html`
      <div class="republic-card" style="padding:24px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06)">
          <div style="font-size:1.8rem;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:${meta.color}15;border-radius:10px">${meta.emoji}</div>
          <div><h3 style="margin:0;font-size:1rem;color:var(--text-strong,#e0e0e0)">${l.title}</h3><div style="font-size:0.72rem;color:var(--muted,#999)">Document • by ${l.citizenName}</div></div>
          <div style="margin-left:auto;display:flex;gap:6px">
            ${fileUrl ? html`<a href=${fileUrl} target="_blank" rel="noopener" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#e0e0e0;font-size:0.7rem;cursor:pointer;font-family:inherit;text-decoration:none">📖 Read ↗</a>` : nothing}
            ${fileUrl ? html`<a href=${fileUrl} download style="padding:5px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#e0e0e0;font-size:0.7rem;cursor:pointer;font-family:inherit;text-decoration:none">💾 Download</a>` : nothing}
          </div>
        </div>
        <div style="background:rgba(0,0,0,0.2);border-radius:10px;padding:20px;font-size:0.82rem;color:var(--muted,#999);line-height:1.8;max-height:300px;overflow-y:auto;border:1px solid rgba(255,255,255,0.04)">
          <p style="margin:0">${l.description}</p>
          <div style="text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05)"><span style="font-size:0.7rem;color:${meta.color}">— Continue reading the full document —</span></div>
        </div>
      </div>`;
  }

  // ── ML Models / Datasets / Inventions — Technical Card ──
  if (["ml-models", "datasets", "inventions"].includes(cat)) {
    return html`
      <div class="republic-card" style="padding:20px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="font-size:2rem;width:52px;height:52px;display:flex;align-items:center;justify-content:center;background:${meta.gradient};border-radius:12px">${meta.emoji}</div>
          <div><h3 style="margin:0;font-size:1rem;color:var(--text-strong,#e0e0e0)">${l.title}</h3><div style="font-size:0.72rem;color:var(--muted,#999)">${l.category} • by ${l.citizenName}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:10px;text-align:center"><div style="font-size:1.2rem;font-weight:700;color:${meta.color}">v1.0</div><div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase">Version</div></div>
          <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:10px;text-align:center"><div style="font-size:1.2rem;font-weight:700;color:#22c55e">Ready</div><div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase">Status</div></div>
          <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:10px;text-align:center"><div style="font-size:1.2rem;font-weight:700;color:#60a5fa">${l.fileSize ? (l.fileSize / 1024 / 1024).toFixed(1) + " MB" : "AI"}</div><div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase">${l.fileSize ? "Size" : "Source"}</div></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${fileUrl ? html`<a href=${fileUrl} download style="padding:8px 16px;border-radius:8px;border:1px solid ${meta.color}40;background:${meta.color}15;color:${meta.color};font-size:0.78rem;cursor:pointer;font-family:inherit;text-decoration:none">📥 Download</a>` : nothing}
          <button type="button" style="padding:8px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#e0e0e0;font-size:0.78rem;cursor:pointer;font-family:inherit">📋 View Details</button>
          ${
            cat === "ml-models"
              ? html`
                  <button type="button"
                    style="
                      padding: 8px 16px;
                      border-radius: 8px;
                      border: 1px solid rgba(34, 197, 94, 0.3);
                      background: rgba(34, 197, 94, 0.1);
                      color: #22c55e;
                      font-size: 0.78rem;
                      cursor: pointer;
                      font-family: inherit;
                    "
                  >
                    🚀 Deploy
                  </button>
                `
              : nothing
          }
        </div>
      </div>`;
  }

  // ── Default — Generic Preview ──
  return html`
    <div class="republic-card" style="padding:24px;margin-bottom:16px;text-align:center">
      <div style="font-size:4rem;margin-bottom:8px;filter:drop-shadow(0 0 20px ${meta.color}40)">${meta.emoji}</div>
      <h3 style="margin:0 0 4px;font-size:1.1rem;color:var(--text-strong,#e0e0e0)">${l.title}</h3>
      <div style="font-size:0.78rem;color:var(--muted,#999);margin-bottom:12px">${l.category} by ${l.citizenName}</div>
      ${fileUrl ? html`<a href=${fileUrl} target="_blank" rel="noopener" style="padding:8px 20px;border-radius:8px;border:1px solid ${meta.color}40;background:${meta.color}15;color:${meta.color};font-size:0.82rem;cursor:pointer;font-family:inherit;text-decoration:none">📂 Open ↗</a>` : nothing}
    </div>`;
}

// ─── Pagination ──────────────────────────────────────────────────

function renderPagination(current: number, total: number): TemplateResult {
  const pages: number[] = [];
  for (let i = 0; i < total; i++) {
    if (i < 3 || i >= total - 2 || Math.abs(i - current) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== -1) {
      pages.push(-1); // ellipsis
    }
  }

  return html`
    <div class="aistore-pagination">
      <button type="button"
        class="aistore-pagination__btn"
        ?disabled=${current === 0}
        @click=${() => {
          _currentPage = Math.max(0, current - 1);
          requestAppUpdate();
        }}
      >‹</button>
      ${pages.map((p) =>
        p === -1
          ? html`
              <span style="padding: 0 4px; color: var(--aistore-text-muted)">…</span>
            `
          : html`
            <button type="button"
              class="aistore-pagination__btn ${p === current ? "aistore-pagination__btn--active" : ""}"
              @click=${() => {
                _currentPage = p;
                requestAppUpdate();
              }}
            >${p + 1}</button>
          `,
      )}
      <button type="button"
        class="aistore-pagination__btn"
        ?disabled=${current >= total - 1}
        @click=${() => {
          _currentPage = Math.min(total - 1, current + 1);
          requestAppUpdate();
        }}
      >›</button>
    </div>
  `;
}

// ─── Gallery Tab ─────────────────────────────────────────────────

function renderGalleryTab(listings: Listing[]): TemplateResult {
  return html`
    <div class="aistore-gallery">
      ${listings.map((l) => {
        const meta = getCatMeta(l.category);
        return html`
          <div class="aistore-gallery__item">
            <div class="aistore-gallery__emoji" style="background: ${meta.gradient}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
              ${meta.emoji}
            </div>
            <div class="aistore-gallery__title">${l.title}</div>
            <div class="aistore-gallery__price">${l.price} <small>${l.currency}</small></div>
          </div>
        `;
      })}
    </div>
  `;
}

// ─── Stats Tab ───────────────────────────────────────────────────

function renderStatsTab(diag: MarketplaceDiagnostics | null, listings: Listing[]): TemplateResult {
  const totalRevenue = listings.reduce((s, l) => s + l.price, 0);
  const avgPrice = listings.length > 0 ? (totalRevenue / listings.length).toFixed(0) : "0";
  const avgRating =
    listings.length > 0
      ? (listings.reduce((s, l) => s + l.rating, 0) / listings.length).toFixed(1)
      : "0.0";

  // Category distribution
  const catCounts = new Map<string, number>();
  for (const l of listings) {
    catCounts.set(l.category, (catCounts.get(l.category) ?? 0) + 1);
  }
  const _topCategory = [...catCounts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return html`
    <div class="aistore-stats">
      <div class="aistore-stat-card">
        <div class="aistore-stat-card__value">${diag?.activeListings ?? listings.length}</div>
        <div class="aistore-stat-card__label">Active Listings</div>
      </div>
      <div class="aistore-stat-card">
        <div class="aistore-stat-card__value">${diag?.totalOrders ?? 0}</div>
        <div class="aistore-stat-card__label">Total Orders</div>
      </div>
      <div class="aistore-stat-card">
        <div class="aistore-stat-card__value">${diag?.completedOrders ?? 0}</div>
        <div class="aistore-stat-card__label">Completed</div>
      </div>
      <div class="aistore-stat-card">
        <div class="aistore-stat-card__value">${diag?.pendingOrders ?? 0}</div>
        <div class="aistore-stat-card__label">Pending</div>
      </div>
      <div class="aistore-stat-card">
        <div class="aistore-stat-card__value">${avgPrice}</div>
        <div class="aistore-stat-card__label">Avg Price</div>
      </div>
      <div class="aistore-stat-card">
        <div class="aistore-stat-card__value">${avgRating}</div>
        <div class="aistore-stat-card__label">Avg Rating</div>
      </div>
      <div class="aistore-stat-card">
        <div class="aistore-stat-card__value">${catCounts.size}</div>
        <div class="aistore-stat-card__label">Categories</div>
      </div>
      <div class="aistore-stat-card">
        <div class="aistore-stat-card__value">${totalRevenue.toLocaleString()}</div>
        <div class="aistore-stat-card__label">Total Value</div>
      </div>
    </div>

    ${
      catCounts.size > 0
        ? html`
      <div class="aistore-stats" style="padding-top: 0;">
        ${[...catCounts.entries()]
          .toSorted((a, b) => b[1] - a[1])
          .map(([cat, count]) => {
            const meta = getCatMeta(cat);
            const pct = ((count / listings.length) * 100).toFixed(0);
            return html`
            <div class="aistore-stat-card">
              <div class="aistore-stat-card__value" style="color: ${meta.color}">${meta.emoji}</div>
              <div class="aistore-stat-card__label">${cat} (${count} · ${pct}%)</div>
            </div>
          `;
          })}
      </div>
    `
        : nothing
    }
  `;
}
