/**
 * Dev Orchestration — Language, Database, and Framework Registries
 */

// ─── Language Registry ──────────────────────────────────────────

export interface LanguageSpec {
  id: string;
  name: string;
  extensions: string[];
  paradigms: string[];
  ecosystem: string;
  difficulty: number; // 1-10 complexity factor
}

export const DEV_LANGUAGES: LanguageSpec[] = [
  {
    id: "javascript",
    name: "JavaScript",
    extensions: [".js", ".mjs", ".cjs"],
    paradigms: ["functional", "oop", "event-driven"],
    ecosystem: "npm",
    difficulty: 3,
  },
  {
    id: "typescript",
    name: "TypeScript",
    extensions: [".ts", ".tsx", ".mts"],
    paradigms: ["typed", "functional", "oop"],
    ecosystem: "npm",
    difficulty: 4,
  },
  {
    id: "python",
    name: "Python",
    extensions: [".py", ".pyw"],
    paradigms: ["oop", "functional", "scripting"],
    ecosystem: "pip",
    difficulty: 2,
  },
  {
    id: "csharp",
    name: "C#",
    extensions: [".cs"],
    paradigms: ["oop", "functional", "async"],
    ecosystem: "nuget",
    difficulty: 5,
  },
  {
    id: "c",
    name: "C",
    extensions: [".c", ".h"],
    paradigms: ["procedural", "systems"],
    ecosystem: "make",
    difficulty: 7,
  },
  {
    id: "cpp",
    name: "C++",
    extensions: [".cpp", ".hpp", ".cc"],
    paradigms: ["oop", "generic", "systems"],
    ecosystem: "cmake",
    difficulty: 8,
  },
  {
    id: "java",
    name: "Java",
    extensions: [".java"],
    paradigms: ["oop", "enterprise"],
    ecosystem: "maven",
    difficulty: 5,
  },
  {
    id: "go",
    name: "Go",
    extensions: [".go"],
    paradigms: ["concurrent", "systems"],
    ecosystem: "go-mod",
    difficulty: 4,
  },
  {
    id: "rust",
    name: "Rust",
    extensions: [".rs"],
    paradigms: ["systems", "functional", "safe"],
    ecosystem: "cargo",
    difficulty: 9,
  },
  {
    id: "php",
    name: "PHP",
    extensions: [".php"],
    paradigms: ["oop", "scripting", "web"],
    ecosystem: "composer",
    difficulty: 3,
  },
  {
    id: "ruby",
    name: "Ruby",
    extensions: [".rb"],
    paradigms: ["oop", "dynamic", "scripting"],
    ecosystem: "gems",
    difficulty: 3,
  },
  {
    id: "r",
    name: "R",
    extensions: [".r", ".R"],
    paradigms: ["functional", "statistical"],
    ecosystem: "cran",
    difficulty: 4,
  },
  {
    id: "fsharp",
    name: "F#",
    extensions: [".fs", ".fsi", ".fsx"],
    paradigms: ["functional", "typed", "async"],
    ecosystem: "nuget",
    difficulty: 6,
  },
  {
    id: "vbnet",
    name: "VB.NET",
    extensions: [".vb"],
    paradigms: ["oop", "enterprise"],
    ecosystem: "nuget",
    difficulty: 4,
  },
  {
    id: "swift",
    name: "Swift",
    extensions: [".swift"],
    paradigms: ["oop", "protocol-oriented"],
    ecosystem: "spm",
    difficulty: 5,
  },
  {
    id: "kotlin",
    name: "Kotlin",
    extensions: [".kt", ".kts"],
    paradigms: ["oop", "functional", "coroutines"],
    ecosystem: "gradle",
    difficulty: 5,
  },
  {
    id: "dart",
    name: "Dart",
    extensions: [".dart"],
    paradigms: ["oop", "reactive"],
    ecosystem: "pub",
    difficulty: 4,
  },
  {
    id: "scala",
    name: "Scala",
    extensions: [".scala"],
    paradigms: ["oop", "functional", "actor-model"],
    ecosystem: "sbt",
    difficulty: 7,
  },
  {
    id: "elixir",
    name: "Elixir",
    extensions: [".ex", ".exs"],
    paradigms: ["functional", "concurrent", "fault-tolerant"],
    ecosystem: "hex",
    difficulty: 6,
  },
  {
    id: "lua",
    name: "Lua",
    extensions: [".lua"],
    paradigms: ["scripting", "embedded"],
    ecosystem: "luarocks",
    difficulty: 2,
  },
  {
    id: "zig",
    name: "Zig",
    extensions: [".zig"],
    paradigms: ["systems", "comptime"],
    ecosystem: "zig",
    difficulty: 8,
  },
  {
    id: "html",
    name: "HTML5",
    extensions: [".html", ".htm"],
    paradigms: ["markup", "semantic"],
    ecosystem: "web",
    difficulty: 1,
  },
  {
    id: "css",
    name: "CSS",
    extensions: [".css", ".scss", ".sass"],
    paradigms: ["styling", "responsive"],
    ecosystem: "web",
    difficulty: 2,
  },
  {
    id: "sql",
    name: "SQL",
    extensions: [".sql"],
    paradigms: ["declarative", "relational"],
    ecosystem: "sql",
    difficulty: 3,
  },
  {
    id: "shell",
    name: "Shell/Bash",
    extensions: [".sh", ".bash"],
    paradigms: ["scripting", "automation"],
    ecosystem: "shell",
    difficulty: 3,
  },
  {
    id: "powershell",
    name: "PowerShell",
    extensions: [".ps1", ".psm1"],
    paradigms: ["scripting", "automation", "oop"],
    ecosystem: "gallery",
    difficulty: 4,
  },
  {
    id: "solidity",
    name: "Solidity",
    extensions: [".sol"],
    paradigms: ["smart-contracts", "evm"],
    ecosystem: "hardhat",
    difficulty: 7,
  },
  {
    id: "wasm",
    name: "WebAssembly",
    extensions: [".wasm", ".wat"],
    paradigms: ["low-level", "portable"],
    ecosystem: "wasm",
    difficulty: 8,
  },
];

// ─── Database Registry ──────────────────────────────────────────

export interface DatabaseSpec {
  id: string;
  name: string;
  type: "relational" | "document" | "key-value" | "graph" | "time-series" | "baas";
  queryLanguage: string;
  cloudNative: boolean;
  difficulty: number;
}

export const DEV_DATABASES: DatabaseSpec[] = [
  {
    id: "postgres",
    name: "PostgreSQL",
    type: "relational",
    queryLanguage: "SQL",
    cloudNative: true,
    difficulty: 4,
  },
  {
    id: "sqlserver",
    name: "SQL Server",
    type: "relational",
    queryLanguage: "T-SQL",
    cloudNative: true,
    difficulty: 5,
  },
  {
    id: "mysql",
    name: "MySQL",
    type: "relational",
    queryLanguage: "SQL",
    cloudNative: true,
    difficulty: 3,
  },
  {
    id: "mariadb",
    name: "MariaDB",
    type: "relational",
    queryLanguage: "SQL",
    cloudNative: true,
    difficulty: 3,
  },
  {
    id: "sqlite",
    name: "SQLite",
    type: "relational",
    queryLanguage: "SQL",
    cloudNative: false,
    difficulty: 2,
  },
  {
    id: "mongodb",
    name: "MongoDB",
    type: "document",
    queryLanguage: "MQL",
    cloudNative: true,
    difficulty: 3,
  },
  {
    id: "redis",
    name: "Redis",
    type: "key-value",
    queryLanguage: "Commands",
    cloudNative: true,
    difficulty: 2,
  },
  {
    id: "neo4j",
    name: "Neo4j",
    type: "graph",
    queryLanguage: "Cypher",
    cloudNative: true,
    difficulty: 5,
  },
  {
    id: "influxdb",
    name: "InfluxDB",
    type: "time-series",
    queryLanguage: "InfluxQL",
    cloudNative: true,
    difficulty: 4,
  },
  {
    id: "supabase",
    name: "Supabase",
    type: "baas",
    queryLanguage: "SQL+REST",
    cloudNative: true,
    difficulty: 3,
  },
  {
    id: "firebase",
    name: "Firebase",
    type: "baas",
    queryLanguage: "SDK",
    cloudNative: true,
    difficulty: 2,
  },
  {
    id: "dynamodb",
    name: "DynamoDB",
    type: "key-value",
    queryLanguage: "PartiQL",
    cloudNative: true,
    difficulty: 4,
  },
  {
    id: "cockroachdb",
    name: "CockroachDB",
    type: "relational",
    queryLanguage: "SQL",
    cloudNative: true,
    difficulty: 5,
  },
  {
    id: "cassandra",
    name: "Cassandra",
    type: "key-value",
    queryLanguage: "CQL",
    cloudNative: true,
    difficulty: 6,
  },
];

// ─── Framework Registry ─────────────────────────────────────────

export interface FrameworkSpec {
  id: string;
  name: string;
  language: string;
  category: "frontend" | "backend" | "fullstack" | "mobile" | "css" | "testing" | "ml" | "game";
  features: string[];
}

export const DEV_FRAMEWORKS: FrameworkSpec[] = [
  // Frontend
  {
    id: "react",
    name: "React",
    language: "typescript",
    category: "frontend",
    features: ["components", "hooks", "jsx", "virtual-dom"],
  },
  {
    id: "angular",
    name: "Angular",
    language: "typescript",
    category: "frontend",
    features: ["modules", "di", "rxjs", "templates"],
  },
  {
    id: "vue",
    name: "Vue.js",
    language: "typescript",
    category: "frontend",
    features: ["composition-api", "reactive", "sfc"],
  },
  {
    id: "svelte",
    name: "Svelte",
    language: "typescript",
    category: "frontend",
    features: ["compiler", "reactive", "no-vdom"],
  },
  {
    id: "lit",
    name: "Lit",
    language: "typescript",
    category: "frontend",
    features: ["web-components", "reactive", "templates"],
  },
  // Fullstack
  {
    id: "nextjs",
    name: "Next.js",
    language: "typescript",
    category: "fullstack",
    features: ["ssr", "api-routes", "isr", "app-router"],
  },
  {
    id: "nuxt",
    name: "Nuxt",
    language: "typescript",
    category: "fullstack",
    features: ["ssr", "auto-imports", "modules"],
  },
  {
    id: "remix",
    name: "Remix",
    language: "typescript",
    category: "fullstack",
    features: ["loaders", "actions", "nested-routes"],
  },
  {
    id: "aspnet",
    name: "ASP.NET Core",
    language: "csharp",
    category: "fullstack",
    features: ["mvc", "razor", "blazor", "minimal-api"],
  },
  {
    id: "django",
    name: "Django",
    language: "python",
    category: "fullstack",
    features: ["orm", "admin", "auth", "templates"],
  },
  {
    id: "flask",
    name: "Flask",
    language: "python",
    category: "backend",
    features: ["lightweight", "blueprints", "jinja2"],
  },
  {
    id: "fastapi",
    name: "FastAPI",
    language: "python",
    category: "backend",
    features: ["async", "openapi", "pydantic", "typed"],
  },
  {
    id: "express",
    name: "Express",
    language: "typescript",
    category: "backend",
    features: ["middleware", "routing", "minimal"],
  },
  {
    id: "nestjs",
    name: "NestJS",
    language: "typescript",
    category: "backend",
    features: ["modules", "di", "decorators", "graphql"],
  },
  {
    id: "rails",
    name: "Ruby on Rails",
    language: "ruby",
    category: "fullstack",
    features: ["convention", "generators", "active-record"],
  },
  {
    id: "laravel",
    name: "Laravel",
    language: "php",
    category: "fullstack",
    features: ["eloquent", "blade", "artisan", "queue"],
  },
  {
    id: "spring",
    name: "Spring Boot",
    language: "java",
    category: "backend",
    features: ["di", "auto-config", "actuator", "jpa"],
  },
  {
    id: "gin",
    name: "Gin",
    language: "go",
    category: "backend",
    features: ["fast", "middleware", "json-validation"],
  },
  {
    id: "actix",
    name: "Actix Web",
    language: "rust",
    category: "backend",
    features: ["actor-model", "async", "typed-extractors"],
  },
  {
    id: "phoenix",
    name: "Phoenix",
    language: "elixir",
    category: "fullstack",
    features: ["liveview", "channels", "ecto", "pubsub"],
  },
  // CSS
  {
    id: "tailwind",
    name: "Tailwind CSS",
    language: "css",
    category: "css",
    features: ["utility-first", "responsive", "dark-mode"],
  },
  {
    id: "bootstrap",
    name: "Bootstrap",
    language: "css",
    category: "css",
    features: ["grid", "components", "responsive"],
  },
  // Mobile
  {
    id: "flutter",
    name: "Flutter",
    language: "dart",
    category: "mobile",
    features: ["widgets", "hot-reload", "cross-platform"],
  },
  {
    id: "react_native",
    name: "React Native",
    language: "typescript",
    category: "mobile",
    features: ["native-components", "hot-reload", "expo"],
  },
  // ML
  {
    id: "pytorch",
    name: "PyTorch",
    language: "python",
    category: "ml",
    features: ["tensors", "autograd", "gpu", "distributed"],
  },
  {
    id: "tensorflow",
    name: "TensorFlow",
    language: "python",
    category: "ml",
    features: ["graphs", "keras", "serving", "lite"],
  },
];
