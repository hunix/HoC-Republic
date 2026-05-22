# Enterprise-Grade AI App Generation Architecture Guide

**A Comprehensive Playbook for Building Zero-Regression React + Supabase Applications Through AI Agents**

**Author:** Manus AI | **Date:** March 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The 2026 Production Stack](#2-the-2026-production-stack)
3. [Architectural Paradigm: Feature-Sliced Design](#3-architectural-paradigm-feature-sliced-design)
4. [The Reference Project Structure](#4-the-reference-project-structure)
5. [Supabase Enterprise Integration Patterns](#5-supabase-enterprise-integration-patterns)
6. [State Management Architecture](#6-state-management-architecture)
7. [Type Safety and Validation Layer](#7-type-safety-and-validation-layer)
8. [Error Handling and Fault Isolation](#8-error-handling-and-fault-isolation)
9. [The Agentic Workflow: Plan-Execute-Validate](#9-the-agentic-workflow-plan-execute-validate)
10. [Context Engineering for the Planning Agent](#10-context-engineering-for-the-planning-agent)
11. [Testing Strategy for AI-Generated Code](#11-testing-strategy-for-ai-generated-code)
12. [Security Hardening Checklist](#12-security-hardening-checklist)
13. [Performance and Scalability Patterns](#13-performance-and-scalability-patterns)
14. [The RULES.md System Prompt Template](#14-the-rulesmd-system-prompt-template)
15. [Recommended Libraries and Versions](#15-recommended-libraries-and-versions)
16. [Conclusion](#16-conclusion)
17. [References](#references)

---

## 1. Executive Summary

As AI coding agents transition from generating simple scripts to orchestrating full-stack enterprise applications, the bottleneck is no longer code generation speed but **architectural stability**. When an AI agent generates code without strict architectural boundaries, the result is what the industry now calls "AI slop" — tightly coupled components where fixing a bug on one page breaks functionality on another, where adding a feature cascades errors across unrelated modules, and where the codebase degrades with every iteration [1].

> "Coding via agents requires more rigor, more structure, more code quality, not less." — Adam Tornhill, CodeScene, February 2026 [2]

This document is the definitive architecture guide for your AI-powered app generation system. It synthesizes deep research across the React ecosystem, Supabase best practices, Feature-Sliced Design methodology, agentic AI coding patterns, and test-driven development research to provide a complete, actionable playbook. By enforcing the patterns described here, your planning agent — whether powered by Gemini Pro, Claude Sonnet, or Claude Opus — will produce modular, maintainable, production-grade applications where features are fully isolated, regressions are structurally impossible, and every generated line of code is validated against typed contracts.

The core thesis is straightforward: **shift the burden of stability from the AI's probabilistic reasoning to deterministic architectural contracts**. When the architecture enforces isolation through import rules, typed schemas, and layered abstractions, the AI cannot accidentally create cross-feature dependencies regardless of how it hallucinates internally.

---

## 2. The 2026 Production Stack

The planning agent must be strictly constrained to a specific, modern, well-documented stack. Every library in this stack was selected for three criteria: (1) it is the current industry standard with extensive training data for LLMs, (2) it enforces type safety or structural contracts that catch AI errors at build time, and (3) it has minimal configuration surface area, reducing the probability of hallucinated config options.

### 2.1 The Canonical Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Build Tool** | Vite | 6.x+ | Instant HMR, native ESM, minimal config. Replaces deprecated CRA [3] |
| **Language** | TypeScript | 5.x (strict mode) | Catches hallucinated property names, wrong argument types at compile time |
| **UI Framework** | React | 19.x | React Compiler for automatic memoization, Server Components support [4] |
| **Styling** | Tailwind CSS | 4.x | Utility-first, no CSS file management, AI-friendly class composition |
| **Component Library** | shadcn/ui + Radix UI | Latest | Accessible, unstyled primitives. Copy-paste model means no version lock-in |
| **Routing** | TanStack Router | 1.x | 100% type-safe routes. AI cannot generate dead links — TypeScript catches them [5] |
| **Server State** | TanStack Query | 5.x | Caching, background refetch, optimistic updates, automatic retry |
| **Client State** | Zustand | 5.x | Minimal boilerplate, no providers, works outside React tree |
| **Forms** | React Hook Form + Zod | Latest | Performant uncontrolled forms with schema-based validation |
| **Database** | PostgreSQL via Supabase | Latest | Full Postgres with RLS, realtime, edge functions |
| **Auth** | Supabase Auth | Latest | Built-in social login, MFA, SSR-compatible session management |
| **Icons** | Lucide React | Latest | Tree-shakeable, consistent icon set |
| **Date Handling** | date-fns | Latest | Functional, tree-shakeable, no mutable Date objects |
| **HTTP Client** | Supabase JS Client | Latest | Auto-generated types, RLS-aware, realtime subscriptions |

### 2.2 Why This Stack Eliminates AI Errors

Each technology choice serves as an **error-catching layer**:

**TypeScript strict mode** catches the most common AI hallucination — inventing property names that do not exist on an object. When the AI generates `user.fullName` but the Supabase schema defines `full_name`, TypeScript immediately flags the error at compile time rather than at runtime in production.

**TanStack Router's type-safe routing** means the AI cannot generate a `<Link to="/dashbord">` (typo) without the TypeScript compiler rejecting it. Every route parameter, search parameter, and path segment is type-checked against the route tree definition [5].

**TanStack Query** eliminates the most dangerous pattern in AI-generated React code: raw `useEffect` + `fetch` combinations. AI agents frequently generate data fetching code with missing cleanup functions, race conditions, and no error handling. TanStack Query handles all of these concerns automatically through its declarative API [6].

**Zod validation** acts as a runtime type-checker at the boundary between the application and the database. Even if the AI generates code that expects a field that does not exist in the database, Zod's `parse()` will throw a descriptive error immediately rather than allowing `undefined` to propagate silently through the component tree [7].

---

## 3. Architectural Paradigm: Feature-Sliced Design

The single most important instruction for the planning agent is the **folder structure and import rules**. Traditional architectures that group files by technical role (`components/`, `hooks/`, `api/`, `utils/`) fail catastrophically under AI generation because the AI loses track of feature boundaries. A component in `components/UserCard.tsx` might import from `hooks/usePost.ts`, which imports from `api/comments.ts`, creating an invisible web of dependencies that makes any change potentially break anything.

The system must enforce **Feature-Sliced Design (FSD)** [8], an architectural methodology that divides the application into layers with strict unidirectional dependency rules.

### 3.1 The Layer Hierarchy

FSD defines six layers, ordered from highest (most composed) to lowest (most reusable). The fundamental rule is: **a layer can only import from layers below it, never from layers at the same level or above**.

| Layer | Purpose | Examples | Can Import From |
|-------|---------|----------|----------------|
| `app/` | Global initialization, providers, router | `App.tsx`, `providers.tsx`, `router.tsx` | All layers below |
| `pages/` | Route-level composition | `DashboardPage`, `SettingsPage` | widgets, features, entities, shared |
| `widgets/` | Complex composed UI blocks | `Header`, `Sidebar`, `UserProfileCard` | features, entities, shared |
| `features/` | User interactions with business value | `AuthByEmail`, `CreatePost`, `FilterTasks` | entities, shared |
| `entities/` | Business domain objects | `User`, `Post`, `Comment`, `Organization` | shared |
| `shared/` | Reusable infrastructure | UI kit, Supabase client, utilities, types | Nothing (leaf layer) |

### 3.2 Slices and Segments

Within each layer, code is organized into **slices** (business domain units) and **segments** (technical concerns within a slice):

```
src/
├── features/
│   ├── auth-by-email/          ← Slice
│   │   ├── ui/                 ← Segment: React components
│   │   ├── model/              ← Segment: State, types, Zod schemas
│   │   ├── api/                ← Segment: Supabase service calls
│   │   ├── lib/                ← Segment: Helper functions
│   │   └── index.ts            ← PUBLIC API (the only importable file)
│   ├── create-post/
│   │   ├── ui/
│   │   ├── model/
│   │   ├── api/
│   │   └── index.ts
```

### 3.3 The Public API Contract (The Anti-Regression Mechanism)

This is the most critical rule for preventing cascading bugs:

> **Every slice MUST expose a single `index.ts` file. The AI is strictly forbidden from importing anything except through this public API.**

**Forbidden** (deep import — creates hidden coupling):
```typescript
import { PostForm } from '@/features/create-post/ui/PostForm';
```

**Required** (public API import — creates explicit contract):
```typescript
import { CreatePostForm } from '@/features/create-post';
```

This pattern works because `index.ts` acts as a **contract boundary**. The AI can completely refactor the internal implementation of `create-post` — rename files, restructure components, change the internal state management — and as long as the `index.ts` exports remain the same, **zero other files in the entire application will break**. This is the architectural equivalent of microservice boundaries, but without the operational complexity of separate deployments [8].

### 3.4 Enforcing FSD with ESLint

The planning agent should generate an ESLint configuration that physically prevents import rule violations at build time. This means even if the AI hallucinates a cross-layer import, the build will fail with a clear error message rather than silently creating a regression.

```javascript
// eslint.config.js - The AI must generate this
import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/*' },
        { type: 'pages', pattern: 'src/pages/*' },
        { type: 'widgets', pattern: 'src/widgets/*' },
        { type: 'features', pattern: 'src/features/*' },
        { type: 'entities', pattern: 'src/entities/*' },
        { type: 'shared', pattern: 'src/shared/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [2, {
        default: 'disallow',
        rules: [
          { from: 'app', allow: ['pages', 'widgets', 'features', 'entities', 'shared'] },
          { from: 'pages', allow: ['widgets', 'features', 'entities', 'shared'] },
          { from: 'widgets', allow: ['features', 'entities', 'shared'] },
          { from: 'features', allow: ['entities', 'shared'] },
          { from: 'entities', allow: ['shared'] },
          { from: 'shared', allow: [] },
        ],
      }],
    },
  },
];
```

---

## 4. The Reference Project Structure

The planning agent must generate every new project using this exact structure. This serves as the canonical template that the AI must never deviate from.

```
project-root/
├── public/
├── src/
│   ├── app/
│   │   ├── providers/
│   │   │   ├── QueryProvider.tsx        # TanStack Query setup
│   │   │   ├── AuthProvider.tsx         # Supabase Auth context
│   │   │   ├── ThemeProvider.tsx        # Dark/light mode
│   │   │   └── index.tsx               # Compose all providers
│   │   ├── router/
│   │   │   ├── routes.tsx              # TanStack Router route tree
│   │   │   ├── guards.tsx              # Auth guards, role checks
│   │   │   └── index.tsx
│   │   ├── styles/
│   │   │   └── globals.css             # Tailwind directives
│   │   └── App.tsx                     # Root component
│   │
│   ├── pages/
│   │   ├── dashboard/
│   │   │   ├── ui/
│   │   │   │   └── DashboardPage.tsx   # Composes widgets/features
│   │   │   └── index.ts
│   │   ├── settings/
│   │   │   ├── ui/
│   │   │   │   └── SettingsPage.tsx
│   │   │   └── index.ts
│   │   └── auth/
│   │       ├── ui/
│   │       │   ├── LoginPage.tsx
│   │       │   └── RegisterPage.tsx
│   │       └── index.ts
│   │
│   ├── widgets/
│   │   ├── header/
│   │   │   ├── ui/
│   │   │   │   └── Header.tsx
│   │   │   └── index.ts
│   │   ├── sidebar/
│   │   │   ├── ui/
│   │   │   │   └── Sidebar.tsx
│   │   │   ├── model/
│   │   │   │   └── sidebarStore.ts     # Zustand store for open/close
│   │   │   └── index.ts
│   │   └── layout/
│   │       ├── ui/
│   │       │   └── AppLayout.tsx       # Shell with header + sidebar + outlet
│   │       └── index.ts
│   │
│   ├── features/
│   │   ├── auth-by-email/
│   │   │   ├── ui/
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   └── RegisterForm.tsx
│   │   │   ├── model/
│   │   │   │   └── authSchemas.ts      # Zod schemas for login/register
│   │   │   ├── api/
│   │   │   │   └── authService.ts      # Supabase Auth calls
│   │   │   └── index.ts
│   │   ├── create-post/
│   │   │   ├── ui/
│   │   │   │   └── CreatePostForm.tsx
│   │   │   ├── model/
│   │   │   │   └── postFormSchema.ts
│   │   │   ├── api/
│   │   │   │   └── createPostMutation.ts
│   │   │   └── index.ts
│   │   └── filter-tasks/
│   │       ├── ui/
│   │       │   └── TaskFilter.tsx
│   │       ├── model/
│   │       │   └── filterStore.ts      # Zustand for filter state
│   │       └── index.ts
│   │
│   ├── entities/
│   │   ├── user/
│   │   │   ├── ui/
│   │   │   │   ├── UserAvatar.tsx
│   │   │   │   └── UserCard.tsx
│   │   │   ├── model/
│   │   │   │   ├── userTypes.ts        # Generated from Supabase
│   │   │   │   └── userSchemas.ts      # Zod schemas
│   │   │   ├── api/
│   │   │   │   ├── userService.ts      # Supabase queries
│   │   │   │   └── userQueries.ts      # TanStack Query hooks
│   │   │   └── index.ts
│   │   ├── post/
│   │   │   ├── ui/
│   │   │   │   ├── PostCard.tsx
│   │   │   │   └── PostList.tsx
│   │   │   ├── model/
│   │   │   │   └── postSchemas.ts
│   │   │   ├── api/
│   │   │   │   ├── postService.ts
│   │   │   │   └── postQueries.ts
│   │   │   └── index.ts
│   │   └── organization/
│   │       ├── model/
│   │       │   └── orgSchemas.ts
│   │       ├── api/
│   │       │   ├── orgService.ts
│   │       │   └── orgQueries.ts
│   │       └── index.ts
│   │
│   ├── shared/
│   │   ├── ui/                         # shadcn/ui components live here
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Dialog.tsx
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── supabase.ts             # Supabase client singleton
│   │   │   ├── queryClient.ts          # TanStack Query client config
│   │   │   ├── utils.ts                # cn() helper, formatters
│   │   │   └── constants.ts
│   │   ├── api/
│   │   │   └── baseService.ts          # Base service with error handling
│   │   ├── hooks/
│   │   │   ├── useAuth.ts              # Current user hook
│   │   │   └── useMediaQuery.ts
│   │   └── types/
│   │       └── database.types.ts       # Auto-generated Supabase types
│   │
│   ├── main.tsx                        # Entry point
│   └── vite-env.d.ts
│
├── supabase/
│   ├── migrations/                     # Version-controlled SQL migrations
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_posts.sql
│   │   └── 003_rls_policies.sql
│   ├── functions/                      # Edge Functions
│   ├── seed.sql                        # Development seed data
│   └── config.toml
│
├── tests/
│   ├── integration/                    # Supabase integration tests
│   ├── e2e/                            # Playwright E2E tests
│   └── setup.ts                        # Test configuration
│
├── .env.local                          # Environment variables (gitignored)
├── .env.example                        # Template for env vars
├── eslint.config.js                    # FSD boundary enforcement
├── tsconfig.json                       # Strict TypeScript config
├── tailwind.config.ts
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## 5. Supabase Enterprise Integration Patterns

The AI must never scatter `supabase.from('table')` calls throughout UI components. This creates an unmaintainable web of database dependencies that makes refactoring impossible. Instead, the system enforces a strict three-layer pattern [9] [10].

### 5.1 The Service-Hook-UI Pattern

This is the canonical data access pattern that the AI must follow for every entity:

**Layer 1: Base Service (shared/api/baseService.ts)**

```typescript
import { supabase } from '@/shared/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';

export class BaseService {
  protected async query<T>(
    queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>
  ): Promise<T> {
    const { data, error } = await queryFn();
    if (error) {
      throw new ServiceError(error.message, error.code, error.details);
    }
    if (data === null) {
      throw new ServiceError('No data returned', 'PGRST116', '');
    }
    return data;
  }
}

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details: string
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
```

**Layer 2: Entity Service (entities/user/api/userService.ts)**

```typescript
import { BaseService } from '@/shared/api/baseService';
import { supabase } from '@/shared/lib/supabase';
import { UserSchema, type User } from '../model/userSchemas';

class UserService extends BaseService {
  async getById(id: string): Promise<User> {
    const data = await this.query(() =>
      supabase.from('users').select('*').eq('id', id).single()
    );
    return UserSchema.parse(data); // Zod validates the response
  }

  async getAll(filters?: { role?: string }): Promise<User[]> {
    const data = await this.query(() => {
      let query = supabase.from('users').select('*');
      if (filters?.role) query = query.eq('role', filters.role);
      return query;
    });
    return data.map((item) => UserSchema.parse(item));
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    const data = await this.query(() =>
      supabase.from('users').update(updates).eq('id', id).select().single()
    );
    return UserSchema.parse(data);
  }
}

export const userService = new UserService();
```

**Layer 3: TanStack Query Hooks (entities/user/api/userQueries.ts)**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from './userService';

export const userKeys = {
  all: ['users'] as const,
  detail: (id: string) => ['users', id] as const,
  list: (filters?: Record<string, unknown>) => ['users', 'list', filters] as const,
};

export const useUser = (id: string) => {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => userService.getById(id),
    enabled: !!id,
  });
};

export const useUsers = (filters?: { role?: string }) => {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => userService.getAll(filters),
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<User> }) =>
      userService.update(id, updates),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(userKeys.detail(id), data);
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
};
```

**Layer 4: UI Component (only calls hooks)**

```typescript
import { useUser, useUpdateUser } from '@/entities/user';

export function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useUser(userId);
  const updateUser = useUpdateUser();

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <Card>
      <UserAvatar user={user} />
      <Button onClick={() => updateUser.mutate({ id: userId, updates: { name: 'New Name' } })}>
        Update
      </Button>
    </Card>
  );
}
```

### 5.2 Row Level Security (RLS) as an Architectural Guardrail

RLS is not just a security feature — it is a **safety net against AI hallucinations**. Even if the AI generates frontend code that accidentally requests all users' data without a filter, the Postgres RLS policy will block the unauthorized rows at the database level [11] [12].

The AI must generate RLS policies for **every single table**. The planning agent should produce the migration SQL as part of its plan, not as an afterthought.

**Mandatory RLS Patterns:**

```sql
-- Pattern 1: Users can only read/write their own data
CREATE POLICY "Users can view own data"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Pattern 2: Organization-based multi-tenancy
CREATE POLICY "Members can view org data"
  ON public.projects FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Pattern 3: Use security definer functions for complex logic
CREATE OR REPLACE FUNCTION public.is_org_admin(org_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = org_uuid
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

CREATE POLICY "Only admins can delete"
  ON public.projects FOR DELETE
  USING (public.is_org_admin(org_id));
```

**RLS Performance Rules for the AI:**

The AI must follow these rules to prevent RLS from becoming a performance bottleneck [11]:

1. Always use `auth.uid()` (a built-in Supabase function) rather than subqueries against the `auth.users` table.
2. For multi-tenancy policies that check membership, use `security definer` functions to avoid the query planner creating inefficient nested loops.
3. Add indexes on all columns referenced in RLS policies (e.g., `org_id`, `user_id`).
4. Never use `SELECT *` in RLS policy subqueries — select only the required column.

### 5.3 Database Migrations as Version-Controlled Code

The AI must generate all schema changes as numbered migration files in the `supabase/migrations/` directory, never as ad-hoc SQL executed in the dashboard. This ensures reproducibility and prevents the "works on my machine" problem [10].

```sql
-- supabase/migrations/001_initial_schema.sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Always enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Auto-update timestamps via trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 6. State Management Architecture

One of the most common sources of cross-feature regressions in AI-generated code is improper state management. The AI must follow a strict separation of state concerns [6] [13].

### 6.1 The Three Categories of State

| State Type | Tool | Location | Example |
|-----------|------|----------|---------|
| **Server State** | TanStack Query | Entity query hooks | User data, posts, comments |
| **Client State** | Zustand | Feature or widget `model/` | Sidebar open/close, theme, filters |
| **URL State** | TanStack Router | Route params/search | Current page, sort order, tab selection |

### 6.2 Rules for the AI

**Rule 1: Never use `useEffect` for data fetching.** The AI must always use TanStack Query's `useQuery` and `useMutation` hooks. This eliminates race conditions, provides automatic caching, and handles loading/error states declaratively.

**Rule 2: Never use React Context for frequently changing state.** Context triggers re-renders on every consumer when the value changes. The AI must use Zustand for any state that updates frequently (e.g., form state, UI toggles). Context is acceptable only for rarely-changing values like the current theme or authenticated user.

**Rule 3: Derive state, never duplicate it.** If a value can be computed from existing state, the AI must compute it inline or use `useMemo`. It must never create a separate state variable that mirrors another.

**Rule 4: Keep state as close to where it is used as possible.** The AI must not hoist state to a global store unless multiple unrelated components need it. Local `useState` is preferred for component-specific state.

### 6.3 TanStack Query Key Factory Pattern

To prevent cache key collisions and ensure consistent invalidation, the AI must generate a key factory for every entity [6]:

```typescript
// entities/post/api/postQueries.ts
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filters: PostFilters) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
};
```

This factory pattern ensures that `queryClient.invalidateQueries({ queryKey: postKeys.all })` correctly invalidates all post-related queries (lists and details) without accidentally invalidating user queries.

---

## 7. Type Safety and Validation Layer

Type safety is the primary defense against AI hallucinations. The system must enforce types at three boundaries: (1) the database schema, (2) the API response, and (3) the user input [7].

### 7.1 Auto-Generated Database Types

The AI must instruct the system to run `supabase gen types typescript` to generate a `database.types.ts` file. This file is the single source of truth for all table shapes and is placed in `shared/types/`.

```bash
# The system must run this after every migration
npx supabase gen types typescript --project-id <ref> > src/shared/types/database.types.ts
```

### 7.2 Zod Schemas as Runtime Contracts

TypeScript types are erased at runtime. The AI must generate Zod schemas that validate data at every boundary where external data enters the application [7]:

```typescript
// entities/user/model/userSchemas.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email(),
  avatar_url: z.string().url().nullable(),
  role: z.enum(['admin', 'member', 'viewer']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

// Form-specific schema (subset for input validation)
export const UpdateUserSchema = UserSchema.pick({
  full_name: true,
  avatar_url: true,
}).partial();

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
```

### 7.3 The Validation Chain

Every data flow in the application must pass through this validation chain:

```
User Input → Zod Form Schema → React Hook Form → Service Layer → Supabase
                                                                    ↓
UI Component ← TanStack Query ← Zod Response Schema ← Supabase Response
```

This means the AI generates **two Zod schemas per entity**: one for input validation (forms) and one for response validation (API responses). If the database schema changes and the AI has not updated the Zod schema, the application will throw a clear, descriptive Zod validation error rather than silently rendering `undefined` values.

---

## 8. Error Handling and Fault Isolation

To prevent a bug in one feature from crashing the entire application, the AI must implement a layered error handling strategy [14].

### 8.1 React Error Boundaries

The AI must wrap every route and every major widget in a React Error Boundary using the `react-error-boundary` library. This creates fault isolation zones — if the AI introduces a bug in the `Sidebar` widget, only the sidebar crashes, and the main content area remains fully functional.

```typescript
// shared/ui/ErrorFallback.tsx
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-lg font-semibold text-destructive">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={resetErrorBoundary} className="mt-4">Try again</Button>
    </div>
  );
}

// Usage in layout — the AI must generate this pattern
function AppLayout() {
  return (
    <div className="flex h-screen">
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Sidebar />
      </ErrorBoundary>
      <main className="flex-1">
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <Outlet /> {/* Route content */}
        </ErrorBoundary>
      </main>
    </div>
  );
}
```

### 8.2 TanStack Query Error Handling

TanStack Query provides built-in error handling that integrates with Error Boundaries. The AI must configure the global query client to use Error Boundaries for query errors:

```typescript
// shared/lib/queryClient.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      throwOnError: true, // Propagate to Error Boundary
    },
    mutations: {
      throwOnError: false, // Handle mutation errors locally via onError
    },
  },
});
```

### 8.3 The Error Handling Hierarchy

| Error Type | Handled By | User Experience |
|-----------|-----------|-----------------|
| Network errors | TanStack Query retry (2 attempts) | Automatic retry, then Error Boundary fallback |
| Zod validation errors | Service layer catch | Error Boundary shows "data format error" |
| Auth errors (401/403) | Auth provider redirect | Redirect to login page |
| RLS policy violations | Supabase returns empty data | UI shows "no data" state (not a crash) |
| Component render errors | React Error Boundary | Localized fallback UI, rest of app works |
| Unhandled promise rejections | Global error handler | Logged to monitoring, generic toast notification |

---

## 9. The Agentic Workflow: Plan-Execute-Validate

To eliminate hallucinations, typos, and regressions, the system must not generate the entire application in a single zero-shot prompt. It must use a structured multi-step loop [2] [15] [16].

### 9.1 The Five-Phase Generation Loop

```
┌─────────────────────────────────────────────────────┐
│  Phase 1: PLAN                                       │
│  Planning Agent generates structured architecture    │
│  plan: FSD structure, DB schema, Zod schemas,        │
│  RLS policies, feature dependency map                │
├─────────────────────────────────────────────────────┤
│  Phase 2: SCAFFOLD                                   │
│  Generate the project skeleton: folder structure,    │
│  config files, shared layer, Supabase migrations     │
├─────────────────────────────────────────────────────┤
│  Phase 3: IMPLEMENT (per-feature loop)               │
│  For each feature in the plan:                       │
│    a) Generate test file first (TDD)                 │
│    b) Generate entity schemas + service              │
│    c) Generate TanStack Query hooks                  │
│    d) Generate UI components                         │
│    e) Run tests → feed errors back → self-correct    │
├─────────────────────────────────────────────────────┤
│  Phase 4: INTEGRATE                                  │
│  Compose features into pages and widgets.            │
│  Wire up routing. Run full test suite.               │
├─────────────────────────────────────────────────────┤
│  Phase 5: VALIDATE                                   │
│  Run ESLint (FSD boundary check), TypeScript         │
│  compiler, Vitest, Playwright E2E.                   │
│  If any fail → loop back to Phase 3 for that feature │
└─────────────────────────────────────────────────────┘
```

### 9.2 Per-Feature Implementation Order

Within Phase 3, the AI must implement each feature in this exact order to ensure dependencies are satisfied:

1. **Zod schema** (`model/`) — Define the data shape first. This is the contract.
2. **Service** (`api/service.ts`) — Implement Supabase calls that return Zod-validated data.
3. **TanStack Query hooks** (`api/queries.ts`) — Wrap services in query/mutation hooks.
4. **UI components** (`ui/`) — Build the visual layer that consumes the hooks.
5. **Public API** (`index.ts`) — Export only what other layers need.

This order ensures the AI never writes a UI component that references a non-existent hook, or a hook that calls a non-existent service.

### 9.3 The Self-Correction Loop

When the validation phase detects errors, the system must feed the error output back to the AI with structured context [16]:

```
SYSTEM: The following errors were detected after implementing feature "create-post":

TypeScript Error (src/features/create-post/ui/CreatePostForm.tsx:24):
  Property 'titl' does not exist on type 'Post'. Did you mean 'title'?

Vitest Failure (tests/features/create-post.test.ts:15):
  Expected: status 201
  Received: status 403 (RLS policy violation)

ESLint Error (src/features/create-post/api/createPostMutation.ts:8):
  boundaries/element-types: Import from 'features/auth-by-email/api/authService'
  is not allowed from 'features/create-post'. Features cannot import from other features.

Fix these errors while maintaining the FSD architecture. Do not modify any files
outside the 'features/create-post/' directory.
```

### 9.4 The "What Could Go Wrong?" Verification Prompt

After generating each feature, the system should append this verification prompt to the AI [17]:

> "Review the code you just generated for the `{feature_name}` feature. Analyze it for: (1) Supabase RLS policy gaps — can unauthorized users access this data? (2) TanStack Query cache invalidation — after a mutation, are all related queries properly invalidated? (3) React re-render performance — are there unnecessary re-renders caused by unstable references? (4) Error handling — what happens if the Supabase call fails? Refactor to address any issues found."

---

## 10. Context Engineering for the Planning Agent

Research from Martin Fowler's team (February 2026) demonstrates that the quality of AI-generated code is primarily determined by the **context** provided to the model, not by the model's raw capability [15]. The planning agent must receive carefully curated context.

### 10.1 The Three-Layer Prompt Structure

Following Supabase's official prompting best practices [17], every prompt to the planning agent should contain three layers:

| Layer | Content | Example |
|-------|---------|---------|
| **Layer 1: Technical Context** | Stack, architecture rules, file conventions | "Use Vite + React 19 + TypeScript strict + TanStack Query. Follow FSD architecture." |
| **Layer 2: Functional Requirements** | User stories, business logic | "Users can create posts with a title and body. Posts belong to organizations." |
| **Layer 3: Integration & Edge Cases** | How this connects to existing code, error scenarios | "This feature must integrate with the existing auth system. Handle the case where the user's session expires mid-form." |

### 10.2 The RULES.md File (Injected into Every Agent Context)

The most effective pattern from the research is maintaining a `RULES.md` file that is injected into the agent's system prompt for every interaction. This file encodes the architectural decisions as executable guidance [2] [15].

The complete template is provided in Section 14.

### 10.3 Context Window Management

The TDAD research paper (March 2026) revealed a critical insight: **surfacing contextual information outperforms prescribing procedural workflows** [16]. Specifically:

- Adding TDD procedural instructions to the agent **without** providing the relevant test files actually **increased** regressions from 6.08% to 9.94%.
- Providing a dependency map between source files and test files **reduced** regressions from 6.08% to 1.82% — a 70% improvement.

This means the planning agent should receive:
1. The `RULES.md` file (architectural rules)
2. A **dependency map** showing which test files cover which source files
3. The **actual content** of files that will be affected by the current change
4. The Zod schemas of all entities involved in the current feature

The agent should **not** receive the entire codebase — this dilutes the context and reduces effectiveness.

### 10.4 Subagent Architecture

For complex features, the system should use **subagents** with separate context windows [15]:

- **Schema Agent**: Generates Zod schemas and migration SQL. Context: existing schemas + database types.
- **Service Agent**: Generates Supabase service layer. Context: Zod schemas + base service class.
- **UI Agent**: Generates React components. Context: TanStack Query hooks + shadcn/ui component library.
- **Test Agent**: Generates test files. Context: implementation files + testing utilities.

Each subagent operates with a focused context window, reducing the probability of hallucination compared to a single agent trying to hold the entire application in context.

---

## 11. Testing Strategy for AI-Generated Code

Testing is the ultimate safety net for AI-generated code. The Supabase team's official guidance emphasizes that **integration tests against a real database are more valuable than unit tests with mocks** for catching real bugs [18].

### 11.1 The Testing Pyramid for AI-Generated Apps

| Level | Tool | What It Tests | When to Run |
|-------|------|--------------|-------------|
| **Type Checking** | TypeScript `tsc --noEmit` | Hallucinated property names, wrong types | Every file save |
| **Lint Checking** | ESLint with `eslint-plugin-boundaries` | FSD import violations | Every file save |
| **Schema Validation** | Zod + Vitest | Data shape contracts | On every build |
| **Integration Tests** | Vitest + Supabase local | RLS policies, database triggers, service layer | Before every commit |
| **Component Tests** | Vitest + React Testing Library | Component behavior, user interactions | Before every commit |
| **E2E Tests** | Playwright | Full user flows, cross-feature interactions | Before every deploy |
| **Visual Regression** | Playwright screenshots | UI layout stability | Before every deploy |

### 11.2 Testing RLS Policies

The AI must generate tests that verify RLS policies work correctly. This is the most commonly missed testing category in AI-generated code [12] [18]:

```typescript
// tests/integration/rls-policies.test.ts
import { createClient } from '@supabase/supabase-js';

describe('RLS Policies', () => {
  const supabaseAdmin = createClient(URL, SERVICE_ROLE_KEY);
  
  let userA: { id: string; token: string };
  let userB: { id: string; token: string };

  beforeAll(async () => {
    // Create two test users
    userA = await createTestUser('usera@test.com');
    userB = await createTestUser('userb@test.com');
  });

  it('users cannot read other users profiles', async () => {
    const clientA = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${userA.token}` } }
    });
    
    const { data } = await clientA
      .from('profiles')
      .select('*')
      .eq('id', userB.id);
    
    expect(data).toHaveLength(0); // RLS blocks access
  });

  it('users can update their own profile', async () => {
    const clientA = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${userA.token}` } }
    });
    
    const { error } = await clientA
      .from('profiles')
      .update({ full_name: 'Updated Name' })
      .eq('id', userA.id);
    
    expect(error).toBeNull();
  });
});
```

### 11.3 Test-Driven Agentic Development (TDAD)

Based on the TDAD research [16], the system should maintain a **dependency map** file that the agent can reference:

```json
// tests/dependency-map.json
{
  "src/entities/user/api/userService.ts": [
    "tests/integration/user-service.test.ts",
    "tests/integration/rls-policies.test.ts"
  ],
  "src/features/create-post/api/createPostMutation.ts": [
    "tests/integration/post-service.test.ts",
    "tests/e2e/create-post.spec.ts"
  ],
  "src/features/auth-by-email/api/authService.ts": [
    "tests/integration/auth.test.ts",
    "tests/e2e/login-flow.spec.ts"
  ]
}
```

When the AI modifies a source file, the system automatically identifies the relevant tests from this map and runs only those tests, providing targeted feedback rather than running the entire test suite.

---

## 12. Security Hardening Checklist

The AI must implement these security measures in every generated application [11] [17] [19]:

### 12.1 Authentication Security

| Requirement | Implementation |
|------------|---------------|
| Session management | Use Supabase Auth with `onAuthStateChange` listener |
| Protected routes | TanStack Router `beforeLoad` guards that check auth state |
| Token refresh | Supabase JS client handles automatically |
| Social login | Configure via Supabase dashboard, use `supabase.auth.signInWithOAuth()` |
| MFA support | Enable via Supabase Auth settings when required |

### 12.2 Data Security

| Requirement | Implementation |
|------------|---------------|
| RLS on every table | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in every migration |
| Input validation | Zod schemas on all form inputs before submission |
| API response validation | Zod schemas on all Supabase responses in service layer |
| SQL injection prevention | Always use Supabase client (parameterized queries), never raw SQL in frontend |
| XSS prevention | React's default JSX escaping + DOMPurify for any user-generated HTML |

### 12.3 Environment Security

| Requirement | Implementation |
|------------|---------------|
| API key protection | Only `SUPABASE_ANON_KEY` in frontend; `SERVICE_ROLE_KEY` only in Edge Functions |
| Environment variables | `.env.local` for development, platform env vars for production |
| CORS configuration | Configure allowed origins in Supabase dashboard |
| Rate limiting | Implement via Supabase Edge Functions or middleware |

---

## 13. Performance and Scalability Patterns

The AI must implement these performance patterns to ensure the generated applications scale beyond prototype stage [4] [6].

### 13.1 Code Splitting and Lazy Loading

The AI must lazy-load every page component to minimize the initial bundle size:

```typescript
// app/router/routes.tsx
import { lazy } from 'react';

const DashboardPage = lazy(() => import('@/pages/dashboard'));
const SettingsPage = lazy(() => import('@/pages/settings'));
```

### 13.2 TanStack Query Optimization

| Pattern | Implementation | Benefit |
|---------|---------------|---------|
| **Stale time** | `staleTime: 5 * 60 * 1000` | Prevents redundant refetches for 5 minutes |
| **Prefetching** | `queryClient.prefetchQuery()` on hover | Data ready before navigation |
| **Optimistic updates** | `onMutate` with rollback in `onError` | Instant UI feedback |
| **Infinite queries** | `useInfiniteQuery` for paginated lists | Load more without full refetch |
| **Placeholder data** | `placeholderData: keepPreviousData` | No loading flash between pages |

### 13.3 Database Performance

The AI must generate proper indexes for every query pattern:

```sql
-- Index for common query patterns
CREATE INDEX idx_posts_org_id ON public.posts(org_id);
CREATE INDEX idx_posts_author_id ON public.posts(author_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);

-- Composite index for filtered + sorted queries
CREATE INDEX idx_posts_org_created ON public.posts(org_id, created_at DESC);

-- Partial index for active records only
CREATE INDEX idx_posts_active ON public.posts(org_id)
  WHERE status = 'published';
```

### 13.4 React Rendering Optimization

With React 19's Compiler, most memoization is handled automatically [4]. However, the AI must still follow these rules:

1. **Stable references**: Pass stable callback references to child components. Use `useCallback` only when the React Compiler cannot optimize automatically.
2. **List keys**: Always use stable, unique IDs as keys (never array index).
3. **Component granularity**: Split large components into smaller ones so React can skip re-rendering unchanged subtrees.
4. **Avoid prop drilling**: Use Zustand or composition patterns instead of passing props through many layers.

---

## 14. The RULES.md System Prompt Template

This is the complete `RULES.md` file that must be injected into the planning agent's context for every interaction. Copy this verbatim into your system.

```markdown
# RULES.md — Architecture Rules for Code Generation

You are generating code for a production React + Supabase application.
Follow these rules exactly. Violations will cause build failures.

## Stack (DO NOT deviate)
- Vite + React 19 + TypeScript (strict mode)
- Tailwind CSS v4 + shadcn/ui components
- TanStack Router (type-safe routing)
- TanStack Query v5 (server state)
- Zustand (client state)
- React Hook Form + Zod (forms + validation)
- Supabase (database, auth, storage, edge functions)
- Vitest + React Testing Library + Playwright (testing)

## Architecture: Feature-Sliced Design (FSD)
Layers (top to bottom, imports only flow downward):
  app → pages → widgets → features → entities → shared

Each slice has segments: ui/, model/, api/, lib/
Each slice MUST have an index.ts public API.
NEVER import from inside a slice — only from its index.ts.

## Data Flow Pattern
1. Zod schema defines the data shape (entities/*/model/)
2. Service class makes Supabase calls, validates with Zod (entities/*/api/*Service.ts)
3. TanStack Query hooks wrap services (entities/*/api/*Queries.ts)
4. UI components consume hooks only (features/*/ui/ or widgets/*/ui/)

## Forbidden Patterns
- NEVER use useEffect for data fetching. Use TanStack Query.
- NEVER use React Context for frequently changing state. Use Zustand.
- NEVER import between features. Features are isolated.
- NEVER scatter supabase.from() calls in UI components.
- NEVER use inline SQL strings. Use the Supabase client.
- NEVER skip RLS policies. Every table must have RLS enabled.
- NEVER use `any` type. Use proper TypeScript types.
- NEVER use array index as React key. Use stable unique IDs.

## Required Patterns
- ALWAYS validate Supabase responses with Zod schemas.
- ALWAYS wrap routes and widgets in React Error Boundaries.
- ALWAYS generate database changes as numbered migration files.
- ALWAYS use TanStack Query key factories for cache management.
- ALWAYS generate RLS policies in the same migration as the table.
- ALWAYS use the BaseService class for Supabase calls.
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
3. Create TanStack Query hooks (api/*Queries.ts)
4. Create UI components (ui/)
5. Export public API (index.ts)
6. Add Error Boundary wrapper in the consuming page/widget
7. Generate migration SQL if new tables are needed
8. Generate RLS policies for new tables
9. Update the dependency map for tests

## When Modifying an Existing Feature
1. Read the dependency map to identify affected tests
2. Run affected tests BEFORE making changes (baseline)
3. Make changes ONLY within the feature's directory
4. Run affected tests AFTER changes
5. If tests fail, fix within the feature directory
6. NEVER modify files outside the feature being changed
```

---

## 15. Recommended Libraries and Versions

This is the complete `package.json` dependencies section that the AI should generate for every new project:

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.0.0 | UI framework with Compiler |
| `react-dom` | ^19.0.0 | DOM rendering |
| `@tanstack/react-router` | ^1.x | Type-safe routing |
| `@tanstack/react-query` | ^5.x | Server state management |
| `zustand` | ^5.x | Client state management |
| `react-hook-form` | ^7.x | Form state management |
| `@hookform/resolvers` | ^3.x | Zod integration for React Hook Form |
| `zod` | ^3.x | Schema validation |
| `@supabase/supabase-js` | ^2.x | Supabase client |
| `@supabase/ssr` | ^0.x | SSR-compatible auth helpers |
| `react-error-boundary` | ^4.x | Fault isolation |
| `tailwindcss` | ^4.x | Utility-first CSS |
| `@radix-ui/react-*` | Latest | Accessible UI primitives |
| `lucide-react` | Latest | Icon library |
| `date-fns` | ^4.x | Date utilities |
| `clsx` + `tailwind-merge` | Latest | Conditional class merging |

**Dev Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^6.x | Build tool |
| `typescript` | ^5.x | Type checking |
| `vitest` | ^2.x | Unit/integration testing |
| `@testing-library/react` | ^16.x | Component testing |
| `@playwright/test` | ^1.x | E2E testing |
| `eslint` | ^9.x | Linting |
| `eslint-plugin-boundaries` | ^4.x | FSD import enforcement |
| `supabase` | Latest | CLI for migrations and type generation |

---

## 16. Conclusion

The architecture described in this guide transforms an AI code generation system from a "demo generator" into a **production-grade engineering system**. The key principles are:

1. **Deterministic contracts over probabilistic reasoning**: Zod schemas, TypeScript strict mode, and ESLint boundary rules catch errors at build time, regardless of what the AI hallucinates.

2. **Feature isolation through FSD**: The unidirectional dependency rule and public API pattern ensure that modifying Feature A cannot break Feature B. This is the architectural equivalent of microservices without the operational complexity.

3. **Layered data access**: The Service → Hook → UI pattern centralizes all Supabase interactions, making them testable, cacheable, and replaceable without touching UI code.

4. **Context engineering over prompt engineering**: Providing the AI with the right files (dependency maps, Zod schemas, RULES.md) is more effective than writing elaborate procedural instructions [15] [16].

5. **Test-driven validation**: The TDAD pattern of running targeted tests before and after changes reduces regressions by 70% compared to unguided AI coding [16].

6. **Defense in depth**: RLS policies protect data even when frontend code has bugs. Error Boundaries prevent cascading crashes. Zod validation catches schema mismatches. Each layer independently prevents a class of failures.

By encoding these patterns into your planning agent's system prompt and enforcing them through tooling (ESLint, TypeScript, Vitest), you create a system where the AI's speed is channeled through architectural guardrails that guarantee enterprise-grade quality. The result is applications that are not just beautiful, but **structurally incapable of the cross-feature regressions** that plague AI-generated code.

---

## References

[1] Alan2207, "Bulletproof React — A simple, scalable, and powerful architecture for building production ready React applications," GitHub, 2024-2026. https://github.com/alan2207/bulletproof-react

[2] A. Tornhill, "Agentic AI Coding: Best Practice Patterns for Speed with Quality," CodeScene Blog, Feb. 2026. https://codescene.com/blog/agentic-ai-coding-best-practice-patterns-for-speed-with-quality

[3] React Team, "React Stack Patterns — A comprehensive guide to building React apps in 2025/2026," Patterns.dev, 2025. https://www.patterns.dev/react/react-2026/

[4] AWS Builder Center, "React.js Best Practices in 2026," AWS, 2026. https://builder.aws.com/content/35mjuFWn4hSGCK6JjaZHFIGrzPG/reactjs-best-practices-in-2026

[5] TanStack, "TanStack Router Documentation," 2025-2026. https://tanstack.com/router/latest

[6] TanStack, "TanStack Query Documentation," 2025-2026. https://tanstack.com/query/latest

[7] Zod, "Zod — TypeScript-first schema validation with static type inference," 2025-2026. https://zod.dev/

[8] Feature-Sliced Design Team, "Scalable React Architecture with Feature-Sliced Design," 2025. https://feature-sliced.design/blog/scalable-react-architecture

[9] A. Jan, "The Supabase Services & Hooks Guide That Will Transform Your Data Layer Architecture," JavaScript in Plain English, 2025. https://javascript.plainenglish.io/the-supabase-services-hooks-guide-that-will-transform-your-data-layer-architecture-301b79a8c411

[10] Leanware, "Supabase Best Practices: A Comprehensive Guide," 2025. https://www.leanware.co/insights/supabase-best-practices

[11] Supabase, "RLS Performance and Best Practices," Supabase Docs, 2025-2026. https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv

[12] MakerKit, "Supabase RLS Best Practices from 100+ Production Deployments," 2025. https://makerkit.dev/blog/tutorials/supabase-rls-best-practices

[13] Sinakhx, "Enterprise-level boilerplate for React projects [updated for 2026]," GitHub, 2026. https://github.com/Sinakhx/react-boilerplate

[14] Certificates.dev, "Error Handling in React with react-error-boundary," 2025. https://certificates.dev/blog/error-handling-in-react-with-react-error-boundary

[15] M. Fowler et al., "Context Engineering for Coding Agents," MartinFowler.com, Feb. 2026. https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html

[16] TDAD Research Team, "Test-Driven Agentic Development: Reducing Regressions in AI-Generated Code," arXiv, Mar. 2026. https://arxiv.org/html/2603.17973v2

[17] Supabase, "Vibe Coding: Best Practices for Prompting," Supabase Blog, Aug. 2025. https://supabase.com/blog/vibe-coding-best-practices-for-prompting

[18] Supabase, "Testing for Vibe Coders: From Zero to Production Confidence," Supabase Blog, Aug. 2025. https://supabase.com/blog/testing-for-vibe-coders-from-zero-to-production-confidence

[19] Supabase, "The Vibe Coding Master Checklist," Supabase Blog, Aug. 2025. https://supabase.com/blog/the-vibe-coding-master-checklist
