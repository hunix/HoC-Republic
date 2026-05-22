/**
 * bulk-inject-rpc-status.cjs
 *
 * For every .tsx page that uses useRpc but has no `.error` / `.loading` display
 * rendered to the user, inject a RpcStatus guard immediately after the first
 * useRpc declaration.
 *
 * Strategy:
 *   - Find lines matching: const { data, loading[, error], refetch } = useRpc
 *   - If the file lacks a block that renders `error` or `loading`, inject:
 *       if (loading || error) return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
 *   - Also add import { RpcStatus } to @/components/ui if missing.
 */
const fs = require("fs");
const path = require("path");

function walk(dir) {
  const r = [];
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory() && n !== "node_modules") {
      r.push(...walk(f));
    } else if (n.endsWith(".tsx")) {
      r.push(f);
    }
  }
  return r;
}

const pagesDir = path.join("hoc-ui", "src", "pages");
const files = walk(pagesDir);
let modified = 0;
let skipped = 0;

for (const f of files) {
  let src = fs.readFileSync(f, "utf8");

  // Skip files that already have RpcStatus or explicit error/loading rendering
  if (src.includes("RpcStatus")) {
    skipped++;
    continue;
  }

  // Must use useRpc
  if (!src.includes("useRpc")) {
    continue;
  }

  // Check if it already handles loading/error
  const hasErrorDisplay = /\berror\b.*&&.*<|if\s*\(\s*error|\{error\}|error\.message/.test(src);
  const hasLoadingDisplay =
    /loading.*&&.*<|if\s*\(\s*loading|\{loading\}|<Spinner|PageLoader|\.loading/.test(src);
  if (hasErrorDisplay && hasLoadingDisplay) {
    skipped++;
    continue;
  }

  // Find the first useRpc destructure: const { data[, loading, error, refetch] } = useRpc
  // We want to inject the guard after the useRpc call block ends
  const rpcMatch = src.match(/const\s*\{([^}]+)\}\s*=\s*useRpc\s*<[^>]*>\s*\([^;]+\);/s);
  if (!rpcMatch) {
    skipped++;
    continue;
  }

  // Parse the destructured names
  const destructured = rpcMatch[1].split(",").map((s) => s.trim().split(":")[0].trim());
  const loadingVar = destructured.find((d) => d.includes("loading")) || "loading";
  const errorVar = destructured.find((d) => d.includes("error")) || "error";
  const refetchVar = destructured.find((d) => d.includes("refetch")) || "refetch";

  // If loading and error aren't destructured, we need to add them
  let patchedSrc = src;
  const rpcLine = rpcMatch[0];

  // Ensure loading + error + refetch are in the destructure
  let newRpcLine = rpcLine;
  const needLoading = !destructured.includes("loading");
  const needError = !destructured.includes("error");
  const needRefetch = !destructured.includes("refetch");

  if (needLoading || needError || needRefetch) {
    // Add missing vars to the destructure (before the closing })
    const extras = [
      needLoading ? "loading" : null,
      needError ? "error" : null,
      needRefetch ? "refetch" : null,
    ]
      .filter(Boolean)
      .join(", ");
    newRpcLine = rpcLine.replace(
      /\{\s*([^}]+)\s*\}/,
      (m, inner) => `{ ${inner.trimEnd()}, ${extras} }`,
    );
    patchedSrc = patchedSrc.replace(rpcLine, newRpcLine);
  }

  // Find the end position of the useRpc block and inject the guard
  const insertAfter = newRpcLine;
  const guard = `\n  if (${loadingVar} || ${errorVar}) {\n    return <RpcStatus loading={${loadingVar}} error={${errorVar}} onRetry={${refetchVar}} />;\n  }`;

  if (!patchedSrc.includes(insertAfter)) {
    skipped++;
    continue;
  }
  patchedSrc = patchedSrc.replace(insertAfter, insertAfter + guard);

  // Ensure RpcStatus is imported from @/components/ui
  if (!patchedSrc.includes("RpcStatus")) {
    // Add RpcStatus to existing @/components/ui import, or add new import
    if (patchedSrc.includes("@/components/ui")) {
      patchedSrc = patchedSrc.replace(
        /import\s*\{([^}]+)\}\s*from\s*["']@\/components\/ui["']/,
        (m, inner) => `import { ${inner.trim()}, RpcStatus } from "@/components/ui"`,
      );
    } else {
      // Add as first import
      patchedSrc = `import { RpcStatus } from "@/components/ui";\n` + patchedSrc;
    }
  }

  // Write back only if changed
  if (patchedSrc !== src) {
    fs.writeFileSync(f, patchedSrc, "utf8");
    console.log("PATCHED:", path.relative("hoc-ui/src", f));
    modified++;
  } else {
    skipped++;
  }
}

console.log(`\nDone. Modified: ${modified}, Skipped: ${skipped}`);
