/**
 * Republic Platform — App Generation Rules & Prompt Templates
 *
 * Contains the RULES.md template (adapted from the Enterprise AI App
 * Generation Architecture Guide) and structured prompt generators for
 * the self-correction loop. These are injected into every AI agent
 * context when building or fixing citizen-generated apps.
 */

import type { ParsedBuildError } from "./project-ci-loop.js";

// ─── Template Types ─────────────────────────────────────────────

export type AppTemplate = "react-supabase" | "react-spa" | "api-service";

export interface ZodSchemaField {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "uuid" | "enum" | "array" | "object";
  required: boolean;
  validation?: string; // e.g. "email", "url", "min(1)", "max(100)"
  enumValues?: string[];
  description?: string;
}

export interface EntitySpec {
  name: string;
  tableName: string;
  fields: ZodSchemaField[];
  hasRLS: boolean;
  rlsPattern: "own-data" | "org-based" | "public-read" | "admin-only";
}

// ─── RULES.md Templates ────────────────────────────────────────

const RULES_HEADER = `# RULES.md — Architecture Rules for Code Generation

You are generating code for a production application.
Follow these rules exactly. Violations will cause build failures.
`;

const FSD_RULES = `
## Architecture: Feature-Sliced Design (FSD)
Layers (top to bottom, imports only flow downward):
  app → pages → widgets → features → entities → shared

Each slice has segments: ui/, model/, api/, lib/
Each slice MUST have an index.ts public API.
NEVER import from inside a slice — only from its index.ts.

## Data Flow Pattern
1. Zod schema defines the data shape (entities/*/model/)
2. Service class makes data calls, validates with Zod (entities/*/api/*Service.ts)
3. Query hooks wrap services (entities/*/api/*Queries.ts)
4. UI components consume hooks only (features/*/ui/ or widgets/*/ui/)

## Forbidden Patterns
- NEVER use useEffect for data fetching. Use TanStack Query.
- NEVER use React Context for frequently changing state. Use Zustand.
- NEVER import between features. Features are isolated.
- NEVER scatter supabase.from() calls in UI components.
- NEVER use inline SQL strings. Use the Supabase client.
- NEVER skip RLS policies. Every table must have RLS enabled.
- NEVER use \`any\` type. Use proper TypeScript types.
- NEVER use array index as React key. Use stable unique IDs.

## Required Patterns
- ALWAYS validate responses with Zod schemas.
- ALWAYS wrap routes and widgets in React Error Boundaries.
- ALWAYS generate database changes as numbered migration files.
- ALWAYS use TanStack Query key factories for cache management.
- ALWAYS generate RLS policies in the same migration as the table.
- ALWAYS use the BaseService class for data calls.
- ALWAYS export from index.ts only.

## File Naming
- Components: PascalCase (UserCard.tsx)
- Hooks: camelCase with use prefix (useUser.ts)
- Services: camelCase with Service suffix (userService.ts)
- Schemas: camelCase with Schema suffix (userSchemas.ts)
- Stores: camelCase with Store suffix (sidebarStore.ts)
- Migrations: numbered prefix (001_create_users.sql)

## When Adding a New Feature
1. Create the Zod schema first (model/)
2. Create the service layer (api/*Service.ts)
3. Create query hooks (api/*Queries.ts)
4. Create UI components (ui/)
5. Export public API (index.ts)
6. Add Error Boundary wrapper in the consuming page/widget
7. Generate migration SQL if new tables are needed
8. Generate RLS policies for new tables

## When Modifying an Existing Feature
1. Make changes ONLY within the feature's directory
2. NEVER modify files outside the feature being changed
3. Update the public API (index.ts) if exports change
`;

const REACT_SUPABASE_STACK = `
## Stack (DO NOT deviate)
- Vite 6 + React 19 + TypeScript (strict mode)
- Tailwind CSS v4 + shadcn/ui components
- TanStack Router (type-safe routing)
- TanStack Query v5 (server state)
- Zustand v5 (client state)
- React Hook Form + Zod (forms + validation)
- Supabase (database, auth, storage, edge functions)
- Vitest + React Testing Library + Playwright (testing)

## State Management
| State Type | Tool | Location |
|-----------|------|----------|
| Server State | TanStack Query | Entity query hooks |
| Client State | Zustand | Feature model/ |
| URL State | TanStack Router | Route params/search |

## Supabase Rules
- Use \`auth.uid()\` in RLS policies, never subquery auth.users
- Use security definer functions for complex RLS logic
- Add indexes on all columns referenced in RLS policies
- Never use SELECT * in RLS policy subqueries
`;

const REACT_SPA_STACK = `
## Stack (DO NOT deviate)
- Vite 6 + React 19 + TypeScript (strict mode)
- Tailwind CSS v4 + shadcn/ui components
- TanStack Router (type-safe routing)
- TanStack Query v5 (server state — fetches from external APIs)
- Zustand v5 (client state)
- React Hook Form + Zod (forms + validation)
- Vitest + React Testing Library + Playwright (testing)

## State Management
| State Type | Tool | Location |
|-----------|------|----------|
| Server State | TanStack Query | Entity query hooks |
| Client State | Zustand | Feature model/ |
| URL State | TanStack Router | Route params/search |
`;

const API_SERVICE_STACK = `
## Stack (DO NOT deviate)
- TypeScript (strict mode) + tsx for dev runner
- Fastify 5 (HTTP server)
- Drizzle ORM (database access)
- Zod (request/response validation)
- PostgreSQL via Supabase or local Docker
- Vitest (testing)

## API Rules
- Every endpoint must validate request body with Zod
- Every endpoint must have typed response schemas
- Use Drizzle schema for database access, never raw SQL
- Use middleware for auth, rate limiting, logging
`;

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get the full RULES.md content customized for the chosen template.
 */
export function getProjectRulesContent(template: AppTemplate): string {
  const stackBlock =
    template === "react-supabase"
      ? REACT_SUPABASE_STACK
      : template === "react-spa"
        ? REACT_SPA_STACK
        : API_SERVICE_STACK;

  return [RULES_HEADER, stackBlock, FSD_RULES].join("\n");
}

/**
 * Build a structured prompt for per-feature code generation.
 * Injected into the LLM context when a citizen is implementing a feature.
 */
export function getFeatureImplementationPrompt(
  featureName: string,
  entitySchema: string,
  projectDescription: string,
  template: AppTemplate,
): string {
  const rulesSnippet = getProjectRulesContent(template);

  return [
    `You are implementing the "${featureName}" feature for the project: "${projectDescription}".`,
    ``,
    `## Architecture Rules`,
    rulesSnippet,
    ``,
    `## Entity Schema (Zod)`,
    "```typescript",
    entitySchema,
    "```",
    ``,
    `## Implementation Order (follow exactly)`,
    `1. Zod schema in \`features/${featureName}/model/\``,
    `2. Service in \`features/${featureName}/api/${featureName}Service.ts\``,
    `3. Query hooks in \`features/${featureName}/api/${featureName}Queries.ts\``,
    `4. UI components in \`features/${featureName}/ui/\``,
    `5. Public API in \`features/${featureName}/index.ts\``,
    ``,
    `Return complete, production-ready TypeScript code. No TODO comments. No placeholder data.`,
  ].join("\n");
}

/**
 * Build a structured error context prompt for the self-correction loop.
 * Injected into the LLM when fixing build errors.
 */
export function getFixContextPrompt(
  errors: ParsedBuildError[],
  rulesContent: string,
  fileContent: string,
  filePath: string,
  projectDescription: string,
  citizenName: string,
): string {
  const errorBlock = errors
    .map(
      (e) =>
        `- ${e.errorType.toUpperCase()} at ${e.filePath}:${e.line}:${e.column}\n  ${e.message}`,
    )
    .join("\n");

  return [
    `You are ${citizenName}, an expert TypeScript developer.`,
    `Fix the following build errors while maintaining the FSD architecture.`,
    ``,
    `## Architecture Rules (MUST follow)`,
    rulesContent,
    ``,
    `## Errors to Fix`,
    errorBlock,
    ``,
    `## Current File: ${filePath}`,
    "```typescript",
    fileContent.slice(0, 4000),
    "```",
    ``,
    `## Project: ${projectDescription}`,
    ``,
    `## Instructions`,
    `- Fix ALL listed errors in this file`,
    `- Do NOT modify imports from other features (FSD boundary rule)`,
    `- Do NOT change the public API (index.ts exports)`,
    `- Return the COMPLETE fixed file content`,
    `- Return ONLY the code, no explanation`,
  ].join("\n");
}

/**
 * Build a verification prompt appended after each feature generation.
 * Triggers the AI to self-review before moving on.
 */
export function getVerificationPrompt(featureName: string): string {
  return [
    `Review the code you just generated for the "${featureName}" feature. Analyze for:`,
    `1. Supabase RLS policy gaps — can unauthorized users access this data?`,
    `2. TanStack Query cache invalidation — after a mutation, are all related queries properly invalidated?`,
    `3. React re-render performance — are there unnecessary re-renders caused by unstable references?`,
    `4. Error handling — what happens if the Supabase call fails?`,
    `5. FSD boundary compliance — are there any cross-feature imports?`,
    `Refactor to address any issues found.`,
  ].join("\n");
}

/**
 * Generate a Zod schema file content from an entity specification.
 */
export function generateZodSchemaContent(entity: EntitySpec): string {
  const fieldLines = entity.fields.map((f) => {
    let zodType: string;
    switch (f.type) {
      case "uuid":
        zodType = "z.string().uuid()";
        break;
      case "string":
        zodType = f.validation === "email"
          ? "z.string().email()"
          : f.validation === "url"
            ? "z.string().url()"
            : "z.string()";
        if (f.validation?.startsWith("min(")) {
          zodType += `.min(${f.validation.match(/\d+/)?.[0] ?? 1})`;
        }
        if (f.validation?.startsWith("max(")) {
          zodType += `.max(${f.validation.match(/\d+/)?.[0] ?? 255})`;
        }
        break;
      case "number":
        zodType = "z.number()";
        break;
      case "boolean":
        zodType = "z.boolean()";
        break;
      case "date":
        zodType = "z.string().datetime()";
        break;
      case "enum":
        zodType = `z.enum([${(f.enumValues ?? []).map((v) => `'${v}'`).join(", ")}])`;
        break;
      case "array":
        zodType = "z.array(z.unknown())";
        break;
      case "object":
        zodType = "z.record(z.unknown())";
        break;
      default:
        zodType = "z.unknown()";
    }
    if (!f.required) {
      zodType += ".nullable().optional()";
    }
    const comment = f.description ? ` // ${f.description}` : "";
    return `  ${f.name}: ${zodType},${comment}`;
  });

  const pascalName = entity.name.charAt(0).toUpperCase() + entity.name.slice(1);

  return [
    `import { z } from 'zod';`,
    ``,
    `export const ${pascalName}Schema = z.object({`,
    ...fieldLines,
    `});`,
    ``,
    `export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;`,
    ``,
    `// Form-specific schema (subset for input validation)`,
    `export const Create${pascalName}Schema = ${pascalName}Schema.omit({`,
    `  id: true,`,
    `  created_at: true,`,
    `  updated_at: true,`,
    `});`,
    ``,
    `export type Create${pascalName}Input = z.infer<typeof Create${pascalName}Schema>;`,
    ``,
    `export const Update${pascalName}Schema = Create${pascalName}Schema.partial();`,
    ``,
    `export type Update${pascalName}Input = z.infer<typeof Update${pascalName}Schema>;`,
    ``,
  ].join("\n");
}

/**
 * Generate an SQL migration for an entity.
 */
export function generateMigrationSQL(entity: EntitySpec, migrationNumber: number): string {
  const colLines = entity.fields.map((f) => {
    let sqlType: string;
    switch (f.type) {
      case "uuid":
        sqlType = "UUID";
        break;
      case "string":
        sqlType = "TEXT";
        break;
      case "number":
        sqlType = "INTEGER";
        break;
      case "boolean":
        sqlType = "BOOLEAN NOT NULL DEFAULT false";
        break;
      case "date":
        sqlType = "TIMESTAMPTZ NOT NULL DEFAULT now()";
        break;
      case "enum":
        sqlType = `TEXT NOT NULL CHECK (${f.name} IN (${(f.enumValues ?? []).map((v) => `'${v}'`).join(", ")}))`;
        break;
      default:
        sqlType = "TEXT";
    }
    const pk = f.name === "id" ? " PRIMARY KEY DEFAULT gen_random_uuid()" : "";
    const nullable = !f.required && f.name !== "id" ? "" : " NOT NULL";
    // Skip NOT NULL for types that already include it or for PK
    if (pk || sqlType.includes("NOT NULL")) {
      return `  ${f.name} ${sqlType}${pk}`;
    }
    return `  ${f.name} ${sqlType}${nullable}${pk}`;
  });

  const pad = String(migrationNumber).padStart(3, "0");
  const rlsPolicy = generateRLSPolicy(entity);

  return [
    `-- ${pad}_create_${entity.tableName}.sql`,
    `-- Auto-generated by HoC App Generation Engine`,
    ``,
    `CREATE TABLE public.${entity.tableName} (`,
    colLines.join(",\n"),
    `);`,
    ``,
    `-- Always enable RLS`,
    `ALTER TABLE public.${entity.tableName} ENABLE ROW LEVEL SECURITY;`,
    ``,
    rlsPolicy,
    ``,
    `-- Auto-update timestamps`,
    `CREATE TRIGGER set_updated_at`,
    `  BEFORE UPDATE ON public.${entity.tableName}`,
    `  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();`,
    ``,
    `-- Index for common query patterns`,
    ...entity.fields
      .filter((f) => f.name.endsWith("_id") || f.name === "created_at")
      .map((f) => `CREATE INDEX idx_${entity.tableName}_${f.name} ON public.${entity.tableName}(${f.name}${f.name === "created_at" ? " DESC" : ""});`),
    ``,
  ].join("\n");
}

function generateRLSPolicy(entity: EntitySpec): string {
  switch (entity.rlsPattern) {
    case "own-data":
      return [
        `CREATE POLICY "Users can view own data"`,
        `  ON public.${entity.tableName} FOR SELECT`,
        `  USING (auth.uid() = user_id);`,
        ``,
        `CREATE POLICY "Users can insert own data"`,
        `  ON public.${entity.tableName} FOR INSERT`,
        `  WITH CHECK (auth.uid() = user_id);`,
        ``,
        `CREATE POLICY "Users can update own data"`,
        `  ON public.${entity.tableName} FOR UPDATE`,
        `  USING (auth.uid() = user_id)`,
        `  WITH CHECK (auth.uid() = user_id);`,
        ``,
        `CREATE POLICY "Users can delete own data"`,
        `  ON public.${entity.tableName} FOR DELETE`,
        `  USING (auth.uid() = user_id);`,
      ].join("\n");

    case "org-based":
      return [
        `CREATE POLICY "Members can view org data"`,
        `  ON public.${entity.tableName} FOR SELECT`,
        `  USING (`,
        `    org_id IN (`,
        `      SELECT org_id FROM public.org_members`,
        `      WHERE user_id = auth.uid()`,
        `    )`,
        `  );`,
        ``,
        `CREATE POLICY "Members can insert org data"`,
        `  ON public.${entity.tableName} FOR INSERT`,
        `  WITH CHECK (`,
        `    org_id IN (`,
        `      SELECT org_id FROM public.org_members`,
        `      WHERE user_id = auth.uid()`,
        `    )`,
        `  );`,
      ].join("\n");

    case "public-read":
      return [
        `CREATE POLICY "Public read access"`,
        `  ON public.${entity.tableName} FOR SELECT`,
        `  TO anon, authenticated`,
        `  USING (true);`,
        ``,
        `CREATE POLICY "Authenticated insert"`,
        `  ON public.${entity.tableName} FOR INSERT`,
        `  TO authenticated`,
        `  WITH CHECK (auth.uid() = user_id);`,
      ].join("\n");

    case "admin-only":
      return [
        `CREATE POLICY "Admin only access"`,
        `  ON public.${entity.tableName} FOR ALL`,
        `  USING (public.is_admin(auth.uid()));`,
      ].join("\n");

    default:
      return `-- TODO: Define RLS policies for ${entity.tableName}`;
  }
}
