/**
 * Shared Pagination Utility
 * 
 * Reusable page-based slicing + Lit-based pagination controls for all Republic UI views.
 * Consolidates pagination logic previously duplicated across population.ts, productions-view.ts, etc.
 */
import { html, nothing, type TemplateResult } from "lit";

// ─── Pagination Logic ─────────────────────────────────────────────

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
}

/** Slice an array into a page and return contextual metadata. */
export function paginate<T>(items: T[], page: number, pageSize: number): PaginationResult<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  return {
    items: items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    page: safePage,
    pageSize,
    totalPages,
    totalItems,
  };
}

// ─── Module-Level Page State (keyed by caller) ────────────────────

const _pageState = new Map<string, number>();

/** Get the current page for a given view key. */
export function getPage(key: string): number {
  return _pageState.get(key) ?? 0;
}

/** Set page for a given view key. Returns the page so callers can chain. */
export function setPage(key: string, page: number): number {
  _pageState.set(key, page);
  return page;
}

/** Reset page to 0 for a given view key. */
export function resetPage(key: string): void {
  _pageState.set(key, 0);
}

// ─── Pagination Controls ──────────────────────────────────────────

/**
 * Renders a compact, keyboard-accessible pagination bar.
 * Use with `paginate()` for a complete pagination solution.
 *
 * @param page     - Current 0-indexed page
 * @param totalPages - Total number of pages
 * @param onPageChange - Callback when user selects a page (0-indexed)
 * @param opts     - Optional config: showTotal, totalItems
 */
export function renderPaginationControls(
  page: number,
  totalPages: number,
  onPageChange: (page: number) => void,
  opts?: { totalItems?: number; label?: string },
): TemplateResult {
  if (totalPages <= 1) {return html`${nothing}`;}

  // Build page number list with ellipsis
  const pages: number[] = [];
  const range = 2;
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || (i >= page - range && i <= page + range)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== -1) {
      pages.push(-1); // ellipsis marker
    }
  }

  return html`
    <div style="display:flex;align-items:center;justify-content:center;gap:4px;padding:16px 0;flex-wrap:wrap">
      ${opts?.totalItems != null ? html`
        <span style="font-size:11px;color:var(--muted);margin-right:8px">
          ${opts.label ?? ""} ${opts.totalItems.toLocaleString()} total
        </span>
      ` : nothing}

      <button type="button"
        @click=${() => page > 0 && onPageChange(page - 1)}
        ?disabled=${page === 0}
        aria-label="Previous page"
        style="
          padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);
          background:transparent;color:${page === 0 ? "rgba(255,255,255,0.2)" : "var(--text-strong)"};
          cursor:${page === 0 ? "default" : "pointer"};font-size:12px
        "
      >← Prev</button>

      ${pages.map(p => p === -1
        ? html`<span style="color:var(--muted);font-size:12px;padding:0 4px">…</span>`
        : html`
          <button type="button"
            @click=${() => onPageChange(p)}
            aria-label="Page ${p + 1}"
            aria-current=${p === page ? "page" : nothing}
            style="
              width:32px;height:32px;border-radius:6px;
              border:1px solid ${p === page ? "#818cf8" : "rgba(255,255,255,0.1)"};
              background:${p === page ? "rgba(99,102,241,0.2)" : "transparent"};
              color:${p === page ? "#818cf8" : "var(--text-strong)"};
              cursor:pointer;font-size:12px;font-weight:${p === page ? "600" : "400"}
            "
          >${p + 1}</button>
        `
      )}

      <button type="button"
        @click=${() => page < totalPages - 1 && onPageChange(page + 1)}
        ?disabled=${page >= totalPages - 1}
        aria-label="Next page"
        style="
          padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);
          background:transparent;color:${page >= totalPages - 1 ? "rgba(255,255,255,0.2)" : "var(--text-strong)"};
          cursor:${page >= totalPages - 1 ? "default" : "pointer"};font-size:12px
        "
      >Next →</button>
    </div>
  `;
}
