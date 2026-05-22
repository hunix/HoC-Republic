/**
 * Republic Platform — Repository Knowledge Graph
 *
 * Lightweight regex-based code intelligence that gives citizens
 * codebase awareness before writing or debugging code.
 *
 * Extracts from workspace files:
 *   - Exports (functions, classes, interfaces, types, constants)
 *   - Imports (file-to-file dependency edges)
 *   - Function signatures (name, params, return type)
 *
 * Produces a focused context window for LLM prompts:
 *   "Here are the types and functions relevant to the file you're editing."
 *
 * Performance: ~50ms for a 200-file project. Rebuilt on file write.
 */

import fs from "node:fs/promises";
import path from "node:path";

// ─── Types ──────────────────────────────────────────────────────

export interface CodeSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "enum";
  signature: string;
  filePath: string;
  line: number;
}

export interface FileNode {
  relativePath: string;
  imports: string[];          // relative paths this file imports from
  exports: CodeSymbol[];      // symbols this file exports
  language: string;
}

export interface RepoGraph {
  projectId: string;
  files: Map<string, FileNode>;
  builtAt: number;
}

// ─── Graph Cache ────────────────────────────────────────────────

const graphCache = new Map<string, RepoGraph>();

// ─── Extraction Patterns ────────────────────────────────────────

// TypeScript / JavaScript patterns
const TS_IMPORT_RE = /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/g;
const TS_EXPORT_FUNCTION_RE = /export\s+(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))\s*(?::\s*([^\n{]+))?\s*\{/g;
const TS_EXPORT_CLASS_RE = /export\s+(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^\n{]+))?\s*\{/g;
const TS_EXPORT_INTERFACE_RE = /export\s+interface\s+(\w+)(?:\s+extends\s+([^\n{]+))?\s*\{/g;
const TS_EXPORT_TYPE_RE = /export\s+type\s+(\w+)\s*(?:<[^>]+>)?\s*=\s*([^\n;]+)/g;
const TS_EXPORT_CONST_RE = /export\s+const\s+(\w+)\s*(?::\s*([^\n=]+))?\s*=/g;
const TS_EXPORT_ENUM_RE = /export\s+(?:const\s+)?enum\s+(\w+)\s*\{/g;

// Python patterns
const PY_IMPORT_RE = /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
const PY_DEF_RE = /^def\s+(\w+)\s*(\([^)]*\))\s*(?:->\s*([^\n:]+))?\s*:/gm;
const PY_CLASS_RE = /^class\s+(\w+)(?:\(([^)]*)\))?\s*:/gm;

// ─── File Parsing ───────────────────────────────────────────────

function detectLanguageFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if ([".ts", ".tsx"].includes(ext)) {return "typescript";}
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {return "javascript";}
  if ([".py"].includes(ext)) {return "python";}
  if ([".go"].includes(ext)) {return "go";}
  if ([".rs"].includes(ext)) {return "rust";}
  return "unknown";
}

function parseTypeScriptFile(content: string, filePath: string): FileNode {
  const imports: string[] = [];
  const exports: CodeSymbol[] = [];
  const lines = content.split("\n");

  // Extract imports
  for (const match of content.matchAll(TS_IMPORT_RE)) {
    const importPath = match[1];
    if (importPath && !importPath.startsWith("node:") && !importPath.includes("node_modules")) {
      imports.push(importPath);
    }
  }

  // Extract exported functions
  for (const match of content.matchAll(TS_EXPORT_FUNCTION_RE)) {
    const name = match[1] ?? "";
    const params = match[2] ?? "()";
    const returnType = match[3]?.trim() ?? "void";
    const line = findLineNumber(lines, match.index ?? 0);
    exports.push({
      name,
      kind: "function",
      signature: `function ${name}${params}: ${returnType}`,
      filePath,
      line,
    });
  }

  // Extract exported classes
  for (const match of content.matchAll(TS_EXPORT_CLASS_RE)) {
    const name = match[1] ?? "";
    const ext = match[2] ? ` extends ${match[2]}` : "";
    const impl = match[3] ? ` implements ${match[3].trim()}` : "";
    const line = findLineNumber(lines, match.index ?? 0);
    exports.push({
      name,
      kind: "class",
      signature: `class ${name}${ext}${impl}`,
      filePath,
      line,
    });
  }

  // Extract exported interfaces
  for (const match of content.matchAll(TS_EXPORT_INTERFACE_RE)) {
    const name = match[1] ?? "";
    const ext = match[2] ? ` extends ${match[2].trim()}` : "";
    const line = findLineNumber(lines, match.index ?? 0);
    exports.push({
      name,
      kind: "interface",
      signature: `interface ${name}${ext}`,
      filePath,
      line,
    });
  }

  // Extract exported types
  for (const match of content.matchAll(TS_EXPORT_TYPE_RE)) {
    const name = match[1] ?? "";
    const definition = match[2]?.trim().slice(0, 120) ?? "";
    const line = findLineNumber(lines, match.index ?? 0);
    exports.push({
      name,
      kind: "type",
      signature: `type ${name} = ${definition}`,
      filePath,
      line,
    });
  }

  // Extract exported constants
  for (const match of content.matchAll(TS_EXPORT_CONST_RE)) {
    const name = match[1] ?? "";
    const typeAnnotation = match[2]?.trim() ?? "";
    const line = findLineNumber(lines, match.index ?? 0);
    exports.push({
      name,
      kind: "const",
      signature: `const ${name}${typeAnnotation ? `: ${typeAnnotation.slice(0, 80)}` : ""}`,
      filePath,
      line,
    });
  }

  // Extract exported enums
  for (const match of content.matchAll(TS_EXPORT_ENUM_RE)) {
    const name = match[1] ?? "";
    const line = findLineNumber(lines, match.index ?? 0);
    exports.push({
      name,
      kind: "enum",
      signature: `enum ${name}`,
      filePath,
      line,
    });
  }

  return {
    relativePath: filePath,
    imports,
    exports,
    language: detectLanguageFromExt(filePath),
  };
}

function parsePythonFile(content: string, filePath: string): FileNode {
  const imports: string[] = [];
  const exports: CodeSymbol[] = [];
  const lines = content.split("\n");

  // Extract imports
  for (const match of content.matchAll(PY_IMPORT_RE)) {
    const mod = match[1] ?? match[2] ?? "";
    if (mod && !mod.startsWith("__")) {
      imports.push(mod);
    }
  }

  // Extract function definitions (top-level = public)
  for (const match of content.matchAll(PY_DEF_RE)) {
    const name = match[1] ?? "";
    if (name.startsWith("_")) {continue;} // skip private
    const params = match[2] ?? "()";
    const returnType = match[3]?.trim() ?? "";
    const line = findLineNumber(lines, match.index ?? 0);
    exports.push({
      name,
      kind: "function",
      signature: `def ${name}${params}${returnType ? ` -> ${returnType}` : ""}`,
      filePath,
      line,
    });
  }

  // Extract class definitions
  for (const match of content.matchAll(PY_CLASS_RE)) {
    const name = match[1] ?? "";
    const bases = match[2]?.trim() ?? "";
    const line = findLineNumber(lines, match.index ?? 0);
    exports.push({
      name,
      kind: "class",
      signature: `class ${name}${bases ? `(${bases})` : ""}`,
      filePath,
      line,
    });
  }

  return {
    relativePath: filePath,
    imports,
    exports,
    language: "python",
  };
}

function findLineNumber(lines: string[], charIndex: number): number {
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    count += (lines[i]?.length ?? 0) + 1; // +1 for newline
    if (count > charIndex) {return i + 1;}
  }
  return 1;
}

// ─── Graph Building ─────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".cs", ".cpp", ".c",
]);

/**
 * Build or rebuild the knowledge graph for a project workspace.
 * Scans all code files and extracts symbols + dependencies.
 */
export async function buildRepoGraph(
  projectId: string,
  srcDir: string,
): Promise<RepoGraph> {
  const graph: RepoGraph = {
    projectId,
    files: new Map(),
    builtAt: Date.now(),
  };

  const codeFiles = await collectCodeFiles(srcDir);

  for (const absolutePath of codeFiles) {
    const relativePath = path.relative(srcDir, absolutePath).replace(/\\/g, "/");
    try {
      const content = await fs.readFile(absolutePath, "utf-8");
      const ext = path.extname(absolutePath).toLowerCase();

      let node: FileNode;
      if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
        node = parseTypeScriptFile(content, relativePath);
      } else if (ext === ".py") {
        node = parsePythonFile(content, relativePath);
      } else {
        node = {
          relativePath,
          imports: [],
          exports: [],
          language: detectLanguageFromExt(absolutePath),
        };
      }

      graph.files.set(relativePath, node);
    } catch {
      // Skip unreadable files
    }
  }

  graphCache.set(projectId, graph);
  return graph;
}

/**
 * Recursively collect all code files in a directory.
 */
async function collectCodeFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", "build", "__pycache__", ".next", "venv"].includes(entry.name)) {
          continue;
        }
        const sub = await collectCodeFiles(fullPath);
        results.push(...sub);
      } else if (CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist yet
  }

  return results;
}

/**
 * Get the cached graph for a project. Returns null if not built.
 */
export function getCachedGraph(projectId: string): RepoGraph | null {
  return graphCache.get(projectId) ?? null;
}

// ─── Context Generation ─────────────────────────────────────────

/**
 * Get focused LLM context for a specific file.
 *
 * Returns the types, function signatures, and API surfaces
 * that are relevant to the target file — its direct imports,
 * and any files that share the same types.
 *
 * @param projectId - The project workspace ID
 * @param targetFile - The file being written/debugged (relative path)
 * @param maxTokens - Approximate max characters for context (default 4000)
 */
export function getContextForFile(
  projectId: string,
  targetFile: string,
  maxTokens = 4000,
): string {
  const graph = graphCache.get(projectId);
  if (!graph || graph.files.size === 0) {
    return "";
  }

  const target = graph.files.get(targetFile);
  const relevantFiles = new Set<string>();
  const sections: string[] = [];

  // 1. Direct imports of the target file
  if (target) {
    for (const imp of target.imports) {
      // Resolve relative imports
      const resolved = resolveImport(targetFile, imp, graph);
      if (resolved) {relevantFiles.add(resolved);}
    }
  }

  // 2. Files that import the target file (reverse dependencies)
  for (const [filePath, node] of graph.files) {
    if (filePath === targetFile) {continue;}
    for (const imp of node.imports) {
      const resolved = resolveImport(filePath, imp, graph);
      if (resolved === targetFile) {
        relevantFiles.add(filePath);
        break;
      }
    }
  }

  // 3. Build context string from relevant files' exports
  let totalChars = 0;
  for (const relPath of relevantFiles) {
    if (totalChars >= maxTokens) {break;}
    const node = graph.files.get(relPath);
    if (!node || node.exports.length === 0) {continue;}

    const fileSection = [`// ── ${relPath} ──`];
    for (const sym of node.exports) {
      const line = `export ${sym.signature};`;
      if (totalChars + line.length > maxTokens) {break;}
      fileSection.push(line);
      totalChars += line.length + 1;
    }
    sections.push(fileSection.join("\n"));
  }

  // 4. If we have room, add project-wide type definitions
  if (totalChars < maxTokens * 0.8) {
    for (const [filePath, node] of graph.files) {
      if (relevantFiles.has(filePath) || filePath === targetFile) {continue;}
      if (totalChars >= maxTokens) {break;}

      const types = node.exports.filter(s => s.kind === "interface" || s.kind === "type");
      if (types.length === 0) {continue;}

      const typeSection = [`// ── ${filePath} (types) ──`];
      for (const sym of types) {
        const line = `export ${sym.signature};`;
        if (totalChars + line.length > maxTokens) {break;}
        typeSection.push(line);
        totalChars += line.length + 1;
      }
      sections.push(typeSection.join("\n"));
    }
  }

  if (sections.length === 0) {return "";}

  return [
    "// ═══ CODEBASE CONTEXT ═══",
    "// These are the relevant types, functions, and APIs from the project:",
    "",
    ...sections,
    "",
    "// ═══ END CODEBASE CONTEXT ═══",
  ].join("\n");
}

/**
 * Get a summary of the entire project structure.
 * Useful for planning multi-file changes.
 */
export function getProjectSummary(projectId: string): string {
  const graph = graphCache.get(projectId);
  if (!graph || graph.files.size === 0) {
    return "Empty project — no code files found.";
  }

  const lines: string[] = [
    `Project has ${graph.files.size} code files:`,
    "",
  ];

  // Group by directory
  const dirs = new Map<string, FileNode[]>();
  for (const [, node] of graph.files) {
    const dir = path.dirname(node.relativePath) || ".";
    const list = dirs.get(dir) ?? [];
    list.push(node);
    dirs.set(dir, list);
  }

  for (const [dir, nodes] of dirs) {
    lines.push(`📁 ${dir}/`);
    for (const node of nodes) {
      const exportCount = node.exports.length;
      const basename = path.basename(node.relativePath);
      lines.push(`  - ${basename} (${exportCount} exports, ${node.imports.length} imports)`);
    }
  }

  return lines.join("\n");
}

// ─── Import Resolution ──────────────────────────────────────────

function resolveImport(
  fromFile: string,
  importPath: string,
  graph: RepoGraph,
): string | null {
  // Skip node builtins and node_modules
  if (importPath.startsWith("node:") || !importPath.startsWith(".")) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  const resolved = path.posix.normalize(path.posix.join(fromDir, importPath));

  // Try exact match, then with extensions
  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}.py`,
    `${resolved}/index.ts`,
    `${resolved}/index.tsx`,
    `${resolved}/index.js`,
  ];

  for (const candidate of candidates) {
    if (graph.files.has(candidate)) {
      return candidate;
    }
  }

  return null;
}
