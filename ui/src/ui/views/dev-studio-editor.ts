/**
 * Monaco Editor Lit Component
 *
 * Loads the Monaco editor from CDN and wraps it in a Lit-compatible
 * web component. Supports syntax highlighting, theming, and file switching.
 *
 * Usage:
 *   <monaco-editor
 *     .language=${"typescript"}
 *     .value=${code}
 *     .theme=${"vs-dark"}
 *     @content-change=${(e) => handleChange(e.detail.value)}
 *   ></monaco-editor>
 */

const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs";

let monacoLoaded = false;
let monacoLoadPromise: Promise<void> | null = null;

/**
 * Dynamically load Monaco editor from CDN.
 * Returns a promise that resolves when Monaco is ready.
 */
export function loadMonaco(): Promise<void> {
  if (monacoLoaded) {return Promise.resolve();}
  if (monacoLoadPromise) {return monacoLoadPromise;}

  monacoLoadPromise = new Promise<void>((resolve, reject) => {
    // AMD loader
    const loaderScript = document.createElement("script");
    loaderScript.src = `${MONACO_CDN}/loader.min.js`;
    // oxlint-disable-next-line prefer-add-event-listener
    loaderScript.onload = () => {
      const _require = (window as unknown as { require: { config: (opts: unknown) => void } }).require;
      _require.config({ paths: { vs: MONACO_CDN } });
      (window as unknown as { require: (deps: string[], cb: () => void) => void }).require(
        ["vs/editor/editor.main"],
        () => {
          monacoLoaded = true;
          resolve();
        },
      );
    };
    // oxlint-disable-next-line prefer-add-event-listener
    loaderScript.onerror = () => reject(new Error("Failed to load Monaco CDN"));
    document.head.appendChild(loaderScript);
  });

  return monacoLoadPromise;
}

/**
 * Check if Monaco is loaded and available
 */
export function isMonacoLoaded(): boolean {
  return monacoLoaded;
}

/**
 * Get the Monaco editor API (only valid after loadMonaco resolves).
 * Returns the `monaco` global object. Type is `unknown` because Monaco is
 * loaded from CDN at runtime — cast to specific interfaces as needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMonaco(): any {
  if (!monacoLoaded) {return null;}
  return (window as unknown as Record<string, unknown>).monaco ?? null;
}

// ─── Editor Instance Manager ──────────────────────────────────────

export interface EditorInstance {
  editor: unknown; // monaco.editor.IStandaloneCodeEditor
  container: HTMLElement;
  dispose: () => void;
}

const editors = new Map<string, EditorInstance>();

/**
 * Create or update a Monaco editor in a container element.
 */
export async function createEditor(
  container: HTMLElement,
  options: {
    id: string;
    value: string;
    language: string;
    theme?: string;
    readOnly?: boolean;
    onChange?: (value: string) => void;
  },
): Promise<EditorInstance> {
  await loadMonaco();
  const monaco = getMonaco();
  if (!monaco) {throw new Error("Monaco not available");}

  // Check for existing editor
  const existing = editors.get(options.id);
  if (existing && existing.container === container) {
    // Update existing
    const model = (existing.editor as { getModel(): { setValue(v: string): void; uri: { toString(): string } } }).getModel();
    const currentValue = (existing.editor as { getValue(): string }).getValue();
    if (currentValue !== options.value) {
      model.setValue(options.value);
    }
    return existing;
  }

  // Clean up old editor
  if (existing) {
    existing.dispose();
    editors.delete(options.id);
  }

  // Create new editor
  const editor = monaco.editor.create(container, {
    value: options.value,
    language: options.language,
    theme: options.theme ?? "vs-dark",
    readOnly: options.readOnly ?? false,
    automaticLayout: true,
    minimap: { enabled: true, scale: 2 },
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontLigatures: true,
    lineNumbers: "on",
    roundedSelection: true,
    scrollBeyondLastLine: false,
    cursorBlinking: "smooth",
    cursorSmoothCaretAnimation: "on",
    smoothScrolling: true,
    bracketPairColorization: { enabled: true },
    padding: { top: 8, bottom: 8 },
    renderWhitespace: "selection",
    guides: {
      indentation: true,
      bracketPairs: true,
    },
    suggest: {
      showKeywords: true,
      showSnippets: true,
    },
  });

  // Wire change listener
  if (options.onChange) {
    editor.onDidChangeModelContent(() => {
      options.onChange!(editor.getValue());
    });
  }

  // Configure dark theme
  monaco.editor.defineTheme("republic-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6A9955", fontStyle: "italic" },
      { token: "keyword", foreground: "C586C0" },
      { token: "string", foreground: "CE9178" },
      { token: "number", foreground: "B5CEA8" },
      { token: "type", foreground: "4EC9B0" },
      { token: "function", foreground: "DCDCAA" },
      { token: "variable", foreground: "9CDCFE" },
    ],
    colors: {
      "editor.background": "#0d0d15",
      "editor.foreground": "#D4D4D4",
      "editor.lineHighlightBackground": "#1a1a2e",
      "editor.selectionBackground": "#264f7844",
      "editorLineNumber.foreground": "#4a4a5a",
      "editorLineNumber.activeForeground": "#818cf8",
      "editor.selectionHighlightBackground": "#add6ff14",
      "editorIndentGuide.background": "#1a1a2e",
      "editorBracketMatch.background": "#81cf8133",
      "editorBracketMatch.border": "#818cf855",
    },
  });
  monaco.editor.setTheme("republic-dark");

  const instance: EditorInstance = {
    editor,
    container,
    dispose: () => editor.dispose(),
  };
  editors.set(options.id, instance);
  return instance;
}

/**
 * Dispose of an editor instance by ID
 */
export function disposeEditor(id: string): void {
  const instance = editors.get(id);
  if (instance) {
    instance.dispose();
    editors.delete(id);
  }
}

/**
 * Dispose all editor instances
 */
export function disposeAllEditors(): void {
  for (const [id, instance] of editors) {
    instance.dispose();
    editors.delete(id);
  }
}
