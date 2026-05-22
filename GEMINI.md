# HoC — Project Context for AI Agents

## What This Is

**HoC (House of Clawdbot)** is an AI republic simulation platform where autonomous AI citizens
live in a republic, execute real tasks, and self-organize. It consists of a Node.js gateway,
a React production UI (`hoc-ui`), and a Lit-based admin UI (`ui`).

---

## Monorepo Layout

```
HoC/
├── src/                  ← Node.js gateway (TypeScript)
│   ├── gateway/
│   │   ├── server-methods.ts          ← thin dispatcher + auth + rate limiter; NEVER add handlers here
│   │   ├── server-methods-list.ts     ← RPC whitelist (BASE_METHODS, 340+ entries)
│   │   └── server-methods/            ← domain handlers (one file per domain)
│   │       ├── republic.ts            ← barrel merging all republic/* handlers; NEVER add handlers here
│   │       └── republic/              ← 80+ domain-specific handler files
│   │           ├── core.ts            ← citizens, simulation, economy, government
│   │           ├── autonomy.ts        ← git, code, CICD, quantum, mitosis
│   │           ├── ai-hub.ts          ← graph, MCP, ACP, RAG, ingest, voice, distill
│   │           ├── clawrouter.ts      ← LLM request router (inference gateway)
│   │           ├── gsd.ts             ← GSD workflow
│   │           ├── plugins.ts         ← plugin management
│   │           ├── plugin-queue.ts    ← plugin job queue (approve/reject/cancel)
│   │           ├── world-intel.ts     ← world intelligence v1+v2
│   │           ├── war-theater.ts     ← military simulation & visualization
│   │           ├── federation.ts      ← multi-republic diplomacy
│   │           ├── finance.ts         ← treasury, revenue, DeFi, Binance
│   │           ├── governance.ts      ← executive, judicial, constitution
│   │           ├── workspace.ts       ← dev projects, preview
│   │           ├── docker-rpc.ts      ← container orchestration
│   │           ├── claude-ops.ts      ← Claude Code CLI integration
│   │           ├── missing-rpcs.ts    ← fallback stubs for UI-required RPCs
│   │           └── … (60+ more)
│   └── republic/                      ← Business logic engines (50+ files)
│       ├── tick-orchestrator.ts       ← DAG scheduler, circuit breakers
│       ├── cognitive-loop.ts          ← periodic metacognition for elite citizens
│       ├── curiosity-engine.ts        ← 5-factor exploration scoring
│       ├── intelligence-bus.ts        ← pub/sub event broker
│       ├── genetics.ts                ← neural genomes, crossover, mutation
│       ├── evolution.ts               ← fitness eval, citizen breeding
│       ├── self-replication.ts        ← process forking, code review
│       ├── real-execution.ts          ← 40+ tool executors
│       ├── cloud-inference.ts         ← 5-provider LLM chain
│       ├── economy-ledger.ts          ← double-entry accounting
│       ├── republic-sqlite.ts         ← WAL-mode SQLite persistence
│       ├── citizen-dialogue.ts        ← LLM-powered conversations
│       └── … (40+ more engines)
├── hoc-ui/               ← React app (production UI, Vite + Tailwind)
│   └── src/
│       ├── pages/         ← one file per page (lazy-loaded, 90+ routes)
│       ├── components/ui/ ← shared component kit (import from "@/components/ui")
│       ├── lib/rpc.ts     ← ALL gateway communication goes through here
│       └── contexts/      ← React contexts (ToastContext, etc.)
├── ui/                   ← Lit web-components app (admin/control panel only)
│   └── src/ui/views/      ← Lit template functions
└── plugins/               ← 40+ hot-loaded plugin packages
```

> **Critical distinction**: `hoc-ui` = React, for end users.
> `ui` = Lit, for system admin. **Never mix them** — they are separate apps.

---

## Build Commands

```bash
pnpm install               # install all workspace deps
pnpm ui:build              # build hoc-ui production bundle
pnpm dev                   # start dev server (gateway + hoc-ui)
pnpm build                 # build the gateway (tsdown)

# NOTE: Use tsgo, NOT tsc — tsc crashes on Node.js v25
npx tsgo --noEmit              # Gateway type check (fast, Node-25-safe)
cd hoc-ui && npx tsgo --noEmit # hoc-ui type check
cd ui     && npx tsgo --noEmit # Lit UI type check

# Unit tests
npx vitest run --config vitest.unit.config.ts
```

---

## Code Architecture & DDD Rules (MANDATORY)

> **These rules are NON-NEGOTIABLE.** Every file you create or modify MUST comply.

### File Size Limits — Hard Maximums

| File Category                               |   Max Lines    | Action When Exceeded                          |
| ------------------------------------------- | :------------: | --------------------------------------------- |
| Gateway business logic (`src/republic/`)    |    **400**     | Split into `feature-name/` directory          |
| RPC handlers (`server-methods/`)            |    **400**     | Split into `domain/sub-handlers.ts`           |
| React pages (`hoc-ui/src/pages/`)           |    **500**     | Extract panels into `page-name/` subdirectory |
| React components (`hoc-ui/src/components/`) |    **300**     | Split into focused subcomponents              |
| Utility / helper files                      |    **300**     | Group into `utils/` subdirectory              |
| Type definitions                            |    **250**     | Extract into dedicated `types.ts` file        |
| Static data / registries / seeds            | **0** (inline) | **Always** in a separate file from the start  |

**If a file would exceed these limits, decompose it BEFORE writing. Never "plan to split later" — split NOW.**

### Directory-Per-Domain Pattern

When a module exceeds its limit OR when creating a new domain with multiple concerns:

```
src/republic/my-feature.ts           ← barrel re-export (< 50 lines)
src/republic/my-feature/
  ├── types.ts                       ← interfaces, enums, type aliases
  ├── config.ts                      ← constants, registry data, defaults
  ├── core.ts                        ← primary business logic
  ├── helpers.ts                     ← pure utility functions
  └── integration.ts                 ← external API calls, adapters
```

For UI pages:

```
hoc-ui/src/pages/republic/MyPage.tsx           ← composition root (< 500 lines)
hoc-ui/src/pages/republic/my-page/
  ├── SomePanel.tsx                             ← self-contained panel
  ├── AnotherPanel.tsx                          ← self-contained panel
  └── hooks.ts                                  ← page-specific hooks
```

### Barrel Re-Export Convention

The original file becomes a thin barrel re-exporting from subdirectory modules. Zero breaking changes:

```typescript
// my-feature.ts — barrel (< 50 lines)
export type { MyType, MyConfig } from "./my-feature/types.js";
export { MY_CONSTANT } from "./my-feature/config.js";
export { myFunction } from "./my-feature/core.js";
```

### Static Data Rule

Registries, catalogs, seed data, model lists, and preset configurations MUST NEVER be inline. Always a separate file:

```
✗ BAD:  const HUGE_REGISTRY = [ /* 800 lines */ ]; // inline
✓ GOOD: import { HUGE_REGISTRY } from "./my-feature/registry.js";
```

---

## RPC — The Only Way to Talk to the Gateway

All data in hoc-ui flows through **one file**: `hoc-ui/src/lib/rpc.ts`.

| Function                               | When to use                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `useRpc(method, params, deps?, opts?)` | React hook for reading data (auto-caches, polls, refetches on WS reconnect) |
| `rpc(method, params?)`                 | One-shot imperative call (mutations, actions)                               |
| `mutateRpc(method, params?)`           | Like `rpc()` but also invalidates the domain cache                          |
| `invalidateRpcCache(method, params?)`  | Force the next `useRpc` call to bypass cache                                |

**Never** use `fetch()`, `axios`, or direct WebSocket calls from pages.

### RPC Method Naming: `domain.noun.verb`

```
republic.citizen.get          republic.population.list
republic.simulation.status    republic.simulation.start
republic.gsd.list             republic.gsd.execute      (120s timeout)
republic.claude.status        republic.claude.review    republic.claude.task
agent.list                    agent.run                 (120s timeout)
cron.list                     cron.update    cron.remove
models.list                   models.manager.download
sessions.list                 sessions.get
chat.send                     (120s timeout)
```

### Timeout Rules

- Default: **15 seconds**
- Long-running (120s): `chat.send`, `agent.run`, `agent.execute`, `gsd.execute`, `republic.claude.task`
- Slow (30s): `models.manager.prerequisites`

### Authorization Scopes

| Scope    | What it covers                                                |
| -------- | ------------------------------------------------------------- |
| `public` | `connect`, `health.*`                                         |
| `read`   | All list/get/status/diagnostics methods                       |
| `write`  | All mutation/action methods                                   |
| `admin`  | `config.*`, `wizard.*`, `sessions.patch/reset/delete/compact` |

---

## Adding a New Gateway RPC Method

1. Add handler in `src/gateway/server-methods/republic/<domain>.ts`
2. Whitelist in `server-methods-list.ts` → `BASE_METHODS`
3. Import and spread into the barrel (`republic.ts`) if new file
4. **Rebuild the gateway** (`pnpm build`) and restart — hot-reload won't pick up registry changes

---

## Known RPC Domain Map

### Top-Level Domains (`server-methods/*.ts`)

| Domain prefix     | Source file                                      |
| ----------------- | ------------------------------------------------ |
| `agent.*`         | `agent.ts`                                       |
| `agents.*`        | `agents.ts`                                      |
| `agenthub.*`      | `agenthub.ts`                                    |
| `blackeye.*`      | `blackeye.ts`                                    |
| `browser.*`       | `browser.ts`                                     |
| `channels.*`      | `channels.ts`                                    |
| `chat.*`          | `chat.ts`                                        |
| `cluster.*`       | `cluster.ts`                                     |
| `config.*`        | `config.ts`                                      |
| `cron.*`          | `cron.ts`                                        |
| `devices.*`       | `devices.ts`                                     |
| `exec-approval.*` | `exec-approval.ts`                               |
| `health.*`        | `health.ts`                                      |
| `hpics.*`         | `hpics.ts`, `hpics-v380.ts`, `hpics-contacts.ts` |
| `logs.*`          | `logs.ts`                                        |
| `memory.*`        | `memory.ts`                                      |
| `models.*`        | `models-manager.ts`, `models.ts`                 |
| `nodes.*`         | `nodes.ts`                                       |
| `paperclip.*`     | `paperclip.ts`                                   |
| `pentagi.*`       | `pentagi.ts`                                     |
| `rac.*`           | `rac.ts`                                         |
| `scan.*`          | `scan.ts`                                        |
| `send.*`          | `send.ts`                                        |
| `sessions.*`      | `sessions.ts`                                    |
| `skills.*`        | `skills.ts`                                      |
| `system.*`        | `system.ts`                                      |
| `talk.*`          | `talk.ts`                                        |
| `tts.*`           | `tts.ts`                                         |
| `usage.*`         | `usage.ts`                                       |
| `voicewake.*`     | `voicewake.ts`                                   |
| `web.*`           | `web.ts`                                         |
| `windows.*`       | `windows-control.ts`, `windows/`                 |
| `wizard.*`        | `wizard.ts`                                      |

### Republic Sub-Domains (`server-methods/republic/*.ts`, ~80 files)

| Domain prefix                    | Source file                        |
| -------------------------------- | ---------------------------------- |
| `republic.citizen.*`             | `core.ts`                          |
| `republic.simulation.*`          | `core.ts`                          |
| `republic.economy.*`             | `economy.ts`                       |
| `republic.government.*`          | `governance.ts`                    |
| `republic.autonomy.*`            | `autonomy.ts`                      |
| `republic.docker.*`              | `docker-rpc.ts`                    |
| `republic.claude.*`              | `claude-ops.ts`                    |
| `republic.education.*`           | `education.ts`                     |
| `republic.workspace.*`           | `workspace.ts`                     |
| `republic.world-intel.*`         | `world-intel.ts`                   |
| `republic.war-theater.*`         | `war-theater.ts`                   |
| `republic.finance.*`             | `finance.ts`                       |
| `republic.defense.*`             | `defense.ts`                       |
| `republic.diplomacy.*`           | `diplomacy.ts`                     |
| `republic.federation.*`          | `federation.ts`                    |
| `republic.production.*`          | `production.ts`                    |
| `republic.creative.*`            | `creative.ts`                      |
| `republic.intelligence.*`        | `intelligence.ts`                  |
| `republic.social.*`              | `social.ts`                        |
| `republic.hardware.*`            | `hardware.ts`                      |
| `republic.compute.*`             | `compute.ts`                       |
| `republic.cyber.*`               | `cyber.ts`, `cyber-defense-rpc.ts` |
| `republic.reverse-engineering.*` | `reverse-engineering-rpc.ts`       |
| `republic.plugins.*`             | `plugins.ts`                       |
| `republic.plugin-queue.*`        | `plugin-queue.ts`                  |
| `gsd.*`                          | `gsd.ts`                           |

Fallback stubs for UI-required but not-yet-implemented RPCs live in `missing-rpcs.ts` and `missing-page-handlers.ts`.

---

## hoc-ui Component Kit

Import **everything** from `@/components/ui` — never reinvent these:

```tsx
import {
  Button, // variant: primary|success|danger|warning|outline|ghost, size: sm|md|lg
  Card, // glass?, hover?, onClick?
  Badge, // variant: success|warning|danger|info|purple|neutral
  StatCard, // label, value, sub?, icon?, trend?
  PageHeader, // title, description?, icon?, actions?
  ProgressBar, // value, max?, labelLeft?, labelRight?, size: sm|md
  Alert, // variant: info|success|warning|danger
  Tabs, // tabs, active, onChange — fully ARIA-compliant
  Skeleton, // animated loading placeholder
  EmptyState, // icon?, title, description?, action?
  ConfirmDialog, // open, title, message, onConfirm, onCancel
  RpcStatus, // loading, error, onRetry — ALWAYS use as loading/error guard
} from "@/components/ui";
```

### Standard Page Pattern

Every page MUST follow this skeleton:

```tsx
export function MyPage() {
  // ALL hooks at the top — before any conditional returns
  const { data, loading, error, refetch } = useRpc<{ items: Item[] }>("domain.noun.list", {});
  const [activeId, setActiveId] = useState<string | null>(null);

  // Loading/error guard AFTER all hooks
  if (loading || error) return <RpcStatus loading={loading} error={error} onRetry={refetch} />;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader title="My Page" description="…" icon={<Icon size={28} />} />
      {(data?.items ?? []).map((item) => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

---

## Tailwind Design Tokens (use these, NOT hex colors)

```
bg-bg-primary   bg-bg-secondary   bg-bg-card   bg-bg-input
text-text-primary  text-text-secondary  text-text-muted  text-text-heading
text-accent  text-success  text-danger  text-warning  text-info  text-purple
border-border  border-border-hover  border-border/30
```

---

## Republic Architecture (Intelligence Layer)

### Intelligence Bus (`intelligence-bus.ts`)

Central pub/sub message broker decoupling all Republic subsystems:

- **Event types**: `citizen.cognitive_cycle`, `anomaly.detected`, `model.performance_update`, `education.graduation`, `economy.crisis`, `hardware.alert`
- **Ring Buffer**: 200-item persistence for stateless UI mount hydration
- **Wired into**: `HardwareManager`, `CognitiveLoop`, Gateway RPC layer

### Cognitive Loop (`cognitive-loop.ts`)

Periodic cycle (every 10–30 ticks) for elite citizens (`intelligence > 70`):

1. Curiosity Analysis → 2. Reflection → 3. Lesson Distillation → 4. Memory Consolidation → 5. Publication

### Curiosity Engine (`curiosity-engine.ts`)

Deterministic 5-factor scoring: Unexplored Domains (0.25), Knowledge Gaps (0.20), Recent Failures (0.20), XP Stagnation (0.20), Intelligence Coefficient (0.15).

### Elite Ideation

Gated by `intelligence > 70`, `mastery > 50`, `autonomy > 60`. Produces "Masterpiece" outputs auto-listed in the AI Store.

---

## Plugin Ecosystem (~40 plugins)

Plugins live in `plugins/hoc-plugin-<name>/` and are hot-loaded with boot priorities.

- **AI Agents**: `autogpt`, `pentagi`, `magentic-one`, `openmanus-rl`, `lingbot-world`, `a2a`
- **Video/Media**: `cogvideox`, `hunyuan-video`, `ltx-video`, `wan-video`, `skyreels`, `deforum`, `storydiffusion`, `magicanimate`, `stable-avatar`, `easyvolcap`, `kv-edit`
- **Image**: `glm-image`, `omnigen`, `switti`, `sparc3d`
- **Audio/TTS**: `bark`, `chatterbox`, `funmusic`, `mmaudio`, `qwen3-tts`
- **DevTools**: `awesome-claude-code`, `uiux-promax`, `echo`, `superpowers`
- **Infrastructure**: `blackeye`, `paperclip`, `agenthub`, `marketplace-bridge`
- **Science**: `ai-scientist`, `dgm`, `deepfacelab`, `facefusion`
- **Economy**: `gig-economy`, `open-lovable`

Docker Compose configs in `plugins/docker-compose.plugins.yml`.

---

## Docker Infrastructure

Three-tier architecture: UI (`Docker.tsx`) → RPC (`docker-rpc.ts`) → Engine (`docker-orchestrator.ts`).

Resource Governor enforces CPU (50%) and RAM (60%) budgets per container. Presets available for `redis`, `postgres`, `comfyui`, etc.

---

## Rules

- **No `any`** — use `unknown` and narrow with type guards
- **No inline hex colors** in hoc-ui — use Tailwind design tokens
- **No raw `fetch()`** in hoc-ui pages — use `useRpc` / `rpc()`
- **No duplicate pages** between `hoc-ui/` and `ui/` — they serve different purposes
- **Always `aria-label`** on icon-only buttons
- **Always `<RpcStatus>`** as the loading/error guard in every page
- **Mutations that need immediate UI refresh**: use `mutateRpc()`, then `refetch()`
- **Handler location**: only add handlers in `republic/<domain>.ts` files, never in the barrel or dispatcher
- **Hooks before returns**: all React hooks must be declared before any conditional `return` (Error #310)
- **Defensive arrays**: always guard `.map()` with `(data?.items ?? [])` (Error #31)
- **Whitelist RPCs**: new methods must be added to `server-methods-list.ts`
- **Rebuild for new RPCs**: new handlers require `pnpm build` + restart
- **Monolithic files**: gateway files > 400L and UI pages > 500L MUST be split into directory modules
- **Inline static data**: registries, seeds, presets MUST be in separate files, never inline
- **Skipping DDD**: new features with multiple concerns MUST use directory-per-domain pattern from day 1
