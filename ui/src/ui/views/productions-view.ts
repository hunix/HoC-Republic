import { html, nothing, type TemplateResult } from "lit";

// ─── Types ────────────────────────────────────────────────────────

export interface OutputEntry {
  category: string;
  title: string;
  creatorName: string;
  creatorId: string;
  filename: string;
  tick: number;
  timestamp: string;
}

export interface OutputStats {
  [category: string]: number;
}

interface ProductionsProps {
  loading: boolean;
  items: OutputEntry[];
  stats: OutputStats | null;
  files: { name: string; category: string; size: number; path: string }[];
  selectedCategory: string | null;
  onCategorySelect: (cat: string | null) => void;
  onRefresh: () => void;
  onReadFile: (path: string) => Promise<{
    ok: boolean;
    isDirectory?: boolean;
    content?: string;
    encoding?: string;
    size?: number;
    files?: { path: string; content: string; size: number }[];
  } | null>;
  onWriteFile: (path: string, content: string) => Promise<boolean>;
  onDelete: (path: string) => Promise<boolean>;
}

// ─── Helpers ──────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { emoji: string; color: string; gradient: string }> = {
  art: { emoji: "🖼️", color: "#818cf8", gradient: "linear-gradient(135deg, #6366f1, #818cf8)" },
  music: { emoji: "🎵", color: "#f472b6", gradient: "linear-gradient(135deg, #ec4899, #f472b6)" },
  code: { emoji: "💻", color: "#34d399", gradient: "linear-gradient(135deg, #10b981, #34d399)" },
  games: { emoji: "🎮", color: "#a78bfa", gradient: "linear-gradient(135deg, #8b5cf6, #a78bfa)" },
  research: {
    emoji: "🔬",
    color: "#60a5fa",
    gradient: "linear-gradient(135deg, #3b82f6, #60a5fa)",
  },
  "3d-models": {
    emoji: "🧊",
    color: "#38bdf8",
    gradient: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
  },
  websites: {
    emoji: "🌐",
    color: "#2dd4bf",
    gradient: "linear-gradient(135deg, #14b8a6, #2dd4bf)",
  },
  podcasts: {
    emoji: "🎙️",
    color: "#fb923c",
    gradient: "linear-gradient(135deg, #f97316, #fb923c)",
  },
  inventions: {
    emoji: "💡",
    color: "#fbbf24",
    gradient: "linear-gradient(135deg, #f59e0b, #fbbf24)",
  },
  designs: { emoji: "🎨", color: "#c084fc", gradient: "linear-gradient(135deg, #a855f7, #c084fc)" },
  video: { emoji: "🎬", color: "#f87171", gradient: "linear-gradient(135deg, #ef4444, #f87171)" },
  "ml-models": {
    emoji: "🧠",
    color: "#fb7185",
    gradient: "linear-gradient(135deg, #f43f5e, #fb7185)",
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
  screenplays: {
    emoji: "📝",
    color: "#fda4af",
    gradient: "linear-gradient(135deg, #fb7185, #fda4af)",
  },
  chronicles: {
    emoji: "📜",
    color: "#d4a574",
    gradient: "linear-gradient(135deg, #b8860b, #d4a574)",
  },
  evolution: {
    emoji: "🧬",
    color: "#6ee7b7",
    gradient: "linear-gradient(135deg, #34d399, #6ee7b7)",
  },
  ads: { emoji: "📢", color: "#fcd34d", gradient: "linear-gradient(135deg, #fbbf24, #fcd34d)" },
};

const FILE_EXT_ICONS: Record<string, string> = {
  ts: "⚡",
  js: "📜",
  py: "🐍",
  rs: "🦀",
  go: "🐹",
  md: "📝",
  txt: "📄",
  json: "📋",
  yaml: "⚙️",
  yml: "⚙️",
  html: "🌐",
  css: "🎨",
  svg: "✏️",
  png: "🖼️",
  jpg: "📸",
  jpeg: "📸",
  gif: "🎞️",
  webp: "🖼️",
  wav: "🔊",
  mp3: "🎧",
  ogg: "🔉",
  flac: "🎶",
  mp4: "🎬",
  webm: "📹",
  avi: "🎥",
  pdf: "📕",
  csv: "📊",
  xlsx: "📗",
  gltf: "🧊",
  obj: "🧊",
  fbx: "🧊",
  stl: "🧊",
  gguf: "🧠",
  onnx: "🧠",
  safetensors: "🧠",
};

const PAGE_SIZE = 60;

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function getFileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function getFileIcon(name: string, category: string): string {
  if (name.endsWith("/")) {
    return "📁";
  }
  const ext = getFileExt(name);
  if (FILE_EXT_ICONS[ext]) {
    return FILE_EXT_ICONS[ext];
  }
  return CATEGORY_META[category]?.emoji ?? "📦";
}

function getCatMeta(cat: string) {
  return (
    CATEGORY_META[cat] ?? {
      emoji: "📦",
      color: "#94a3b8",
      gradient: "linear-gradient(135deg, #64748b, #94a3b8)",
    }
  );
}

// ─── Pagination State (module-level for simplicity) ───────────────
let _currentPage = 0;

// ─── Detail Page State ────────────────────────────────────────────
let _detailFile: { name: string; category: string; size: number; path: string } | null = null;
let _detailData: {
  isDirectory: boolean;
  files: { path: string; content: string; size: number }[];
  content?: string;
  encoding?: string;
} | null = null;
let _detailSelectedIndex = 0;
let _editContent = "";
let _isEditing = false;
let _isSaving = false;
let _confirmDelete = false;
let _detailLoading = false;

function detectLang(filepath: string): string {
  const ext = filepath.split(".").pop()?.toLowerCase() ?? "";
  const m: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TSX",
    js: "JavaScript",
    jsx: "JSX",
    html: "HTML",
    css: "CSS",
    json: "JSON",
    md: "Markdown",
    py: "Python",
    rs: "Rust",
    go: "Go",
    yaml: "YAML",
    yml: "YAML",
    txt: "Text",
    svg: "SVG",
    xml: "XML",
    csv: "CSV",
  };
  return m[ext] ?? ext.toUpperCase();
}

function buildLivePreview(files: { path: string; content: string; size: number }[]): string {
  const htmlFile = files.find((f) => f.path.endsWith(".html") || f.path.endsWith(".htm"));
  if (htmlFile && !htmlFile.content.startsWith("[")) {
    return htmlFile.content;
  }
  const svgFile = files.find((f) => f.path.endsWith(".svg"));
  if (svgFile && !svgFile.content.startsWith("[")) {
    return `<!DOCTYPE html><html><body style="background:#0d1117;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">${svgFile.content}</body></html>`;
  }
  const mainFile =
    files.find((f) => /\.(tsx|jsx)$/.test(f.path)) ??
    files.find((f) => /main\.(ts|js)$/.test(f.path)) ??
    files.find((f) => /index\.(ts|js)$/.test(f.path)) ??
    files[0];
  const cssFile = files.find((f) => f.path.endsWith(".css"));
  let h = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}`;
  if (cssFile && !cssFile.content.startsWith("[")) {
    h += cssFile.content;
  }
  h += `</style></head><body><div style="padding:40px;max-width:600px"><div style="font-size:3rem;margin-bottom:16px">🏭</div>`;
  h += `<h2 style="color:#a855f7;margin-bottom:8px">Project Preview</h2>`;
  h += `<p style="color:#8b949e;font-size:0.85rem;margin-bottom:16px">${files.length} file${files.length > 1 ? "s" : ""} — install deps and run locally for full interactivity</p>`;
  if (mainFile && !mainFile.content.startsWith("[")) {
    h += `<div style="text-align:left;background:#161b22;border-radius:8px;padding:12px;max-height:300px;overflow:auto">`;
    h += `<pre style="font-size:0.72rem;color:#c9d1d9;font-family:'Fira Code',monospace;white-space:pre-wrap">${mainFile.content.slice(0, 3000)}</pre></div>`;
  }
  h += `</div></body></html>`;
  return h;
}

// ─── Render ───────────────────────────────────────────────────────

export function renderProductions(props: ProductionsProps): TemplateResult {
  const { loading, items, stats, files, selectedCategory, onCategorySelect, onRefresh } = props;

  if (loading && files.length === 0 && items.length === 0) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <span>Loading productions…</span>
      </div>
    `;
  }

  // Detail page mode
  if (_detailFile && _detailData) {
    return html`
      <div class="republic-view">
        ${renderDetailPage(props)}
      </div>
    `;
  }

  const filtered = selectedCategory ? files.filter((f) => f.category === selectedCategory) : files;
  const totalSize = filtered.reduce((s, f) => s + f.size, 0);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (_currentPage >= totalPages) {
    _currentPage = Math.max(0, totalPages - 1);
  }
  const pageFiles = filtered.slice(_currentPage * PAGE_SIZE, (_currentPage + 1) * PAGE_SIZE);

  return html`
    <div class="republic-view">
      ${renderHero(files, stats, onRefresh, loading)}
      ${renderCategoryPills(stats, files, selectedCategory, onCategorySelect)}
      ${renderFileGrid(pageFiles, filtered.length, totalSize, selectedCategory, props)}
      ${totalPages > 1 ? renderPagination(_currentPage, totalPages) : nothing}
      ${renderRecentLog(items)}
    </div>
  `;
}

// ─── Hero Section ─────────────────────────────────────────────────

function renderHero(
  files: ProductionsProps["files"],
  stats: OutputStats | null,
  onRefresh: () => void,
  loading: boolean,
): TemplateResult {
  const totalFiles = files.length;
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const categories = new Set(files.map((f) => f.category));
  const logEntries = stats ? Object.values(stats).reduce((a, b) => a + b, 0) : 0;

  return html`
    <div class="republic-hero">
      <div class="republic-hero__header">
        <h2 class="republic-hero__title">
          <span style="font-size:1.4rem">🏭</span> Republic Productions
        </h2>
        <div style="display:flex;gap:0.5rem;align-items:center">
          ${
            totalFiles > 0
              ? html`<span class="republic-hero__badge republic-hero__badge--live">
                ● ${formatNumber(totalFiles)} files
              </span>`
              : nothing
          }
          <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm" @click=${onRefresh} ?disabled=${loading}>
            ${loading ? "⏳" : "↻"} Refresh
          </button>
        </div>
      </div>
      <div class="republic-metrics">
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${formatNumber(totalFiles)}</div>
          <div class="republic-metric__label">Total Files</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${formatSize(totalSize)}</div>
          <div class="republic-metric__label">Total Size</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value republic-metric__value--green">${categories.size}</div>
          <div class="republic-metric__label">Categories</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${formatNumber(logEntries)}</div>
          <div class="republic-metric__label">Log Entries</div>
        </div>
      </div>
    </div>
  `;
}

// ─── Category Pills ───────────────────────────────────────────────

function renderCategoryPills(
  stats: OutputStats | null,
  files: ProductionsProps["files"],
  selected: string | null,
  onSelect: (cat: string | null) => void,
): TemplateResult {
  // Build counts from files (more accurate than stats for disk files)
  const catCounts = new Map<string, number>();
  for (const f of files) {
    catCounts.set(f.category, (catCounts.get(f.category) ?? 0) + 1);
  }
  // Also include stats-only categories
  if (stats) {
    for (const [cat, count] of Object.entries(stats)) {
      if (!catCounts.has(cat) && count > 0) {
        catCounts.set(cat, count);
      }
    }
  }
  const entries = [...catCounts.entries()].toSorted((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return html``;
  }

  return html`
    <div class="republic-card republic-card--compact republic-card--wide" style="overflow-x:auto">
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        <button type="button"
          class="republic-btn ${selected === null ? "" : "republic-btn--secondary"} republic-btn--sm"
          @click=${() => {
            _currentPage = 0;
            onSelect(null);
          }}
          style="border-radius:20px"
        >
          📦 All (${formatNumber(files.length)})
        </button>
        ${entries.map(([cat, count]) => {
          const meta = getCatMeta(cat);
          const isActive = selected === cat;
          return html`
            <button type="button"
              class="republic-btn republic-btn--sm ${isActive ? "" : "republic-btn--secondary"}"
              @click=${() => {
                _currentPage = 0;
                onSelect(cat);
              }}
              style="border-radius:20px;${isActive ? `background:${meta.gradient};box-shadow:0 2px 12px ${meta.color}33` : ""}"
            >
              ${meta.emoji} ${cat}
              <span class="republic-badge" style="margin-left:2px;font-size:0.7rem">${formatNumber(count)}</span>
            </button>
          `;
        })}
      </div>
    </div>
  `;
}

// ─── File Grid ────────────────────────────────────────────────────

function renderFileGrid(
  pageFiles: ProductionsProps["files"],
  totalFiltered: number,
  totalSize: number,
  selectedCategory: string | null,
  props: ProductionsProps,
): TemplateResult {
  if (totalFiltered === 0) {
    return html`
      <div class="republic-empty">
        <div class="republic-empty__icon">🏭</div>
        <h3>No Productions Yet</h3>
        <p>${
          selectedCategory
            ? `No files found in "${selectedCategory}". Try selecting a different category or run the simulation longer.`
            : "Run the simulation to start generating content! Citizens will create music, code, art, research, and much more."
        }</p>
      </div>
    `;
  }

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h4>
          📂 ${
            selectedCategory
              ? `${getCatMeta(selectedCategory).emoji} ${selectedCategory}`
              : "All Files"
          }
          <span class="republic-tag" style="margin-left:8px">${formatNumber(totalFiltered)} files</span>
          <span class="republic-tag republic-tag--green" style="margin-left:4px">${formatSize(totalSize)}</span>
        </h4>
      </div>
      <div class="republic-cards republic-cards--three">
        ${pageFiles.map((f) => renderFileCard(f, props))}
      </div>
    </div>
  `;
}

function renderFileCard(
  f: { name: string; category: string; size: number; path: string },
  props: ProductionsProps,
): TemplateResult {
  const meta = getCatMeta(f.category);
  const icon = getFileIcon(f.name, f.category);
  const ext = getFileExt(f.name);
  const isProject = f.name.endsWith("/");
  const fileUrl = `/${f.path}`;

  // Open detail page handler
  const openDetail = async (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    _detailFile = f;
    _detailLoading = true;
    _detailSelectedIndex = 0;
    _isEditing = false;
    _confirmDelete = false;
    _detailData = null;
    try {
      const res = await props.onReadFile(f.path);
      if (res?.ok) {
        _detailData = {
          isDirectory: !!res.isDirectory,
          files:
            res.files ??
            (res.content !== undefined
              ? [{ path: f.name, content: res.content, size: res.size ?? 0 }]
              : []),
          content: res.content,
          encoding: res.encoding,
        };
        if (_detailData.files.length > 0) {
          _editContent = _detailData.files[0].content;
        }
      }
    } catch {
      /* ignore */
    }
    _detailLoading = false;
  };

  // Determine preview type based on extension
  const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
  const AUDIO_EXTS = new Set(["wav", "mp3", "ogg", "flac", "aac"]);
  const VIDEO_EXTS = new Set(["mp4", "webm", "avi"]);
  const CODE_EXTS = new Set([
    "ts",
    "js",
    "py",
    "rs",
    "go",
    "tsx",
    "jsx",
    "java",
    "c",
    "cpp",
    "h",
    "rb",
    "sh",
    "bash",
    "css",
    "sql",
  ]);
  const TEXT_EXTS = new Set([
    "md",
    "txt",
    "json",
    "yaml",
    "yml",
    "csv",
    "xml",
    "toml",
    "ini",
    "cfg",
    "log",
    "musicxml",
  ]);
  const DOC_EXTS = new Set(["pdf"]);
  const MODEL_3D_EXTS = new Set(["gltf", "obj", "fbx", "stl", "glb"]);
  const PLAYABLE_HTML = new Set(["games", "websites", "video", "ads", "designs"]);

  const isImage = IMAGE_EXTS.has(ext);
  const isAudio = AUDIO_EXTS.has(ext);
  const isVideo = VIDEO_EXTS.has(ext);
  const isCode = CODE_EXTS.has(ext);
  const isText = TEXT_EXTS.has(ext);
  const isDoc = DOC_EXTS.has(ext);
  const is3DModel = MODEL_3D_EXTS.has(ext);
  const isPlayableHtml = ext === "html" && PLAYABLE_HTML.has(f.category);
  const isGame = f.category === "games" && ext === "html";
  const isWebsite = f.category === "websites" && ext === "html";
  const isInteractiveHtml = isPlayableHtml && !isGame && !isWebsite; // video, ads, designs

  // Language label for code files
  const LANG_LABELS: Record<string, string> = {
    ts: "TypeScript",
    js: "JavaScript",
    py: "Python",
    rs: "Rust",
    go: "Go",
    tsx: "TSX",
    jsx: "JSX",
    java: "Java",
    c: "C",
    cpp: "C++",
    h: "Header",
    rb: "Ruby",
    sh: "Shell",
    bash: "Bash",
    css: "CSS",
    html: "HTML",
    sql: "SQL",
  };

  // Unique ID for interactive elements
  const cardId = `card-${f.name.replace(/[^a-zA-Z0-9]/g, "_")}`;

  return html`
    <div class="republic-card republic-card--compact"
         style="cursor:pointer;display:flex;flex-direction:column;gap:0;min-height:72px;overflow:hidden;padding:0;transition:all 0.2s"
         title="Click to open ${f.name}"
         @click=${openDetail}
         @mouseenter=${(e: Event) => {
           (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 30px ${meta.color}22`;
           (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
         }}
         @mouseleave=${(e: Event) => {
           (e.currentTarget as HTMLElement).style.boxShadow = "";
           (e.currentTarget as HTMLElement).style.transform = "";
         }}>

      ${
        isGame && !isProject
          ? html`
        <!-- 🎮 GAME: Iframe with Play overlay -->
        <div id="${cardId}" style="width:100%;aspect-ratio:16/10;overflow:hidden;background:#0a0a0a;position:relative;cursor:pointer"
             @click=${(e: Event) => {
               const container = e.currentTarget as HTMLElement;
               const overlay = container.querySelector(".play-overlay") as HTMLElement;
               const iframe = container.querySelector("iframe") as HTMLIFrameElement;
               if (overlay && iframe) {
                 overlay.style.display = "none";
                 iframe.src = fileUrl;
                 iframe.style.pointerEvents = "auto";
               }
             }}>
          <iframe style="width:100%;height:100%;border:none;pointer-events:none;background:#000"
                  sandbox="allow-scripts allow-same-origin"
                  loading="lazy"></iframe>
          <div class="play-overlay" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
               background:linear-gradient(135deg, #0f0f23 0%, #1a0a2e 50%, #0a1628 100%);gap:12px;transition:opacity 0.3s">
            <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#818cf8,#6366f1);
                 display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px #818cf880;
                 transition:transform 0.2s"
                 @mouseenter=${(e: Event) => {
                   (e.target as HTMLElement).style.transform = "scale(1.1)";
                 }}
                 @mouseleave=${(e: Event) => {
                   (e.target as HTMLElement).style.transform = "scale(1)";
                 }}>
              <span style="font-size:28px;margin-left:4px">▶</span>
            </div>
            <span style="color:#818cf8;font-size:0.8rem;font-weight:600;text-transform:uppercase;letter-spacing:2px">Play Game</span>
            <span style="color:#888;font-size:0.7rem">${f.name
              .replace(/_/g, " ")
              .replace(/\.html$/, "")
              .replace(/^[a-f0-9]+\s/, "")}</span>
          </div>
        </div>
      `
          : isWebsite && !isProject
            ? html`
        <!-- 🌐 WEBSITE: Live iframe preview -->
        <div id="${cardId}" style="width:100%;aspect-ratio:4/3;overflow:hidden;background:#fff;position:relative;cursor:pointer"
             @click=${(e: Event) => {
               const container = e.currentTarget as HTMLElement;
               const overlay = container.querySelector(".play-overlay") as HTMLElement;
               const iframe = container.querySelector("iframe") as HTMLIFrameElement;
               if (overlay && iframe) {
                 overlay.style.display = "none";
                 iframe.src = fileUrl;
                 iframe.style.pointerEvents = "auto";
               }
             }}>
          <iframe style="width:400%;height:400%;border:none;pointer-events:none;transform:scale(0.25);transform-origin:0 0;background:#fff"
                  sandbox="allow-scripts allow-same-origin"
                  loading="lazy"></iframe>
          <div class="play-overlay" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
               background:linear-gradient(135deg, #0a1628 0%, #0f2840 50%, #0a1628 100%);gap:10px;transition:opacity 0.3s">
            <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#38bdf8,#0ea5e9);
                 display:flex;align-items:center;justify-content:center;box-shadow:0 0 25px #38bdf880">
              <span style="font-size:24px">🌐</span>
            </div>
            <span style="color:#38bdf8;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:2px">Preview Site</span>
          </div>
        </div>
      `
            : isInteractiveHtml && !isProject
              ? html`
        <!-- 🎬 Interactive HTML (video, ads, designs) -->
        <div id="${cardId}" style="width:100%;aspect-ratio:16/9;overflow:hidden;background:#0a0a0a;position:relative;cursor:pointer"
             @click=${(e: Event) => {
               const container = e.currentTarget as HTMLElement;
               const overlay = container.querySelector(".play-overlay") as HTMLElement;
               const iframe = container.querySelector("iframe") as HTMLIFrameElement;
               if (overlay && iframe) {
                 overlay.style.display = "none";
                 iframe.src = fileUrl;
                 iframe.style.pointerEvents = "auto";
               }
             }}>
          <iframe style="width:100%;height:100%;border:none;pointer-events:none;background:#000"
                  sandbox="allow-scripts allow-same-origin"
                  loading="lazy"></iframe>
          <div class="play-overlay" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
               background:linear-gradient(135deg, #0a0a1a 0%, #1a0a28 50%, #0a0a1a 100%);gap:12px;transition:opacity 0.3s">
            <div style="width:60px;height:60px;border-radius:50%;background:${meta.gradient};
                 display:flex;align-items:center;justify-content:center;box-shadow:0 0 25px ${meta.color}80;
                 transition:transform 0.2s"
                 @mouseenter=${(e: Event) => {
                   (e.target as HTMLElement).style.transform = "scale(1.1)";
                 }}
                 @mouseleave=${(e: Event) => {
                   (e.target as HTMLElement).style.transform = "scale(1)";
                 }}>
              <span style="font-size:24px">${f.category === "video" ? "▶" : meta.emoji}</span>
            </div>
            <span style="color:${meta.color};font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:2px">${f.category === "video" ? "Watch" : f.category === "ads" ? "View Ad" : "Preview"}</span>
          </div>
        </div>
      `
              : isImage && !isProject
                ? html`
        <!-- 🖼️ Image Preview -->
        <div style="width:100%;aspect-ratio:4/3;overflow:hidden;background:#111;display:flex;align-items:center;justify-content:center;position:relative">
          <img src=${fileUrl} alt=${f.name} loading="lazy"
               style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s ease"
               @error=${(e: Event) => {
                 (e.target as HTMLElement).style.display = "none";
               }} />
          <div style="position:absolute;bottom:0;left:0;right:0;height:40px;background:linear-gradient(transparent, rgba(0,0,0,0.7))"></div>
        </div>
      `
                : isAudio && !isProject
                  ? html`
        <!-- 🎵 Audio Player -->
        <div style="width:100%;padding:20px 14px 12px;background:${meta.gradient};display:flex;flex-direction:column;align-items:center;gap:10px">
          <div style="display:flex;align-items:center;gap:12px;width:100%">
            <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.15);backdrop-filter:blur(8px);
                 display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0">
              ${f.category === "podcasts" ? "🎙️" : "🎵"}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:0.78rem;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${f.name
                  .replace(/_/g, " ")
                  .replace(/\.[^.]+$/, "")
                  .replace(/^[a-f0-9]+\s/, "")}
              </div>
              <div style="font-size:0.68rem;color:rgba(255,255,255,0.7);margin-top:2px">
                ${ext.toUpperCase()} • ${formatSize(f.size)}
              </div>
            </div>
          </div>
          <audio controls preload="metadata"
                 style="width:100%;height:36px;border-radius:18px;filter:brightness(1.3) contrast(0.9)"
                 crossorigin="anonymous">
            <source src=${fileUrl} type=${ext === "mp3" ? "audio/mpeg" : ext === "ogg" ? "audio/ogg" : ext === "flac" ? "audio/flac" : ext === "aac" ? "audio/aac" : "audio/wav"} />
            Your browser does not support the audio element.
          </audio>
        </div>
      `
                  : isVideo && !isProject
                    ? html`
        <!-- 🎬 Video Player -->
        <div style="width:100%;aspect-ratio:16/9;overflow:hidden;background:#000;position:relative">
          <video controls preload="metadata" style="width:100%;height:100%;object-fit:contain"
                 crossorigin="anonymous" playsinline>
            <source src=${fileUrl} type=${ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : "video/x-msvideo"} />
          </video>
        </div>
      `
                    : is3DModel && !isProject
                      ? html`
        <!-- 🧊 3D Model Preview -->
        <div style="width:100%;aspect-ratio:4/3;overflow:hidden;background:linear-gradient(135deg, #0f0f23, #1a1a3e);
             display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;position:relative">
          <div style="width:60px;height:60px;animation:spin3d 4s linear infinite;perspective:200px">
            <div style="width:100%;height:100%;background:linear-gradient(135deg,#818cf8,#6366f1);
                 border-radius:8px;transform:rotateX(30deg) rotateY(45deg);
                 box-shadow:0 0 20px #818cf840"></div>
          </div>
          <span style="color:#818cf8;font-size:0.75rem;font-weight:600">3D MODEL</span>
          <span style="color:#666;font-size:0.68rem">.${ext.toUpperCase()} • ${formatSize(f.size)}</span>
          <a href=${fileUrl} target="_blank" rel="noopener"
             style="position:absolute;bottom:8px;right:8px;font-size:0.7rem;color:#818cf8;text-decoration:none;
                    background:rgba(129,140,248,0.1);padding:4px 10px;border-radius:12px">
            Download ↗
          </a>
        </div>
        <style>
          @keyframes spin3d {
            from { transform: rotateY(0deg); }
            to { transform: rotateY(360deg); }
          }
        </style>
      `
                      : isCode && !isProject
                        ? html`
        <!-- 💻 Code Preview -->
        <div style="width:100%;height:130px;overflow:hidden;background:#0d1117;padding:10px 12px;font-family:'Fira Code','Cascadia Code',monospace;font-size:0.72rem;line-height:1.5;color:#c9d1d9;position:relative">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <span style="width:10px;height:10px;border-radius:50%;background:#ff5f57;display:inline-block"></span>
            <span style="width:10px;height:10px;border-radius:50%;background:#febc2e;display:inline-block"></span>
            <span style="width:10px;height:10px;border-radius:50%;background:#28c840;display:inline-block"></span>
            <span style="margin-left:8px;font-size:0.65rem;color:#8b949e">${LANG_LABELS[ext] ?? ext.toUpperCase()}</span>
          </div>
          <div style="color:#8b949e;font-size:0.68rem;line-height:1.8">
            <div><span style="color:#ff7b72">import</span> <span style="color:#c9d1d9">{ ${f.name.split("_").slice(-1)[0]?.split(".")[0] ?? "module"} }</span> <span style="color:#ff7b72">from</span> <span style="color:#a5d6ff">"./lib"</span>;</div>
            <div><span style="color:#ff7b72">export</span> <span style="color:#d2a8ff">function</span> <span style="color:#79c0ff">${f.name.split("_")[1] ?? "main"}</span>() {</div>
            <div>  <span style="color:#8b949e">// ${f.category} production — ${formatSize(f.size)}</span></div>
            <div>  <span style="color:#ff7b72">return</span> <span style="color:#a5d6ff">"..."</span>;</div>
            <div>}</div>
          </div>
          <div style="position:absolute;bottom:0;left:0;right:0;height:30px;background:linear-gradient(transparent, #0d1117)"></div>
        </div>
      `
                        : isText && !isProject
                          ? html`
        <!-- 📝 Text/Document Preview -->
        <div style="width:100%;height:120px;overflow:hidden;background:var(--card-bg, #1a1a2e);padding:12px 14px;position:relative;border-bottom:1px solid var(--border, #222)">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <span style="font-size:1.1rem">${icon}</span>
            <span style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600">${ext} document</span>
          </div>
          <div style="font-size:0.75rem;line-height:1.6;color:var(--muted);opacity:0.7">
            <div style="height:8px;background:var(--muted);opacity:0.15;border-radius:2px;width:90%;margin-bottom:4px"></div>
            <div style="height:8px;background:var(--muted);opacity:0.12;border-radius:2px;width:75%;margin-bottom:4px"></div>
            <div style="height:8px;background:var(--muted);opacity:0.10;border-radius:2px;width:85%;margin-bottom:4px"></div>
            <div style="height:8px;background:var(--muted);opacity:0.08;border-radius:2px;width:60%"></div>
          </div>
          <div style="position:absolute;bottom:0;left:0;right:0;height:28px;background:linear-gradient(transparent, var(--card-bg, #1a1a2e))"></div>
        </div>
      `
                          : isDoc && !isProject
                            ? html`
        <!-- 📕 PDF / Document -->
        <div style="width:100%;aspect-ratio:4/3;background:${meta.gradient};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
          <span style="font-size:3rem;filter:brightness(10) saturate(0)">${icon}</span>
          <a href=${fileUrl} target="_blank" rel="noopener"
             style="font-size:0.75rem;color:white;text-decoration:underline;opacity:0.9">
            Open PDF ↗
          </a>
        </div>
      `
                            : isProject
                              ? html`
        <!-- 📁 Project Folder -->
        <div style="width:100%;padding:20px;background:${meta.gradient};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
          <span style="font-size:2.5rem;filter:brightness(10) saturate(0)">📁</span>
          <span style="font-size:0.75rem;color:white;opacity:0.8">Multi-file Project</span>
        </div>
      `
                              : html`
        <!-- Generic File -->
        <div style="width:100%;padding:20px;background:${meta.gradient};display:flex;align-items:center;justify-content:center">
          <span style="font-size:2.5rem;filter:brightness(10) saturate(0)">${icon}</span>
        </div>
      `
      }

      <!-- File Info Footer -->
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:4px">
        <div style="font-size:0.82rem;font-weight:600;color:var(--text-strong);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
             title=${f.name}>
          ${f.name}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="republic-tag republic-tag--sm" style="background:${meta.color}22;color:${meta.color}">
            ${meta.emoji} ${f.category}
          </span>
          ${
            ext && !isProject
              ? html`<span class="republic-tag republic-tag--sm">.${ext}</span>`
              : nothing
          }
          <span style="font-size:0.72rem;color:var(--muted);margin-left:auto">${formatSize(f.size)}</span>
        </div>
        ${
          !isProject
            ? html`
          <div style="display:flex;gap:8px;margin-top:2px">
            ${
              isPlayableHtml
                ? html`
              <a href=${fileUrl} target="_blank" rel="noopener"
                 style="font-size:0.72rem;color:${meta.color};text-decoration:none;opacity:0.9;font-weight:600">
                ${isGame ? "🎮 Fullscreen" : "🌐 Open"} ↗
              </a>
            `
                : html`
              <a href=${fileUrl} target="_blank" rel="noopener"
                 style="font-size:0.72rem;color:${meta.color};text-decoration:none;opacity:0.8;margin-top:2px">
                ${isAudio ? "🎧 Play" : isVideo ? "🎬 Watch" : isImage ? "🔍 Full Size" : isCode ? "📝 View Source" : "📥 Download"} ↗
              </a>
            `
            }
          </div>
        `
            : nothing
        }
      </div>
    </div>
  `;
}

// ─── Detail Page ──────────────────────────────────────────────────

function renderDetailPage(props: ProductionsProps): TemplateResult {
  const f = _detailFile!;
  const data = _detailData!;
  const meta = getCatMeta(f.category);
  const files = data.files;
  const current = files[_detailSelectedIndex] ?? files[0];
  const isProject = f.name.endsWith("/");
  const isBinary = current?.content?.startsWith("[") ?? false;
  const isAudioExt = /\.(wav|mp3|ogg|flac|aac)$/i.test(current?.path ?? "");

  return html`
    <!-- Sticky Back Nav -->
    <div style="position:sticky;top:0;z-index:50;background:linear-gradient(180deg,rgba(15,15,20,0.98) 60%,transparent);padding:12px 0 20px 0;margin-bottom:8px;display:flex;align-items:center;gap:12px">
      <button type="button" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:10px;border:1px solid rgba(168,85,247,0.2);background:rgba(168,85,247,0.06);color:#a855f7;font-size:0.82rem;font-weight:600;cursor:pointer;backdrop-filter:blur(12px);transition:all 0.2s;font-family:inherit"
              @click=${() => {
                _detailFile = null;
                _detailData = null;
                _isEditing = false;
                _confirmDelete = false;
              }}>
        <span style="font-size:1.1rem">←</span> Back to Productions
      </button>
      <div style="margin-left:auto;display:flex;gap:8px">
        ${
          _confirmDelete
            ? html`
          <span style="font-size:0.78rem;color:#ef4444;font-weight:600;align-self:center">Delete permanently?</span>
          <button type="button" style="padding:6px 16px;border-radius:8px;border:1px solid #ef4444;background:#ef444420;color:#ef4444;font-size:0.78rem;cursor:pointer;font-family:inherit;font-weight:600"
                  @click=${async () => {
                    const ok = await props.onDelete(f.path);
                    if (ok) {
                      _detailFile = null;
                      _detailData = null;
                      _confirmDelete = false;
                    }
                  }}>
            🗑️ Yes, Delete
          </button>
          <button type="button" style="padding:6px 16px;border-radius:8px;border:1px solid var(--border,#333);background:transparent;color:var(--muted,#999);font-size:0.78rem;cursor:pointer;font-family:inherit"
                  @click=${() => {
                    _confirmDelete = false;
                  }}>
            Cancel
          </button>
        `
            : html`
          <button type="button" style="padding:6px 16px;border-radius:8px;border:1px solid #ef444440;background:#ef444410;color:#ef4444;font-size:0.78rem;cursor:pointer;font-family:inherit;font-weight:600;transition:all 0.2s"
                  @click=${() => {
                    _confirmDelete = true;
                  }}>
            🗑️ Delete
          </button>
        `
        }
      </div>
    </div>

    <!-- Hero -->
    <div style="border-radius:16px;overflow:hidden;background:linear-gradient(135deg,${meta.gradient.replace("linear-gradient(135deg, ", "").replace(")", "")});padding:24px 28px;display:flex;align-items:center;gap:16px;margin-bottom:16px">
      <div style="font-size:2.5rem;width:64px;height:64px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.15);border-radius:16px">${meta.emoji}</div>
      <div style="flex:1;min-width:0">
        <h2 style="font-size:1.2rem;font-weight:700;color:#fff;margin:0 0 4px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name.replace(/\/$/, "")}</h2>
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span>${meta.emoji} ${f.category}</span>
          <span>📁 ${files.length} file${files.length > 1 ? "s" : ""}</span>
          <span>💾 ${formatSize(files.reduce((s, fi) => s + fi.size, 0))}</span>
          ${
            isProject
              ? html`
                  <span
                    style="
                      background: rgba(255, 255, 255, 0.15);
                      padding: 2px 10px;
                      border-radius: 12px;
                      font-size: 0.68rem;
                    "
                    >📂 Project</span
                  >
                `
              : nothing
          }
        </div>
      </div>
    </div>

    <!-- Three-Pane Layout -->
    <div style="display:grid;grid-template-columns:${files.length > 1 ? "200px" : "0px"} 1fr 1fr;gap:12px;height:520px;margin-bottom:16px">

      <!-- File Browser (only for multi-file projects) -->
      ${
        files.length > 1
          ? html`
        <div class="republic-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
          <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.72rem;font-weight:700;color:var(--text-strong,#e0e0e0);display:flex;align-items:center;gap:6px">
            📂 Files <span style="margin-left:auto;color:var(--muted,#999);font-weight:400">${files.length}</span>
          </div>
          <div style="flex:1;overflow-y:auto;padding:6px 0">
            ${files.map((fi, i) => {
              const isActive = i === _detailSelectedIndex;
              const fname = fi.path.split("/").pop() ?? fi.path;
              const ficon = getFileIcon(fname, f.category);
              return html`
                <div style="padding:5px 12px;cursor:pointer;font-size:0.72rem;font-family:'Fira Code',monospace;
                            display:flex;align-items:center;gap:6px;transition:all 0.15s;
                            background:${isActive ? `${meta.color}22` : "transparent"};
                            color:${isActive ? meta.color : "var(--muted,#999)"};
                            border-left:2px solid ${isActive ? meta.color : "transparent"}"
                     @click=${(e: Event) => {
                       e.stopPropagation();
                       _detailSelectedIndex = i;
                       _editContent = fi.content;
                       _isEditing = false;
                     }}>
                  <span>${ficon}</span>
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title=${fi.path}>${fname}</span>
                  <span style="margin-left:auto;font-size:0.6rem;color:var(--muted,#666)">${formatSize(fi.size)}</span>
                </div>`;
            })}
          </div>
        </div>
      `
          : nothing
      }

      <!-- Code Viewer / Editor -->
      <div class="republic-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;${files.length <= 1 ? "grid-column:1/3;" : ""}">
        <div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:6px">
          <div style="display:flex;gap:5px">
            <div style="width:9px;height:9px;border-radius:50%;background:#ff5f56"></div>
            <div style="width:9px;height:9px;border-radius:50%;background:#ffbd2e"></div>
            <div style="width:9px;height:9px;border-radius:50%;background:#27c93f"></div>
          </div>
          <span style="font-size:0.68rem;color:var(--muted,#999);font-family:monospace;margin-left:6px">${current?.path ?? "—"}</span>
          <span style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase">${detectLang(current?.path ?? "")}</span>
          <div style="margin-left:auto;display:flex;gap:6px">
            ${
              !isBinary
                ? html`
              ${
                _isEditing
                  ? html`
                <button type="button" style="padding:4px 12px;border-radius:6px;border:1px solid #22c55e40;background:#22c55e15;color:#22c55e;font-size:0.68rem;cursor:pointer;font-family:inherit;font-weight:600"
                        ?disabled=${_isSaving}
                        @click=${async () => {
                          _isSaving = true;
                          const filePath = data.isDirectory ? f.path + current.path : f.path;
                          const ok = await props.onWriteFile(filePath, _editContent);
                          if (ok) {
                            current.content = _editContent;
                            _isEditing = false;
                          }
                          _isSaving = false;
                        }}>
                  ${_isSaving ? "⏳ Saving..." : "✅ Save"}
                </button>
                <button type="button" style="padding:4px 12px;border-radius:6px;border:1px solid var(--border,#333);background:transparent;color:var(--muted,#999);font-size:0.68rem;cursor:pointer;font-family:inherit"
                        @click=${() => {
                          _isEditing = false;
                          _editContent = current.content;
                        }}>
                  Cancel
                </button>
              `
                  : html`
                <button type="button" style="padding:4px 12px;border-radius:6px;border:1px solid ${meta.color}40;background:${meta.color}10;color:${meta.color};font-size:0.68rem;cursor:pointer;font-family:inherit;font-weight:600"
                        @click=${() => {
                          _isEditing = true;
                          _editContent = current.content;
                        }}>
                  ✏️ Edit
                </button>
              `
              }
            `
                : nothing
            }
          </div>
        </div>
        <div style="flex:1;overflow:auto;background:#0d1117">
          ${
            isBinary
              ? html`
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--muted,#999)">
              <span style="font-size:3rem">${isAudioExt ? "🎵" : "📀"}</span>
              <span style="font-size:0.85rem;font-weight:600">${current.content}</span>
              ${
                isAudioExt
                  ? html`
                <audio controls style="margin-top:8px;width:80%">
                  <source src="/${f.path}" />
                </audio>
              `
                  : nothing
              }
            </div>
          `
              : _isEditing
                ? html`
            <textarea
              style="width:100%;height:100%;background:#0d1117;color:#c9d1d9;border:none;padding:12px;font-size:0.72rem;line-height:1.6;font-family:'Fira Code','Cascadia Code',monospace;resize:none;outline:none"
              .value=${_editContent}
              @input=${(e: Event) => {
                _editContent = (e.target as HTMLTextAreaElement).value;
              }}
            ></textarea>
          `
                : html`
            <pre style="margin:0;padding:12px;font-size:0.72rem;line-height:1.6;color:#c9d1d9;font-family:'Fira Code','Cascadia Code',monospace;white-space:pre-wrap;word-break:break-word">${current?.content ?? ""}</pre>
          `
          }
        </div>
      </div>

      <!-- Live Preview -->
      <div class="republic-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
        <div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
          <span style="font-size:0.72rem;color:var(--muted,#999)">🖥️ Live Preview</span>
          <span style="margin-left:auto;font-size:0.6rem;color:#22c55e;display:flex;align-items:center;gap:4px">
            <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block"></span> Ready
          </span>
        </div>
        <div style="flex:1;background:#fff;position:relative">
          <iframe
            sandbox="allow-scripts"
            srcdoc=${buildLivePreview(files)}
            style="width:100%;height:100%;border:none;background:#fff"
            title="Live Preview"
          ></iframe>
        </div>
      </div>
    </div>

    <!-- Metadata -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Category</div>
        <div style="font-size:0.85rem;color:${meta.color};font-weight:600">${meta.emoji} ${f.category}</div>
      </div>
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Files</div>
        <div style="font-size:0.85rem;font-weight:700;color:#22c55e">${files.length}</div>
      </div>
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Total Size</div>
        <div style="font-size:0.85rem;color:var(--text-strong,#e0e0e0)">${formatSize(files.reduce((s, fi) => s + fi.size, 0))}</div>
      </div>
      <div class="republic-card" style="padding:14px;text-align:center">
        <div style="font-size:0.6rem;color:var(--muted,#999);text-transform:uppercase;margin-bottom:4px">Path</div>
        <code style="font-size:0.68rem;color:${meta.color};word-break:break-all">${f.path}</code>
      </div>
    </div>
  `;
}

// ─── Pagination ───────────────────────────────────────────────────

function renderPagination(current: number, total: number): TemplateResult {
  const pages: (number | "...")[] = [];
  if (total <= 7) {
    for (let i = 0; i < total; i++) {
      pages.push(i);
    }
  } else {
    pages.push(0);
    if (current > 2) {
      pages.push("...");
    }
    for (let i = Math.max(1, current - 1); i <= Math.min(total - 2, current + 1); i++) {
      pages.push(i);
    }
    if (current < total - 3) {
      pages.push("...");
    }
    pages.push(total - 1);
  }

  return html`
    <div style="display:flex;justify-content:center;gap:4px;align-items:center;flex-wrap:wrap">
      <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm"
              ?disabled=${current === 0}
              @click=${() => {
                _currentPage = current - 1;
              }}
              style="border-radius:8px;min-width:36px">◀</button>
      ${pages.map((p) => {
        if (p === "...") {
          return html`
            <span style="padding: 0 6px; color: var(--muted)">…</span>
          `;
        }
        return html`
          <button type="button" class="republic-btn republic-btn--sm ${p === current ? "" : "republic-btn--secondary"}"
                  @click=${() => {
                    _currentPage = p;
                  }}
                  style="border-radius:8px;min-width:36px">
            ${p + 1}
          </button>
        `;
      })}
      <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm"
              ?disabled=${current >= total - 1}
              @click=${() => {
                _currentPage = current + 1;
              }}
              style="border-radius:8px;min-width:36px">▶</button>
      <span style="margin-left:8px;font-size:0.8rem;color:var(--muted)">
        Page ${current + 1} of ${total}
      </span>
    </div>
  `;
}

// ─── Recent Output Log ────────────────────────────────────────────

function renderRecentLog(items: OutputEntry[]): TemplateResult {
  if (items.length === 0) {
    return html`
      <div class="republic-card republic-card--wide">
        <div class="republic-card__header">
          <h4>📋 Recent Production Log</h4>
        </div>
        <div class="republic-card__empty">
          No recent productions logged. Start the simulation to see activity here.
        </div>
      </div>
    `;
  }

  const recent = items.slice().toReversed().slice(0, 50);

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h4>📋 Recent Production Log</h4>
        <span class="republic-tag">${items.length} entries</span>
      </div>
      <div class="republic-table-wrap">
        <table class="republic-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Title</th>
              <th>Creator</th>
              <th>Tick</th>
            </tr>
          </thead>
          <tbody>
            ${recent.map(
              (item) => html`
                <tr class="republic-table__row">
                  <td>
                    <span class="republic-tag republic-tag--sm"
                          style="background:${getCatMeta(item.category).color}22;color:${getCatMeta(item.category).color}">
                      ${getCatMeta(item.category).emoji} ${item.category}
                    </span>
                  </td>
                  <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                      title=${item.title}>
                    ${item.title}
                  </td>
                  <td style="color:var(--muted)">${item.creatorName}</td>
                  <td><span class="republic-badge">#${item.tick}</span></td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
      ${
        items.length > 50
          ? html`<div class="republic-table__more">Showing 50 of ${items.length} entries</div>`
          : nothing
      }
    </div>
  `;
}
