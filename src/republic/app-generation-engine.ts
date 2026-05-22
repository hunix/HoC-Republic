/**
 * Republic Platform — App Generation Engine
 *
 * Intelligent project scaffolding with Feature-Sliced Design (FSD)
 * architecture. Generates enterprise-grade React + Supabase apps
 * with typed contracts, layered data access, and ESLint boundary
 * enforcement.
 *
 * Templates:
 *   - react-supabase: Full-stack (React 19 + TanStack + Zustand + Supabase + shadcn/ui)
 *   - react-spa: Frontend-only (React 19 + TanStack Router + Tailwind)
 *   - api-service: Backend-only (Fastify + Drizzle + Zod)
 *
 * Architecture: Feature-Sliced Design (FSD)
 *   app → pages → widgets → features → entities → shared
 */

import { writeWorkspaceFile, getWorkspace } from "./workspace-manager.js";
import {
  type AppTemplate,
  type EntitySpec,
  getProjectRulesContent,
  generateZodSchemaContent,
  generateMigrationSQL,
} from "./app-generation-rules.js";
import { ts } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface AppGenConfig {
  template: AppTemplate;
  projectName: string;
  description: string;
  /** Initial features to scaffold */
  features?: string[];
  /** Initial entities with schemas */
  entities?: EntitySpec[];
  /** Whether to include Supabase config */
  includeSupabase?: boolean;
  /** Whether to include testing setup */
  includeTesting?: boolean;
}

export interface ScaffoldResult {
  filesCreated: number;
  template: AppTemplate;
  fsdLayers: string[];
  features: string[];
  entities: string[];
  rulesPath: string;
  migrationsGenerated: number;
}

interface TemplateFile {
  path: string;
  content: string;
  language: string;
}

// ─── Template Metadata ──────────────────────────────────────────

export interface TemplateInfo {
  id: AppTemplate;
  name: string;
  description: string;
  stack: string[];
  fsdLayers: string[];
  includes: string[];
}

const TEMPLATE_REGISTRY: TemplateInfo[] = [
  {
    id: "react-supabase",
    name: "React + Supabase (Full-Stack)",
    description:
      "Enterprise-grade full-stack app with Feature-Sliced Design, Supabase backend, auth, RLS, and type-safe routing.",
    stack: [
      "Vite 6",
      "React 19",
      "TypeScript (strict)",
      "Tailwind CSS v4",
      "shadcn/ui",
      "TanStack Router",
      "TanStack Query v5",
      "Zustand v5",
      "Zod",
      "Supabase",
    ],
    fsdLayers: ["app", "pages", "widgets", "features", "entities", "shared"],
    includes: [
      "FSD folder structure",
      "Type-safe routing",
      "Supabase client + auth",
      "Base service class",
      "Error boundaries",
      "RULES.md",
      "ESLint boundary enforcement",
    ],
  },
  {
    id: "react-spa",
    name: "React SPA (Frontend Only)",
    description:
      "Single-page application with Feature-Sliced Design, type-safe routing, and external API consumption.",
    stack: [
      "Vite 6",
      "React 19",
      "TypeScript (strict)",
      "Tailwind CSS v4",
      "shadcn/ui",
      "TanStack Router",
      "TanStack Query v5",
      "Zustand v5",
      "Zod",
    ],
    fsdLayers: ["app", "pages", "widgets", "features", "entities", "shared"],
    includes: [
      "FSD folder structure",
      "Type-safe routing",
      "API client pattern",
      "Error boundaries",
      "RULES.md",
    ],
  },
  {
    id: "api-service",
    name: "API Service (Backend Only)",
    description:
      "Production backend service with layered architecture, Zod validation, and database access.",
    stack: ["TypeScript (strict)", "Fastify 5", "Drizzle ORM", "Zod", "PostgreSQL", "Vitest"],
    fsdLayers: ["app", "features", "entities", "shared"],
    includes: [
      "Layered folder structure",
      "Zod validation middleware",
      "Drizzle schema",
      "RULES.md",
    ],
  },
];

// ─── Public API ─────────────────────────────────────────────────

/**
 * List all available app templates with metadata.
 */
export function getAvailableTemplates(): TemplateInfo[] {
  return TEMPLATE_REGISTRY;
}

/**
 * Generate a full project scaffold for the given configuration.
 * Writes all files to the project workspace.
 */
export async function generateProjectScaffold(
  projectId: string,
  config: AppGenConfig,
  citizenId = "system",
): Promise<ScaffoldResult> {
  const ws = getWorkspace(projectId);
  if (!ws) {
    throw new Error(`Workspace not found: ${projectId}`);
  }

  const files: TemplateFile[] = [];

  // 1. Generate template-specific files
  switch (config.template) {
    case "react-supabase":
      files.push(...generateReactSupabaseFiles(config));
      break;
    case "react-spa":
      files.push(...generateReactSPAFiles(config));
      break;
    case "api-service":
      files.push(...generateAPIServiceFiles(config));
      break;
  }

  // 2. RULES.md — always generated
  files.push({
    path: ".hoc/RULES.md",
    content: getProjectRulesContent(config.template),
    language: "markdown",
  });

  // 3. Feature scaffolds
  const featureNames = config.features ?? [];
  for (const featureName of featureNames) {
    files.push(...generateFeatureFiles(featureName, config.template));
  }

  // 4. Entity scaffolds + migrations
  const entityNames: string[] = [];
  let migrationCount = 0;
  if (config.entities) {
    for (let i = 0; i < config.entities.length; i++) {
      const entity = config.entities[i];
      files.push(...generateEntityFiles(entity, config.template));
      files.push({
        path: `supabase/migrations/${String(i + 1).padStart(3, "0")}_create_${entity.tableName}.sql`,
        content: generateMigrationSQL(entity, i + 1),
        language: "sql",
      });
      entityNames.push(entity.name);
      migrationCount++;
    }
  }

  // 5. Write all files to workspace
  for (const file of files) {
    await writeWorkspaceFile({
      projectId,
      relativePath: file.path,
      content: file.content,
      language: file.language,
      citizenId,
    });
  }

  return {
    filesCreated: files.length,
    template: config.template,
    fsdLayers:
      TEMPLATE_REGISTRY.find((t) => t.id === config.template)?.fsdLayers ?? [],
    features: featureNames,
    entities: entityNames,
    rulesPath: ".hoc/RULES.md",
    migrationsGenerated: migrationCount,
  };
}

/**
 * Add a new feature scaffold to an existing project.
 */
export async function addFeatureToProject(
  projectId: string,
  featureName: string,
  template: AppTemplate = "react-supabase",
  citizenId = "system",
): Promise<{ filesCreated: number }> {
  const ws = getWorkspace(projectId);
  if (!ws) {
    throw new Error(`Workspace not found: ${projectId}`);
  }

  const files = generateFeatureFiles(featureName, template);
  for (const file of files) {
    await writeWorkspaceFile({
      projectId,
      relativePath: file.path,
      content: file.content,
      language: file.language,
      citizenId,
    });
  }

  return { filesCreated: files.length };
}

// ─── React + Supabase Template ──────────────────────────────────

function generateReactSupabaseFiles(config: AppGenConfig): TemplateFile[] {
  const { projectName, description } = config;
  const files: TemplateFile[] = [];

  // package.json
  files.push({
    path: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        private: true,
        version: "0.0.1",
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc -b && vite build",
          preview: "vite preview",
          lint: "eslint .",
          test: "vitest run",
          "test:watch": "vitest",
          "db:types": "npx supabase gen types typescript --local > src/shared/types/database.types.ts",
          "db:reset": "npx supabase db reset",
        },
        dependencies: {
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "@tanstack/react-router": "^1.120.0",
          "@tanstack/react-query": "^5.70.0",
          zustand: "^5.0.0",
          "react-hook-form": "^7.54.0",
          "@hookform/resolvers": "^3.10.0",
          zod: "^3.24.0",
          "@supabase/supabase-js": "^2.49.0",
          "@supabase/ssr": "^0.6.0",
          "react-error-boundary": "^4.1.0",
          "lucide-react": "^0.476.0",
          "date-fns": "^4.1.0",
          clsx: "^2.1.0",
          "tailwind-merge": "^3.1.0",
        },
        devDependencies: {
          vite: "^6.2.0",
          typescript: "^5.8.0",
          "@vitejs/plugin-react": "^4.4.0",
          tailwindcss: "^4.1.0",
          "@tailwindcss/vite": "^4.1.0",
          vitest: "^2.1.0",
          "@testing-library/react": "^16.3.0",
          "@playwright/test": "^1.50.0",
          eslint: "^9.22.0",
          "eslint-plugin-boundaries": "^4.3.0",
          "@radix-ui/react-slot": "^1.1.0",
        },
      },
      null,
      2,
    ),
  });

  // tsconfig.json (strict mode)
  files.push({
    path: "tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2023", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          noUncheckedIndexedAccess: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          jsx: "react-jsx",
          skipLibCheck: true,
          baseUrl: ".",
          paths: { "@/*": ["./src/*"] },
          outDir: "dist",
        },
        include: ["src"],
      },
      null,
      2,
    ),
  });

  // vite.config.ts
  files.push({
    path: "vite.config.ts",
    language: "typescript",
    content: [
      `import { defineConfig } from 'vite';`,
      `import react from '@vitejs/plugin-react';`,
      `import tailwindcss from '@tailwindcss/vite';`,
      `import { resolve } from 'path';`,
      ``,
      `export default defineConfig({`,
      `  plugins: [react(), tailwindcss()],`,
      `  resolve: {`,
      `    alias: { '@': resolve(__dirname, './src') },`,
      `  },`,
      `});`,
    ].join("\n"),
  });

  // Global CSS
  files.push({
    path: "src/app/styles/globals.css",
    language: "css",
    content: [
      `@import "tailwindcss";`,
      ``,
      `@layer base {`,
      `  :root {`,
      `    --background: 0 0% 100%;`,
      `    --foreground: 0 0% 3.9%;`,
      `    --primary: 0 0% 9%;`,
      `    --primary-foreground: 0 0% 98%;`,
      `    --destructive: 0 84.2% 60.2%;`,
      `    --muted: 0 0% 96.1%;`,
      `    --muted-foreground: 0 0% 45.1%;`,
      `    --border: 0 0% 89.8%;`,
      `    --radius: 0.5rem;`,
      `  }`,
      `  .dark {`,
      `    --background: 0 0% 3.9%;`,
      `    --foreground: 0 0% 98%;`,
      `    --primary: 0 0% 98%;`,
      `    --primary-foreground: 0 0% 9%;`,
      `    --destructive: 0 62.8% 30.6%;`,
      `    --muted: 0 0% 14.9%;`,
      `    --muted-foreground: 0 0% 63.9%;`,
      `    --border: 0 0% 14.9%;`,
      `  }`,
      `}`,
    ].join("\n"),
  });

  // Main entry
  files.push({
    path: "src/main.tsx",
    language: "typescript",
    content: [
      `import React from 'react';`,
      `import ReactDOM from 'react-dom/client';`,
      `import { App } from './app/App';`,
      `import './app/styles/globals.css';`,
      ``,
      `ReactDOM.createRoot(document.getElementById('root')!).render(`,
      `  <React.StrictMode>`,
      `    <App />`,
      `  </React.StrictMode>,`,
      `);`,
    ].join("\n"),
  });

  // App.tsx
  files.push({
    path: "src/app/App.tsx",
    language: "typescript",
    content: [
      `import { QueryClient, QueryClientProvider } from '@tanstack/react-query';`,
      `import { ErrorBoundary } from 'react-error-boundary';`,
      `import { ErrorFallback } from '@/shared/ui/ErrorFallback';`,
      ``,
      `const queryClient = new QueryClient({`,
      `  defaultOptions: {`,
      `    queries: {`,
      `      retry: 2,`,
      `      staleTime: 5 * 60 * 1000,`,
      `      throwOnError: true,`,
      `    },`,
      `    mutations: {`,
      `      throwOnError: false,`,
      `    },`,
      `  },`,
      `});`,
      ``,
      `export function App() {`,
      `  return (`,
      `    <ErrorBoundary FallbackComponent={ErrorFallback}>`,
      `      <QueryClientProvider client={queryClient}>`,
      `        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">`,
      `          <h1 className="text-3xl font-bold p-8">${projectName}</h1>`,
      `          <p className="px-8 text-[hsl(var(--muted-foreground))]">${description}</p>`,
      `        </div>`,
      `      </QueryClientProvider>`,
      `    </ErrorBoundary>`,
      `  );`,
      `}`,
    ].join("\n"),
  });

  // shared/ui/ErrorFallback.tsx
  files.push({
    path: "src/shared/ui/ErrorFallback.tsx",
    language: "typescript",
    content: [
      `import type { FallbackProps } from 'react-error-boundary';`,
      ``,
      `export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {`,
      `  return (`,
      `    <div className="flex flex-col items-center justify-center p-8 text-center">`,
      `      <h2 className="text-lg font-semibold text-[hsl(var(--destructive))]">Something went wrong</h2>`,
      `      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{error.message}</p>`,
      `      <button`,
      `        onClick={resetErrorBoundary}`,
      `        className="mt-4 px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm"`,
      `      >`,
      `        Try again`,
      `      </button>`,
      `    </div>`,
      `  );`,
      `}`,
    ].join("\n"),
  });

  // shared/lib/supabase.ts
  files.push({
    path: "src/shared/lib/supabase.ts",
    language: "typescript",
    content: [
      `import { createClient } from '@supabase/supabase-js';`,
      `// import type { Database } from '../types/database.types';`,
      ``,
      `const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';`,
      `const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';`,
      ``,
      `export const supabase = createClient(supabaseUrl, supabaseKey);`,
    ].join("\n"),
  });

  // shared/lib/utils.ts
  files.push({
    path: "src/shared/lib/utils.ts",
    language: "typescript",
    content: [
      `import { clsx, type ClassValue } from 'clsx';`,
      `import { twMerge } from 'tailwind-merge';`,
      ``,
      `export function cn(...inputs: ClassValue[]) {`,
      `  return twMerge(clsx(inputs));`,
      `}`,
    ].join("\n"),
  });

  // shared/api/baseService.ts
  files.push({
    path: "src/shared/api/baseService.ts",
    language: "typescript",
    content: [
      `import { supabase } from '@/shared/lib/supabase';`,
      `import type { PostgrestError } from '@supabase/supabase-js';`,
      ``,
      `export class BaseService {`,
      `  protected async query<T>(`,
      `    queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>`,
      `  ): Promise<T> {`,
      `    const { data, error } = await queryFn();`,
      `    if (error) {`,
      `      throw new ServiceError(error.message, error.code, error.details);`,
      `    }`,
      `    if (data === null) {`,
      `      throw new ServiceError('No data returned', 'PGRST116', '');`,
      `    }`,
      `    return data;`,
      `  }`,
      ``,
      `  protected get client() {`,
      `    return supabase;`,
      `  }`,
      `}`,
      ``,
      `export class ServiceError extends Error {`,
      `  constructor(`,
      `    message: string,`,
      `    public code: string,`,
      `    public details: string,`,
      `  ) {`,
      `    super(message);`,
      `    this.name = 'ServiceError';`,
      `  }`,
      `}`,
    ].join("\n"),
  });

  // shared/types placeholder
  files.push({
    path: "src/shared/types/database.types.ts",
    language: "typescript",
    content: [
      `// Auto-generated by: npx supabase gen types typescript --local`,
      `// Run 'npm run db:types' after each migration to regenerate.`,
      ``,
      `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];`,
      ``,
      `// TODO: Run 'npm run db:types' to generate from your Supabase schema`,
      `export type Database = Record<string, never>;`,
    ].join("\n"),
  });

  // index.html
  files.push({
    path: "index.html",
    language: "html",
    content: [
      `<!doctype html>`,
      `<html lang="en" class="dark">`,
      `  <head>`,
      `    <meta charset="UTF-8" />`,
      `    <meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
      `    <meta name="description" content="${description}" />`,
      `    <title>${projectName}</title>`,
      `  </head>`,
      `  <body>`,
      `    <div id="root"></div>`,
      `    <script type="module" src="/src/main.tsx"></script>`,
      `  </body>`,
      `</html>`,
    ].join("\n"),
  });

  // .env.example
  files.push({
    path: ".env.example",
    language: "text",
    content: [
      `VITE_SUPABASE_URL=http://localhost:54321`,
      `VITE_SUPABASE_ANON_KEY=your-anon-key-here`,
    ].join("\n"),
  });

  // ESLint config with FSD boundary enforcement
  files.push({
    path: "eslint.config.js",
    language: "javascript",
    content: [
      `import boundaries from 'eslint-plugin-boundaries';`,
      ``,
      `export default [`,
      `  {`,
      `    plugins: { boundaries },`,
      `    settings: {`,
      `      'boundaries/elements': [`,
      `        { type: 'app', pattern: 'src/app/*' },`,
      `        { type: 'pages', pattern: 'src/pages/*' },`,
      `        { type: 'widgets', pattern: 'src/widgets/*' },`,
      `        { type: 'features', pattern: 'src/features/*' },`,
      `        { type: 'entities', pattern: 'src/entities/*' },`,
      `        { type: 'shared', pattern: 'src/shared/*' },`,
      `      ],`,
      `    },`,
      `    rules: {`,
      `      'boundaries/element-types': [2, {`,
      `        default: 'disallow',`,
      `        rules: [`,
      `          { from: 'app', allow: ['pages', 'widgets', 'features', 'entities', 'shared'] },`,
      `          { from: 'pages', allow: ['widgets', 'features', 'entities', 'shared'] },`,
      `          { from: 'widgets', allow: ['features', 'entities', 'shared'] },`,
      `          { from: 'features', allow: ['entities', 'shared'] },`,
      `          { from: 'entities', allow: ['shared'] },`,
      `          { from: 'shared', allow: [] },`,
      `        ],`,
      `      }],`,
      `    },`,
      `  },`,
      `];`,
    ].join("\n"),
  });

  // README.md
  files.push({
    path: "README.md",
    language: "markdown",
    content: [
      `# ${projectName}`,
      ``,
      `${description}`,
      ``,
      `## Stack`,
      ``,
      `- **Framework:** React 19 + Vite 6 + TypeScript (strict mode)`,
      `- **Styling:** Tailwind CSS v4 + shadcn/ui`,
      `- **Routing:** TanStack Router (type-safe)`,
      `- **State:** TanStack Query v5 (server) + Zustand v5 (client)`,
      `- **Validation:** Zod + React Hook Form`,
      `- **Backend:** Supabase (PostgreSQL + Auth + Storage)`,
      `- **Testing:** Vitest + React Testing Library + Playwright`,
      ``,
      `## Architecture`,
      ``,
      `This project uses **Feature-Sliced Design (FSD)** with strict unidirectional imports:`,
      ``,
      `\`\`\``,
      `app → pages → widgets → features → entities → shared`,
      `\`\`\``,
      ``,
      `## Getting Started`,
      ``,
      `\`\`\`bash`,
      `npm install`,
      `npm run dev`,
      `\`\`\``,
      ``,
      `## Supabase`,
      ``,
      `\`\`\`bash`,
      `npx supabase start     # Start local Supabase`,
      `npm run db:types       # Generate TypeScript types`,
      `npm run db:reset       # Reset database`,
      `\`\`\``,
      ``,
      `---`,
      `*Generated by HoC AI Republic — ${ts()}*`,
    ].join("\n"),
  });

  // Supabase config
  if (config.includeSupabase !== false) {
    files.push({
      path: "supabase/config.toml",
      language: "toml",
      content: [
        `[project]`,
        `id = "${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}"`,
        ``,
        `[db]`,
        `port = 54322`,
        `major_version = 15`,
        ``,
        `[studio]`,
        `port = 54323`,
        ``,
        `[auth]`,
        `site_url = "http://localhost:5173"`,
      ].join("\n"),
    });

    // handle_updated_at trigger function (shared across tables)
    files.push({
      path: "supabase/migrations/000_base_functions.sql",
      language: "sql",
      content: [
        `-- Base utility functions shared across all tables`,
        ``,
        `CREATE OR REPLACE FUNCTION public.handle_updated_at()`,
        `RETURNS TRIGGER AS $$`,
        `BEGIN`,
        `  NEW.updated_at = now();`,
        `  RETURN NEW;`,
        `END;`,
        `$$ LANGUAGE plpgsql;`,
      ].join("\n"),
    });

    files.push({
      path: "supabase/seed.sql",
      language: "sql",
      content: `-- Seed data for development\n-- Add INSERT statements here\n`,
    });
  }

  return files;
}

// ─── React SPA Template ─────────────────────────────────────────

function generateReactSPAFiles(config: AppGenConfig): TemplateFile[] {
  // SPA shares most files with react-supabase but without
  // Supabase-specific files, using a generic API client instead
  const base = generateReactSupabaseFiles({
    ...config,
    includeSupabase: false,
  });

  // Replace supabase client with generic API client
  const filtered = base.filter(
    (f) =>
      !f.path.includes("supabase") &&
      !f.path.includes("database.types") &&
      f.path !== "src/shared/lib/supabase.ts",
  );

  // Generic API client
  filtered.push({
    path: "src/shared/lib/apiClient.ts",
    language: "typescript",
    content: [
      `const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';`,
      ``,
      `export async function apiClient<T>(`,
      `  endpoint: string,`,
      `  options?: RequestInit,`,
      `): Promise<T> {`,
      `  const res = await fetch(\`\${BASE_URL}\${endpoint}\`, {`,
      `    headers: {`,
      `      'Content-Type': 'application/json',`,
      `      ...options?.headers,`,
      `    },`,
      `    ...options,`,
      `  });`,
      ``,
      `  if (!res.ok) {`,
      `    throw new Error(\`API error: \${res.status} \${res.statusText}\`);`,
      `  }`,
      ``,
      `  return res.json() as Promise<T>;`,
      `}`,
    ].join("\n"),
  });

  // Update the baseService to not depend on Supabase
  const baseServiceIdx = filtered.findIndex((f) => f.path === "src/shared/api/baseService.ts");
  if (baseServiceIdx >= 0) {
    filtered[baseServiceIdx] = {
      path: "src/shared/api/baseService.ts",
      language: "typescript",
      content: [
        `import { apiClient } from '@/shared/lib/apiClient';`,
        ``,
        `export class BaseService {`,
        `  protected async get<T>(endpoint: string): Promise<T> {`,
        `    return apiClient<T>(endpoint);`,
        `  }`,
        ``,
        `  protected async post<T>(endpoint: string, body: unknown): Promise<T> {`,
        `    return apiClient<T>(endpoint, {`,
        `      method: 'POST',`,
        `      body: JSON.stringify(body),`,
        `    });`,
        `  }`,
        ``,
        `  protected async put<T>(endpoint: string, body: unknown): Promise<T> {`,
        `    return apiClient<T>(endpoint, {`,
        `      method: 'PUT',`,
        `      body: JSON.stringify(body),`,
        `    });`,
        `  }`,
        ``,
        `  protected async delete(endpoint: string): Promise<void> {`,
        `    await apiClient(endpoint, { method: 'DELETE' });`,
        `  }`,
        `}`,
        ``,
        `export class ServiceError extends Error {`,
        `  constructor(`,
        `    message: string,`,
        `    public code: string,`,
        `    public details: string,`,
        `  ) {`,
        `    super(message);`,
        `    this.name = 'ServiceError';`,
        `  }`,
        `}`,
      ].join("\n"),
    };
  }

  // Simpler .env.example
  filtered.push({
    path: ".env.example",
    language: "text",
    content: `VITE_API_URL=http://localhost:3000\n`,
  });

  return filtered;
}

// ─── API Service Template ───────────────────────────────────────

function generateAPIServiceFiles(config: AppGenConfig): TemplateFile[] {
  const { projectName, description } = config;
  const files: TemplateFile[] = [];

  files.push({
    path: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        private: true,
        version: "0.0.1",
        type: "module",
        scripts: {
          dev: "tsx watch src/app/server.ts",
          build: "tsc -b",
          start: "node dist/app/server.js",
          test: "vitest run",
          "test:watch": "vitest",
        },
        dependencies: {
          fastify: "^5.2.0",
          "@fastify/cors": "^10.0.0",
          drizzle: "^0.2.0",
          "drizzle-orm": "^0.38.0",
          zod: "^3.24.0",
          pg: "^8.13.0",
        },
        devDependencies: {
          typescript: "^5.8.0",
          tsx: "^4.19.0",
          vitest: "^2.1.0",
          "drizzle-kit": "^0.30.0",
          "@types/pg": "^8.11.0",
        },
      },
      null,
      2,
    ),
  });

  files.push({
    path: "tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          noUncheckedIndexedAccess: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          jsx: "react-jsx",
          skipLibCheck: true,
          outDir: "dist",
          rootDir: "src",
          baseUrl: ".",
          paths: { "@/*": ["./src/*"] },
        },
        include: ["src"],
      },
      null,
      2,
    ),
  });

  // Main server
  files.push({
    path: "src/app/server.ts",
    language: "typescript",
    content: [
      `import Fastify from 'fastify';`,
      `import cors from '@fastify/cors';`,
      ``,
      `const server = Fastify({ logger: true });`,
      ``,
      `await server.register(cors, { origin: true });`,
      ``,
      `server.get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }));`,
      ``,
      `try {`,
      `  await server.listen({ port: 3000, host: '0.0.0.0' });`,
      `  console.log('🚀 ${projectName} running at http://localhost:3000');`,
      `} catch (err) {`,
      `  server.log.error(err);`,
      `  process.exit(1);`,
      `}`,
    ].join("\n"),
  });

  // Shared validation
  files.push({
    path: "src/shared/lib/validation.ts",
    language: "typescript",
    content: [
      `import { z, type ZodSchema } from 'zod';`,
      ``,
      `export function validate<T>(schema: ZodSchema<T>, data: unknown): T {`,
      `  return schema.parse(data);`,
      `}`,
      ``,
      `export { z };`,
    ].join("\n"),
  });

  files.push({
    path: "README.md",
    language: "markdown",
    content: [
      `# ${projectName}`,
      ``,
      `${description}`,
      ``,
      `## Stack`,
      `- TypeScript (strict) + Fastify 5`,
      `- Drizzle ORM + PostgreSQL`,
      `- Zod validation`,
      ``,
      `## Getting Started`,
      `\`\`\`bash`,
      `npm install`,
      `npm run dev`,
      `\`\`\``,
      ``,
      `---`,
      `*Generated by HoC AI Republic — ${ts()}*`,
    ].join("\n"),
  });

  return files;
}

// ─── Feature Scaffolding ────────────────────────────────────────

function generateFeatureFiles(featureName: string, template: AppTemplate): TemplateFile[] {
  const slug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const pascal = featureName
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

  const files: TemplateFile[] = [];

  if (template === "api-service") {
    // API-style feature
    files.push({
      path: `src/features/${slug}/model/${slug}Schemas.ts`,
      language: "typescript",
      content: [
        `import { z } from 'zod';`,
        ``,
        `export const ${pascal}Schema = z.object({`,
        `  id: z.string().uuid(),`,
        `  // TODO: Add fields`,
        `  created_at: z.string().datetime(),`,
        `  updated_at: z.string().datetime(),`,
        `});`,
        ``,
        `export type ${pascal} = z.infer<typeof ${pascal}Schema>;`,
        ``,
        `export const Create${pascal}Schema = ${pascal}Schema.omit({`,
        `  id: true,`,
        `  created_at: true,`,
        `  updated_at: true,`,
        `});`,
        ``,
        `export type Create${pascal}Input = z.infer<typeof Create${pascal}Schema>;`,
      ].join("\n"),
    });

    files.push({
      path: `src/features/${slug}/api/${slug}Routes.ts`,
      language: "typescript",
      content: [
        `import type { FastifyInstance } from 'fastify';`,
        `// import { ${pascal}Schema, Create${pascal}Schema } from '../model/${slug}Schemas';`,
        ``,
        `export async function ${slug}Routes(app: FastifyInstance) {`,
        `  app.get('/${slug}', async () => {`,
        `    return { items: [], total: 0 };`,
        `  });`,
        ``,
        `  app.post('/${slug}', async (request) => {`,
        `    const body = request.body;`,
        `    return { ok: true, data: body };`,
        `  });`,
        `}`,
      ].join("\n"),
    });

    files.push({
      path: `src/features/${slug}/index.ts`,
      language: "typescript",
      content: [
        `export { ${slug}Routes } from './api/${slug}Routes';`,
        `export { ${pascal}Schema, Create${pascal}Schema } from './model/${slug}Schemas';`,
        `export type { ${pascal}, Create${pascal}Input } from './model/${slug}Schemas';`,
      ].join("\n"),
    });
  } else {
    // React-style feature
    files.push({
      path: `src/features/${slug}/model/${slug}Schemas.ts`,
      language: "typescript",
      content: [
        `import { z } from 'zod';`,
        ``,
        `export const ${pascal}Schema = z.object({`,
        `  id: z.string().uuid(),`,
        `  // TODO: Add fields`,
        `  created_at: z.string().datetime(),`,
        `  updated_at: z.string().datetime(),`,
        `});`,
        ``,
        `export type ${pascal} = z.infer<typeof ${pascal}Schema>;`,
        ``,
        `export const Create${pascal}Schema = ${pascal}Schema.omit({`,
        `  id: true,`,
        `  created_at: true,`,
        `  updated_at: true,`,
        `});`,
        ``,
        `export type Create${pascal}Input = z.infer<typeof Create${pascal}Schema>;`,
      ].join("\n"),
    });

    files.push({
      path: `src/features/${slug}/ui/${pascal}Form.tsx`,
      language: "typescript",
      content: [
        `// import { useForm } from 'react-hook-form';`,
        `// import { zodResolver } from '@hookform/resolvers/zod';`,
        `// import { Create${pascal}Schema, type Create${pascal}Input } from '../model/${slug}Schemas';`,
        ``,
        `export function ${pascal}Form() {`,
        `  return (`,
        `    <form className="space-y-4">`,
        `      <h2 className="text-xl font-semibold">${pascal}</h2>`,
        `      {/* TODO: Add form fields */}`,
        `    </form>`,
        `  );`,
        `}`,
      ].join("\n"),
    });

    files.push({
      path: `src/features/${slug}/api/${slug}Service.ts`,
      language: "typescript",
      content: [
        `import { BaseService } from '@/shared/api/baseService';`,
        `// import { ${pascal}Schema, type ${pascal} } from '../model/${slug}Schemas';`,
        ``,
        `class ${pascal}Service extends BaseService {`,
        `  // TODO: Implement service methods`,
        `  // async getAll(): Promise<${pascal}[]> { ... }`,
        `  // async getById(id: string): Promise<${pascal}> { ... }`,
        `  // async create(data: Create${pascal}Input): Promise<${pascal}> { ... }`,
        `}`,
        ``,
        `export const ${slug}Service = new ${pascal}Service();`,
      ].join("\n"),
    });

    files.push({
      path: `src/features/${slug}/index.ts`,
      language: "typescript",
      content: [
        `export { ${pascal}Form } from './ui/${pascal}Form';`,
        `export { ${pascal}Schema, Create${pascal}Schema } from './model/${slug}Schemas';`,
        `export type { ${pascal}, Create${pascal}Input } from './model/${slug}Schemas';`,
        `export { ${slug}Service } from './api/${slug}Service';`,
      ].join("\n"),
    });
  }

  return files;
}

// ─── Entity Scaffolding ─────────────────────────────────────────

function generateEntityFiles(entity: EntitySpec, template: AppTemplate): TemplateFile[] {
  const slug = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const pascal = entity.name.charAt(0).toUpperCase() + entity.name.slice(1);
  const files: TemplateFile[] = [];

  // Zod schema (generated from EntitySpec)
  files.push({
    path: `src/entities/${slug}/model/${slug}Schemas.ts`,
    language: "typescript",
    content: generateZodSchemaContent(entity),
  });

  if (template !== "api-service") {
    // TanStack Query hooks
    files.push({
      path: `src/entities/${slug}/api/${slug}Queries.ts`,
      language: "typescript",
      content: [
        `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';`,
        `import { ${slug}Service } from './${slug}Service';`,
        ``,
        `export const ${slug}Keys = {`,
        `  all: ['${entity.tableName}'] as const,`,
        `  detail: (id: string) => ['${entity.tableName}', id] as const,`,
        `  list: (filters?: Record<string, unknown>) => ['${entity.tableName}', 'list', filters] as const,`,
        `};`,
        ``,
        `export const use${pascal} = (id: string) => {`,
        `  return useQuery({`,
        `    queryKey: ${slug}Keys.detail(id),`,
        `    queryFn: () => ${slug}Service.getById(id),`,
        `    enabled: !!id,`,
        `  });`,
        `};`,
        ``,
        `export const use${pascal}s = (filters?: Record<string, unknown>) => {`,
        `  return useQuery({`,
        `    queryKey: ${slug}Keys.list(filters),`,
        `    queryFn: () => ${slug}Service.getAll(filters),`,
        `  });`,
        `};`,
      ].join("\n"),
    });

    // Service class
    files.push({
      path: `src/entities/${slug}/api/${slug}Service.ts`,
      language: "typescript",
      content: [
        `import { BaseService } from '@/shared/api/baseService';`,
        `import { ${pascal}Schema, type ${pascal} } from '../model/${slug}Schemas';`,
        ``,
        `class ${pascal}Service extends BaseService {`,
        `  async getById(id: string): Promise<${pascal}> {`,
        `    const data = await this.query(() =>`,
        `      this.client.from('${entity.tableName}').select('*').eq('id', id).single()`,
        `    );`,
        `    return ${pascal}Schema.parse(data);`,
        `  }`,
        ``,
        `  async getAll(filters?: Record<string, unknown>): Promise<${pascal}[]> {`,
        `    const data = await this.query(() => {`,
        `      let query = this.client.from('${entity.tableName}').select('*');`,
        `      if (filters) {`,
        `        for (const [key, value] of Object.entries(filters)) {`,
        `          query = query.eq(key, value as string);`,
        `        }`,
        `      }`,
        `      return query;`,
        `    });`,
        `    return (data as unknown[]).map((item) => ${pascal}Schema.parse(item));`,
        `  }`,
        `}`,
        ``,
        `export const ${slug}Service = new ${pascal}Service();`,
      ].join("\n"),
    });
  }

  // Public API
  files.push({
    path: `src/entities/${slug}/index.ts`,
    language: "typescript",
    content:
      template !== "api-service"
        ? [
            `export { ${pascal}Schema, Create${pascal}Schema, Update${pascal}Schema } from './model/${slug}Schemas';`,
            `export type { ${pascal}, Create${pascal}Input, Update${pascal}Input } from './model/${slug}Schemas';`,
            `export { ${slug}Service } from './api/${slug}Service';`,
            `export { use${pascal}, use${pascal}s, ${slug}Keys } from './api/${slug}Queries';`,
          ].join("\n")
        : [
            `export { ${pascal}Schema, Create${pascal}Schema, Update${pascal}Schema } from './model/${slug}Schemas';`,
            `export type { ${pascal}, Create${pascal}Input, Update${pascal}Input } from './model/${slug}Schemas';`,
          ].join("\n"),
  });

  return files;
}
