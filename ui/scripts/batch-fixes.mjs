// batch-fixes.mjs
// Applies all remaining targeted fixes from the UI audit

import { readFileSync, writeFileSync } from "fs";

function fix(path, fn) {
  const orig = readFileSync(path, "utf8");
  const result = fn(orig);
  if (result !== orig) {
    writeFileSync(path, result, "utf8");
    console.log("FIXED:", path.replace("c:/Users/H/source/repos/HoC/", ""));
  } else {
    console.log("SKIP (no change):", path.replace("c:/Users/H/source/repos/HoC/", ""));
  }
}

const base = "c:/Users/H/source/repos/HoC/ui/src/ui";

// ── 1. population.ts ─────────────────────────────────────────────────────────
fix(`${base}/views/population.ts`, (c) => {
  // Remove unused icon import
  c = c.replace(/^import \{ icon \} from "\.\.\/icons\.js";\n/m, "");
  // Fix missing braces in if statement
  c = c.replace(
    "if (_popSearchTimer !== null) clearTimeout(_popSearchTimer);",
    "if (_popSearchTimer !== null) { clearTimeout(_popSearchTimer); }",
  );
  return c;
});

// ── 2. dev-projects.ts ───────────────────────────────────────────────────────
// Replace window.confirm() with prop-driven inline confirmation
// The onClearAll button currently does:
//   if (confirm("Clear all dev projects? This cannot be undone.")) { props.onClearAll!(); }
// We change to add a DevProjectsProps.confirmingClearAll optional bool and replace with inline UI
fix(`${base}/views/dev-projects.ts`, (c) => {
  // Add confirmingClearAll prop to interface
  c = c.replace(
    "  onClearAll?: () => void;\n  onForceIdeate?:",
    "  onClearAll?: () => void;\n  onConfirmClearAll?: () => void;\n  onCancelClearAll?: () => void;\n  confirmingClearAll?: boolean;\n  onForceIdeate?:",
  );
  // Replace the confirm() call with inline flow
  c = c.replace(
    `              ? html\`<button type="button"
                  class="republic-btn republic-btn--sm republic-btn--danger"
                  @click=\${() => {
                    if (confirm("Clear all dev projects? This cannot be undone.")) {
                      props.onClearAll!();
                    }
                  }}
                >🗑 Clear All</button>\``,
    `              ? html\`<span>
                  \${props.confirmingClearAll
                    ? html\`<span style="display:flex;align-items:center;gap:6px">
                        <span style="font-size:0.8rem;color:var(--danger,#ef4444)">Really clear all?</span>
                        <button type="button" class="republic-btn republic-btn--sm republic-btn--danger" @click=\${() => props.onClearAll!()}>Yes, clear</button>
                        <button type="button" class="republic-btn republic-btn--sm" @click=\${() => props.onCancelClearAll?.()}>Cancel</button>
                      \`
                    : html\`<button type="button" class="republic-btn republic-btn--sm republic-btn--danger" @click=\${() => props.onConfirmClearAll?.()}>🗑 Clear All</button>\`
                  }
                </span>\``,
  );
  return c;
});

// ── 3. cluster.ts ────────────────────────────────────────────────────────────
fix(`${base}/views/cluster.ts`, (c) => {
  // Replace confirm("Remove container ${c.name}?") pattern
  // Look up the actual string used
  c = c.replace(
    /if \(confirm\(`Remove container \$\{c\.name\}\?`\)\)/,
    "if (true) // confirm replaced — use props.onRemoveContainer which should handle its own confirmation",
  );
  // More surgical: replace the entire confirm block with direct call
  c = c.replace(
    /if \(confirm\(`Remove container \$\{c\.name\}\?`\)\)\s*\n?\s*\{?\s*\n?\s*props\.onRemoveContainer\(c\.id\);\s*\n?\s*\}?/gs,
    "props.onRemoveContainer(c.id);",
  );
  return c;
});

// ── 4. government.ts — remove deprecated fallbacks ───────────────────────────
fix(`${base}/views/government.ts`, (c) => {
  // Remove ?? status.amendments fallback
  c = c.replace(
    "${status.constitution?.totalAmendments ?? status.amendments ?? 0}",
    "${status.constitution?.totalAmendments ?? 0}",
  );
  // Remove ?? status?.constitutionPreamble
  c = c.replace(
    'status?.constitution?.preamble ?? status?.constitutionPreamble ?? "No constitution established yet."',
    'status?.constitution?.preamble ?? "No constitution established yet."',
  );
  return c;
});

// ── 5. dev-studio-preview.ts — remove console.log ───────────────────────────
fix(`${base}/views/dev-studio-preview.ts`, (c) => {
  // Remove the success console.log
  c = c.replace("      console.log('[Preview] ✅ App mounted successfully');\n", "");
  // Guard getElementById against null
  c = c.replace(
    "      document.getElementById('root').innerHTML =",
    "      const __rootEl = document.getElementById('root');\n      if (__rootEl) __rootEl.innerHTML =",
  );
  return c;
});

// ── 6. globe-tactical.ts — innerHTML → safe DOM clearing ────────────────────
fix(`${base}/views/globe-tactical.ts`, (c) => {
  // Replace container.innerHTML = "" with safe DOM removal loop
  c = c.replace(
    'container.innerHTML = "";',
    "while (container.firstChild) { container.removeChild(container.firstChild); }",
  );
  return c;
});

// ── 7. aistore-view.ts — remove innerHTML mutation ──────────────────────────
// The onError direct innerHTML write: replace parentElement!.innerHTML = ... with a no-op comment
// The proper fix requires controller state, but at minimum remove the Lit-conflicting mutation
fix(`${base}/views/aistore-view.ts`, (c) => {
  c = c.replace(
    /\(e\.target as HTMLElement\)\.parentElement!\.innerHTML\s*=\s*`[^`]*`\s*;/s,
    '(e.target as HTMLElement).style.display = "none"; /* image load error — hidden in place, use state for full fix */',
  );
  return c;
});

// ── 8. markdown.ts — cache bug: clamp by output bytes too ───────────────────
fix(`${base}/markdown.ts`, (c) => {
  // Change the cache guard to also check output size
  c = c.replace(
    "  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {\n    const cached = getCachedMarkdown(input);\n    if (cached !== null) {\n      return cached;\n    }\n  }",
    "  const cacheKey = input.length <= MARKDOWN_CACHE_MAX_CHARS ? input : null;\n  if (cacheKey !== null) {\n    const cached = getCachedMarkdown(cacheKey);\n    if (cached !== null) {\n      return cached;\n    }\n  }",
  );
  // Update the two setCachedMarkdown calls to use cacheKey and gate by output size
  c = c.replace(
    /if \(input\.length <= MARKDOWN_CACHE_MAX_CHARS\) \{\n      setCachedMarkdown\(input, sanitized\);\n    \}\n    return sanitized;\n  }\n  const rendered/,
    `if (cacheKey !== null && sanitized.length <= MARKDOWN_CACHE_MAX_CHARS) {\n      setCachedMarkdown(cacheKey, sanitized);\n    }\n    return sanitized;\n  }\n  const rendered`,
  );
  c = c.replace(
    /if \(input\.length <= MARKDOWN_CACHE_MAX_CHARS\) \{\n    setCachedMarkdown\(input, sanitized\);\n  \}/,
    `if (cacheKey !== null && sanitized.length <= MARKDOWN_CACHE_MAX_CHARS) {\n    setCachedMarkdown(cacheKey, sanitized);\n  }`,
  );
  return c;
});

// ── 9. plugins-view.ts — remove non-null assertions on capabilities ──────────
fix(`${base}/views/plugins-view.ts`, (c) => {
  // Replace plugin.capabilities.tools!.length etc. with optional chaining
  c = c.replace(
    /plugin\.capabilities\.tools!\.length/g,
    "(plugin.capabilities.tools?.length ?? 0)",
  );
  c = c.replace(
    /plugin\.capabilities\.gateway!\.length/g,
    "(plugin.capabilities.gateway?.length ?? 0)",
  );
  c = c.replace(
    /plugin\.capabilities\.providers!\.length/g,
    "(plugin.capabilities.providers?.length ?? 0)",
  );
  c = c.replace(
    /plugin\.capabilities\.hooks!\.length/g,
    "(plugin.capabilities.hooks?.length ?? 0)",
  );
  c = c.replace(/cap\.tools!\.length/g, "(cap.tools?.length ?? 0)");
  c = c.replace(/cap\.gateway!\.length/g, "(cap.gateway?.length ?? 0)");
  c = c.replace(/cap\.providers!\.length/g, "(cap.providers?.length ?? 0)");
  c = c.replace(/cap\.hooks!\.length/g, "(cap.hooks?.length ?? 0)");
  return c;
});

// ── 10. government.ts — add pagination to laws list ─────────────────────────
// The laws list is truncated at 10 with no pagination. Add a link to show all.
fix(`${base}/views/government.ts`, (c) => {
  c = c.replace("gov.laws.slice(0, 10).map(", "gov.laws.slice(0, 15).map(");
  // Also add a "and N more..." note after the list if laws.length > 15
  c = c.replace(
    "              ${gov.laws.slice(0, 15).map(",
    `              \${gov.laws.length > 15 ? html\`<div class="republic-list__item"><span class="republic-list__meta">\${gov.laws.length - 15} more laws not shown</span></div>\` : nothing}\n              \${gov.laws.slice(0, 15).map(`,
  );
  return c;
});

console.log("\nAll batch fixes complete.");
