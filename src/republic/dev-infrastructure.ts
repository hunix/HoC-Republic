/**
 * Republic DevStudio — Infrastructure Module
 *
 * Generates Supabase, Docker, CI/CD, and environment configurations
 * for autonomous full-stack backend support.
 */

// ─── Supabase Configuration ────────────────────────────────────────

export function generateSupabaseConfig(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);
  return `[project]
id   = "${slug}"
name = "${projectName}"

[api]
enabled = true
port    = 54321
schemas = ["public", "storage"]

[db]
port         = 54322
major_version = 15

[studio]
enabled = true
port    = 54323

[auth]
enabled          = true
site_url         = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]

[auth.email]
enable_signup         = true
double_confirm_changes = true
enable_confirmations  = false

[storage]
enabled = true
file_size_limit = "50MiB"

[analytics]
enabled = false
`;
}

export function generateSupabaseClient(_projectName: string): string {
  return `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Helper: get current user
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

// Helper: sign in with email
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Helper: sign up
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// Helper: sign out
export async function signOut() {
  await supabase.auth.signOut();
}

// Helper: typed query
export function from<T extends Record<string, unknown>>(table: string) {
  return supabase.from(table) as unknown as {
    select: (cols?: string) => Promise<{ data: T[] | null; error: unknown }>;
    insert: (row: Partial<T>) => Promise<{ data: T | null; error: unknown }>;
    update: (row: Partial<T>) => { eq: (col: string, val: unknown) => Promise<{ data: T | null; error: unknown }> };
    delete: () => { eq: (col: string, val: unknown) => Promise<{ error: unknown }> };
  };
}
`;
}

export function generateSupabaseMigration(projectName: string): string {
  return `-- ${projectName} — Initial Schema
-- Created by Republic DevStudio GSD Pipeline

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users profile table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE,
  full_name   TEXT,
  avatar_url  TEXT,
  bio         TEXT,
  role        TEXT DEFAULT 'user',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Example data table
CREATE TABLE IF NOT EXISTS items (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own items"
  ON items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create items"
  ON items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON items FOR DELETE
  USING (auth.uid() = user_id);
`;
}

export function generateSupabaseSeed(): string {
  return `-- Seed data for development
-- This runs automatically with 'supabase db reset'

-- Insert test data (requires a test user to exist)
-- INSERT INTO items (user_id, title, description, status)
-- VALUES
--   ('test-user-id', 'First Item', 'Description here', 'active'),
--   ('test-user-id', 'Second Item', 'Another item', 'active');
`;
}

// ─── Docker Configuration ──────────────────────────────────────────

export function generateDockerfile(stack: { languages: string[]; frameworks: string[] }): string {
  const isNode = stack.languages.some((l) => ["typescript", "javascript"].includes(l));
  const isPython = stack.languages.includes("python");
  const isGo = stack.languages.includes("go");
  const isRust = stack.languages.includes("rust");

  if (isNode) {
    const isNext = stack.frameworks.some((f) => ["nextjs", "next.js", "next"].includes(f));
    if (isNext) {
      return `# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
`;
    }
    return `FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
`;
  }

  if (isPython) {
    return `FROM python:3.12-slim AS base
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
  }

  if (isGo) {
    return `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server .

FROM alpine:3.19
COPY --from=builder /server /server
EXPOSE 8080
CMD ["/server"]
`;
  }

  if (isRust) {
    return `FROM rust:1.75 AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/app /usr/local/bin/app
EXPOSE 8080
CMD ["app"]
`;
  }

  // Generic
  return `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3000
CMD ["npm", "start"]
`;
}

export function generateDockerCompose(projectName: string, hasSupabase: boolean): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let compose = `version: "3.9"

services:
  app:
    build: .
    container_name: ${slug}-app
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    restart: unless-stopped
    networks:
      - app-network
`;

  if (hasSupabase) {
    compose += `
    depends_on:
      - db
      - storage

  db:
    image: supabase/postgres:15.1.0.147
    container_name: ${slug}-db
    ports:
      - "54322:5432"
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${slug}
    volumes:
      - db-data:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - app-network

  storage:
    image: supabase/storage-api:v0.43.11
    container_name: ${slug}-storage
    depends_on:
      - db
    environment:
      DATABASE_URL: postgres://postgres:postgres@db:5432/${slug}
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
    volumes:
      - storage-data:/var/lib/storage
    networks:
      - app-network

  studio:
    image: supabase/studio:20240101
    container_name: ${slug}-studio
    ports:
      - "54323:3000"
    environment:
      SUPABASE_URL: http://kong:8000
      STUDIO_PG_META_URL: http://meta:8080
    networks:
      - app-network

volumes:
  db-data:
  storage-data:
`;
  }

  compose += `
networks:
  app-network:
    driver: bridge
`;
  return compose;
}

export function generateDockerIgnore(): string {
  return `node_modules
.next
.git
*.md
.env*.local
.vscode
coverage
.turbo
dist
build
`;
}

// ─── Environment Configuration ─────────────────────────────────────

export function generateEnvLocal(projectName: string, hasSupabase: boolean): string {
  let env = `# ${projectName} — Local Environment
# Generated by Republic DevStudio
# ⚠️ DO NOT COMMIT THIS FILE

NODE_ENV=development
`;

  if (hasSupabase) {
    env += `
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.placeholder
SUPABASE_JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters
`;
  }

  env += `
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=${projectName}
`;
  return env;
}

export function generateEnvExample(projectName: string, hasSupabase: boolean): string {
  let env = `# ${projectName} — Environment Variables
# Copy to .env.local and fill in values

NODE_ENV=development
`;
  if (hasSupabase) {
    env += `
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
`;
  }
  env += `
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=${projectName}
`;
  return env;
}

// ─── CI/CD ─────────────────────────────────────────────────────────

export function generateGitHubActions(projectName: string): string {
  return `name: CI/CD — ${projectName}

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Deploy
        run: echo "Deploy step — configure for your platform"
`;
}

// ─── Project Manifest / README ─────────────────────────────────────

export function generateReadme(
  projectName: string,
  description: string,
  hasSupabase: boolean,
  hasDocker: boolean,
): string {
  let readme = `# ${projectName}

${description}

Built autonomously by **Republic DevStudio** GSD Pipeline with peer-reviewed code quality.

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Run dev server
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.
`;

  if (hasSupabase) {
    readme += `
## Supabase Setup

\`\`\`bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# Run migrations
supabase db reset

# Open Supabase Studio
# http://localhost:54323
\`\`\`

Copy \`.env.example\` to \`.env.local\` and fill in your Supabase keys.
`;
  }

  if (hasDocker) {
    readme += `
## Docker

\`\`\`bash
# Build and run
docker-compose up --build

# Production build
docker build -t ${projectName.toLowerCase().replace(/\s+/g, "-")} .
\`\`\`
`;
  }

  readme += `
## Tech Stack

- **Frontend**: React / Next.js
- **Styling**: Tailwind CSS
${hasSupabase ? "- **Backend**: Supabase (Auth, Database, Storage)\n" : ""}${hasDocker ? "- **Container**: Docker + Docker Compose\n" : ""}- **CI/CD**: GitHub Actions

## Project Structure

\`\`\`
├── src/
│   ├── app/
│   │   ├── page.tsx          # Home page
│   │   ├── layout.tsx        # Root layout
│   │   └── api/              # API routes
│   ├── components/           # Reusable components
│   ├── lib/                  # Utilities & clients
│   └── styles/               # Global styles
├── public/                   # Static assets
${hasSupabase ? "├── supabase/\n│   ├── config.toml           # Supabase config\n│   ├── migrations/           # Database migrations\n│   └── seed.sql              # Seed data\n" : ""}${hasDocker ? "├── docker-compose.yml        # Docker services\n├── Dockerfile                # Container build\n" : ""}├── .env.example              # Environment template
├── package.json
└── README.md
\`\`\`

## License

MIT
`;
  return readme;
}

// ─── Full-Stack File Set Generator ─────────────────────────────────

export interface InfraFile {
  path: string;
  language: string;
  content: string;
}

/**
 * Generate the full infrastructure file set for a project.
 * Returns all Supabase, Docker, env, and CI/CD files.
 */
export function generateInfrastructureFiles(
  projectName: string,
  description: string,
  stack: { languages: string[]; frameworks: string[] },
  options: { supabase?: boolean; docker?: boolean; cicd?: boolean } = {},
): InfraFile[] {
  const hasSupabase = options.supabase ?? true;
  const hasDocker = options.docker ?? true;
  const hasCICD = options.cicd ?? true;
  const files: InfraFile[] = [];

  // README
  files.push({
    path: "README.md",
    language: "markdown",
    content: generateReadme(projectName, description, hasSupabase, hasDocker),
  });

  // Environment
  files.push({
    path: ".env.example",
    language: "text",
    content: generateEnvExample(projectName, hasSupabase),
  });
  files.push({
    path: ".env.local",
    language: "text",
    content: generateEnvLocal(projectName, hasSupabase),
  });

  // Supabase
  if (hasSupabase) {
    files.push({
      path: "supabase/config.toml",
      language: "toml",
      content: generateSupabaseConfig(projectName),
    });
    files.push({
      path: "supabase/migrations/0001_init.sql",
      language: "sql",
      content: generateSupabaseMigration(projectName),
    });
    files.push({ path: "supabase/seed.sql", language: "sql", content: generateSupabaseSeed() });
    files.push({
      path: "src/lib/supabase.ts",
      language: "typescript",
      content: generateSupabaseClient(projectName),
    });
  }

  // Docker
  if (hasDocker) {
    files.push({ path: "Dockerfile", language: "dockerfile", content: generateDockerfile(stack) });
    files.push({
      path: "docker-compose.yml",
      language: "yaml",
      content: generateDockerCompose(projectName, hasSupabase),
    });
    files.push({ path: ".dockerignore", language: "text", content: generateDockerIgnore() });
  }

  // CI/CD
  if (hasCICD) {
    files.push({
      path: ".github/workflows/ci.yml",
      language: "yaml",
      content: generateGitHubActions(projectName),
    });
  }

  return files;
}
