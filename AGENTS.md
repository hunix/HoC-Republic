# HoC — Agent Guidelines

> All rules below are specific to the **HoC** (House of Clawdbot) repository.
> Last verified: 2026-03-18

---

## Project Identity

- **Repo**: `HoC` — an AI republic simulation platform
- **Gateway**: Node.js/TypeScript, runs at localhost:3000 (or configured port)
- **React UI**: `hoc-ui/` — Vite + React + Tailwind, served separately (production UI)
- **Lit UI**: `ui/` — admin/control panel only, not user-facing
- **Plugins**: `plugins/` — 40+ hot-loaded Node.js packages with boot priorities
- **Republic engines**: `src/republic/` — 50+ business-logic modules (tick orchestrator, genetics, evolution, economy, governance, etc.)

---

## Build & Verify Commands

```bash
pnpm install                     # install all workspace deps
pnpm dev                         # start gateway + hoc-ui dev server
pnpm ui:build                    # production build of hoc-ui
pnpm build                       # build the gateway (tsdown)

# Type checks (always run before finishing a task):
# NOTE: `npx tsc --noEmit` CRASHES on Node.js v25 due to a CJS/using-keyword
# incompatibility in TypeScript 5.9.x. Use tsgo (native TS, already installed):
npx tsgo --noEmit                # gateway type check (fast, Node-25-safe)
cd hoc-ui && npx tsgo --noEmit  # hoc-ui type check
cd ui && npx tsgo --noEmit      # Lit control UI type check

# Run gateway server-methods tests:
npx vitest run --config vitest.unit.config.ts
```

---

## Code Architecture & DDD Rules (MANDATORY)

> **These rules are NON-NEGOTIABLE.** Every file you create or modify MUST comply.
> Failure to follow these rules produces the exact monolithic sprawl we've spent weeks fixing.

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

**If you are about to create or modify a file that would exceed these limits, you MUST decompose it BEFORE writing. Never "plan to split later" — split NOW.**

### Directory-Per-Domain Pattern (DDD)

When a module exceeds its limit OR when creating a new domain with multiple concerns, use this structure:

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

When splitting a module into a directory, the original file becomes a **thin barrel** that re-exports everything. This ensures **zero breaking changes** — all existing imports continue working:

```typescript
// my-feature.ts — barrel (< 50 lines)
export type { MyType, MyConfig } from "./my-feature/types.js";
export { MY_CONSTANT, DEFAULT_CONFIG } from "./my-feature/config.js";
export { myFunction, MyClass } from "./my-feature/core.js";
```

### Static Data Rule

Large static arrays, registries, catalogs, seed data, model lists, and preset configurations MUST NEVER be defined inline in the module that consumes them. Always place them in a dedicated file:

```
✗ BAD:  const HUGE_REGISTRY = [ /* 800 lines of data */ ]; // inline in business logic
✓ GOOD: import { HUGE_REGISTRY } from "./my-feature/registry.js"; // separate file
```

### New Feature Checklist

Before writing any new Republic engine or UI page, answer these:

- [ ] Will any single file exceed the line limit? → Split from the start
- [ ] Does it have > 3 type definitions? → Create `types.ts`
- [ ] Does it have > 50 lines of constants/config? → Create `config.ts`
- [ ] Does it have static data arrays > 20 items? → Create `data.ts` or `registry.ts`
- [ ] Does the UI page have > 2 distinct panels/sections? → Extract into subcomponents

---

## Gateway Architecture

```
Request → server-methods.ts (dispatcher, never modify)
             ↓
         server-methods/<domain>.ts  (barrel, never modify)
             ↓
         server-methods/<domain>/<file>.ts  (add handlers HERE)
```

### Handler Signature

```typescript
// In e.g. src/gateway/server-methods/republic/myfeature.ts
export const myFeatureHandlers: GatewayRequestHandlers = {
  "republic.myfeature.list": async (params: unknown, ctx: RequestContext) => {
    const { limit = 50 } = params as { limit?: number };
    return { ok: true, items: [] };
  },
};
```

Handler conventions:

- Always return `{ ok: true, ...data }` on success
- Always throw `new Error("message")` on failure (gateway wraps it)
- Validate `params` inline (no Zod in handlers — keep it simple)
- Never import from `hoc-ui/` — gateway and UI are separate packages

### Authorization & Whitelisting

Methods must be whitelisted in `src/gateway/server-methods-list.ts` (`BASE_METHODS`, currently 340+ entries) AND have a handler in the corresponding domain file. The "Ghost Method" hazard occurs when a method is authorized but missing from the handler aggregate — the protocol layer won't error, but the request returns `unknown method` silently.

---

## RPC from hoc-ui

All gateway calls flow through `hoc-ui/src/lib/rpc.ts`.

```typescript
// READ (React component)
const { data, loading, error, refetch } = useRpc<{ items: Item[] }>(
  "domain.noun.list",
  { limit: 50 },
  [dep1, dep2], // extra deps that trigger refetch
  { staleTimeMs: 5000, refetchIntervalMs: 10000 }, // optional
);

// WRITE (event handler)
await rpc("domain.noun.create", { name: "foo" });
refetch(); // or invalidateRpcCache("domain.noun.list")

// WRITE + auto-invalidate domain cache
await mutateRpc("domain.noun.delete", { id });
```

**Never** use `fetch()`, raw WebSocket, or Axios in hoc-ui pages.

---

## hoc-ui Page Checklist

When creating or modifying a hoc-ui page:

- [ ] File lives in `hoc-ui/src/pages/` (or a subdirectory for complex features)
- [ ] Export is a named function: `export function MyPage() { ... }`
- [ ] All hooks declared at TOP of function, BEFORE any conditional returns (prevents React Error #310)
- [ ] Has `<RpcStatus loading={loading} error={error} onRetry={refetch} />` guard AFTER all hooks
- [ ] Uses `<PageHeader title="…" description="…" icon={<Icon />} />`
- [ ] Uses `animate-fade-in` on the outermost container div
- [ ] All data comes from `useRpc`/`rpc` — no direct fetch
- [ ] Icon-only buttons have `aria-label`
- [ ] No inline hex colors — use Tailwind design tokens
- [ ] Arrays from RPC guarded: `(data?.items ?? []).map(...)` (prevents React Error #31)

---

## hoc-ui UI Component Reference

```tsx
import {
  Button, // variant="primary|success|danger|warning|outline|ghost" size="sm|md|lg"
  Card, // glass? hover? onClick?
  Badge, // variant="success|warning|danger|info|purple|neutral"
  StatCard, // label value sub? icon? trend?
  PageHeader, // title description? icon? actions?
  ProgressBar, // value max? labelLeft? labelRight? size="sm|md"
  Alert, // variant="info|success|warning|danger"
  Tabs, // tabs active onChange (ARIA-compliant, use this never roll your own)
  Skeleton, // animate-pulse placeholder
  EmptyState, // icon? title description? action?
  ConfirmDialog, // open title message onConfirm onCancel
  RpcStatus, // loading error onRetry — guards every data page
} from "@/components/ui";
```

---

## Tailwind Design Tokens

Only use these — never hardcode hex values in hoc-ui:

```
Backgrounds:   bg-bg-primary  bg-bg-secondary  bg-bg-card  bg-bg-input
Text:          text-text-primary  text-text-secondary  text-text-muted  text-text-heading
Semantic:      text-accent  text-success  text-danger  text-warning  text-info  text-purple
               bg-accent  bg-success  bg-danger  bg-warning  bg-info
               bg-success-bg  bg-danger-bg  bg-warning-bg  bg-info-bg
Borders:       border-border  border-border-hover  border-border/30
```

---

## Lit UI (ui/) Rules

- **Only** used for the system admin/control panel (not user-facing)
- Template functions in `ui/src/ui/views/*.ts` — pure `html\`...\`` tagged templates
- ARIA: `role="button"` + `tabindex="0"` + `@keydown` on any clickable non-button element
- No inline hex colors — use CSS custom properties defined in the design system
- All `@state()` properties must be declared before use in render tree (Lit reactivity)

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

## Republic Architecture (Intelligence Layer)

### Intelligence Bus (`intelligence-bus.ts`)

A central pub/sub message broker decoupling all Republic subsystems:

- **Event types**: `citizen.cognitive_cycle`, `anomaly.detected`, `model.performance_update`, `education.graduation`, `economy.crisis`, `hardware.alert`
- **Ring Buffer**: 200-item persistence for stateless UI mount hydration
- **Wired into**: `HardwareManager`, `CognitiveLoop`, Gateway RPC layer

### Cognitive Loop (`cognitive-loop.ts`)

Periodic cycle (every 10–30 ticks) for elite citizens (`intelligence > 70`):

1. Curiosity Analysis → 2. Reflection (last 20 ActionRecords) → 3. Lesson Distillation → 4. Memory Consolidation → 5. Publication to Intelligence Bus

### Curiosity Engine (`curiosity-engine.ts`)

Deterministic 5-factor scoring model:

| Factor                   | Weight |
| ------------------------ | ------ |
| Unexplored Domains       | 0.25   |
| Knowledge Gaps           | 0.20   |
| Recent Failures          | 0.20   |
| XP Stagnation            | 0.20   |
| Intelligence Coefficient | 0.15   |

Output: prioritized list via `suggestNextExploration()`.

### Elite Ideation

Gated by `intelligence > 70`, `mastery > 50`, `autonomy > 60` with exponential backoff. Produces "Masterpiece" outputs auto-listed in the AI Store and published to Intelligence Bus.

---

## Plugin Ecosystem (~40 plugins)

Plugins live in `plugins/hoc-plugin-<name>/` and are hot-loaded with boot priorities.

Major categories:

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

## React Stability Patterns (Critical)

### Error #310 — Hooks after Return

ALL hooks must be declared at the top of the component, BEFORE any conditional returns:

```tsx
// ✅ CORRECT
export function Page() {
  const { data, loading, error, refetch } = useRpc("data.list", {});
  const [state, setState] = useState("");
  useEffect(() => {
    /* ... */
  }, []);

  if (loading || error) return <RpcStatus loading={loading} error={error} onRetry={refetch} />;
  return <div>{/* render */}</div>;
}
```

### Error #31 — Objects as React Children

Never render raw objects. Use formatter functions or access primitive properties:

```tsx
// ✅ Safe serialization
function fmtSchedule(s: any): string {
  if (!s) return "—";
  if (typeof s === "string") return s;
  if (typeof s === "object") return s.expr ?? JSON.stringify(s);
  return String(s);
}
```

### Defensive Array Mapping

Always guard `.map()` calls on RPC data:

```tsx
{
  (data?.results ?? []).map((item) => <li key={item.id}>{item.name}</li>);
}
```

---

## Missing-RPC Bridge Strategy

When a new UI page needs data before the backend is fully integrated:

1. Whitelist the method in `server-methods-list.ts` → `BASE_METHODS`
2. Add a handler stub in `republic/missing-rpcs.ts`
3. Synthesize data from existing `getState()` (citizen population, energy, etc.)
4. **Rebuild the gateway** (`pnpm build`) and restart — hot-reload won't pick up new handlers in the registry

---

## Docker Infrastructure

Three-tier architecture: UI (`Docker.tsx`) → RPC (`docker-rpc.ts`) → Engine (`docker-orchestrator.ts`).

Resource Governor enforces CPU (50%) and RAM (60%) budgets per container. Presets available for `redis`, `postgres`, `comfyui`, etc.

---

## Common Mistakes to Avoid

1. **Inventing RPC method names** — check the source file for the domain first
2. **Editing `server-methods.ts`** — it's a dispatcher, never add handlers there
3. **Editing `republic.ts`** — it's a barrel, never add handlers there
4. **Using `any`** — use `unknown` and narrow with `as` + type guard
5. **Missing `<RpcStatus>`** — every page that fetches data must have it
6. **Mixing hoc-ui and ui changes** — they are separate apps, keep them separate
7. **Using fetch() in hoc-ui** — use `useRpc` / `rpc()` exclusively
8. **Not running tsgo after changes** — always verify with `npx tsgo --noEmit` (use `tsgo`, NOT `tsc` — `tsc` crashes on Node.js v25)
9. **Hooks after return** — all React hooks must be declared before any conditional `return` (Error #310)
10. **Rendering raw objects** — always serialize or access primitives (Error #31)
11. **Forgetting to whitelist** — new RPCs must be added to `server-methods-list.ts`
12. **Not rebuilding gateway** — new handlers require `pnpm build` + restart
13. **Monolithic files** — gateway files > 400L and UI pages > 500L MUST be split into directory modules immediately
14. **Inline static data** — registries, seeds, presets, catalogs MUST be in separate files, never inline with business logic
15. **Skipping DDD** — new features with multiple concerns MUST use directory-per-domain pattern from day 1, not "later"

---

## Multi-Agent Safety

- Do not create/apply/drop git stash unless explicitly asked
- Do not switch branches unless explicitly asked
- Commit only your changes; do not stage unrelated diffs
- If you see unexpected files, note them but don't modify them
