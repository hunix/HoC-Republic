# HoC System Architecture

> Reference document for AI agents working on HoC.
> Last updated: 2026-03-09

---

## System Overview

HoC is an AI republic simulation where autonomous AI citizens live, work, self-organize,
and execute real tasks. It is composed of three layers:

```
┌─────────────────────────────────────────────────────────┐
│  hoc-ui (React + Vite)     ui/ (Lit web components)    │
│  End-user control panel     Admin/debug control panel   │
└────────────────────┬────────────────────────────────────┘
                     │  WebSocket (JSON-RPC)
┌────────────────────▼────────────────────────────────────┐
│                 Gateway (Node.js / TypeScript)           │
│  server-methods.ts → domain handlers → engine calls     │
└────────┬───────────────────────────┬────────────────────┘
         │                           │
┌────────▼────────┐        ┌─────────▼───────────────────┐
│  Republic Engine │        │  Plugin System              │
│  (simulation,    │        │  plugins/ hot-loaded Node   │
│   agents, GSD)   │        │  packages with boot priority│
└─────────────────┘        └─────────────────────────────┘
```

---

## Layer 1: Gateway (`src/`)

The gateway is the backend. It owns:

- The WebSocket server (clients connect, send `req`, receive `res` + `event` frames)
- All RPC handler dispatch
- Plugin lifecycle management
- The republic simulation engine calls

### RPC Dispatch Path

```
Browser sends:  { type: "req", id: "rpc-42", method: "republic.citizen.get", params: { citizenId: "abc" } }

Gateway:
  server-methods.ts        ← dispatch() looks up method → handler
  server-methods/republic.ts  ← is it a republic.* method?
  server-methods/republic/core.ts  ← coreHandlers["republic.citizen.get"](params, ctx)

Browser receives: { type: "res", id: "rpc-42", ok: true, payload: { citizen: {...} } }
```

### Key Gateway Files

| File                                           | Role                                           |
| ---------------------------------------------- | ---------------------------------------------- |
| `src/gateway/gateway.ts`                       | Boot, WS server, plugin loader                 |
| `src/gateway/server-methods.ts`                | Dispatch router — **do not add handlers here** |
| `src/gateway/server-methods/republic.ts`       | Barrel merging all republic/\* handler objects |
| `src/gateway/server-methods/republic/*.ts`     | ~50 domain handler files (one per domain)      |
| `src/gateway/server-methods/agent.ts`          | Agent lifecycle RPC                            |
| `src/gateway/server-methods/chat.ts`           | Chat/message RPC                               |
| `src/gateway/server-methods/cron.ts`           | Cron scheduler RPC                             |
| `src/gateway/server-methods/sessions.ts`       | Agent session management                       |
| `src/gateway/server-methods/models-manager.ts` | LLM model download/management                  |
| `src/gateway/server-methods/system.ts`         | System status, env, update                     |

### Adding a New RPC Handler

1. Find or create the domain file: `src/gateway/server-methods/republic/<domain>.ts`
2. Add to its handler object (e.g. `coreHandlers["republic.citizen.new"] = async (p, ctx) => ...`)
3. The barrel (`republic.ts`) and dispatcher (`server-methods.ts`) do **not** need changes

---

## Layer 2: React UI (`hoc-ui/`)

The production-facing React application.

### Data Flow

```
Component renders
  → useRpc("method", params) called
  → checks LRU cache (responseCache, max 256 entries)
    → cache hit: returns immediately, no loading flash
    → cache miss: cachedRpc() → WebSocket req → res → setState
  → component re-renders with data
```

### Key hoc-ui Files

| Path                                   | Role                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| `hoc-ui/src/lib/rpc.ts`                | All gateway communication (useRpc, rpc, mutateRpc, etc.) |
| `hoc-ui/src/lib/api.ts`                | Raw WebSocket wrapper (sendWs, onWsMessage, onWsStatus)  |
| `hoc-ui/src/components/ui/index.tsx`   | Full shared component kit                                |
| `hoc-ui/src/pages/`                    | One file per page (lazy-loaded)                          |
| `hoc-ui/src/contexts/ToastContext.tsx` | Toast notifications                                      |
| `hoc-ui/src/App.tsx`                   | Router + layout                                          |
| `hoc-ui/src/main.tsx`                  | Entry point                                              |

### Key RPC Functions

```typescript
// Read (React hook — use in components)
useRpc<T>(method, params?, deps?, opts?)
// → returns { data: T|null, loading: boolean, error: string|null, refetch: () => void }

// Write (one-shot call — use in event handlers)
rpc<T>(method, params?)                     // fire-and-forget
mutateRpc<T>(method, params?)               // + invalidates domain cache

// Cache management
invalidateRpcCache(method, params?)         // single entry
invalidateRpcDomain(domainPrefix)           // all "domain.*" entries
cachedRpc<T>(method, params?, staleTimeMs?) // low-level, prefer useRpc
```

---

## Layer 3: Lit Admin UI (`ui/`)

The system admin and debug control panel, used by developers.

- Built with Lit web components — pure `html\`...\`` tagged template functions
- `ui/src/ui/views/*.ts` — one file per view
- Served separately from hoc-ui
- No React, no Tailwind — uses CSS custom properties for design tokens

**Do not confuse with hoc-ui.** Features belong in one or the other, not both.

---

## Layer 4: Plugin System (`plugins/`)

Plugins are hot-loadable Node.js packages with a boot priority system:

```
Priority 1 (boot first):  infrastructure plugins
Priority 2:               AI model integrations
Priority 3:               simulation domain plugins
Priority 9 (boot last):   optional/experimental plugins
```

Each plugin exposes an `init(gateway)` function and optionally extends the
republic simulation, registers new RPC methods, or adds scheduled tasks.

Plugin data files live in `plugins/.data/<plugin-name>/`.

---

## Republic Simulation Engine

The republic is the AI civilization simulation engine. Key concepts:

- **Citizens** — autonomous AI agents with personality, goals, relationships, jobs
- **Government** — parliament, laws, voting, civil services
- **Economy** — treasury, taxes, microwork marketplace (harvesters), GSD labor market
- **GSD (Get Shit Done)** — task execution workflow: projects → tasks → agent execution
- **Intelligence** — world events feed, threat analysis, geopolitical simulation
- **Pulse** — heartbeat tick that advances the simulation each cycle

Republic state is persisted in `data/republic/` (not tracked by git — multi-GB).

---

## Authentication

- WS connections include a device identity on `connect`
- No JWT/session tokens for hoc-ui — it connects to the local gateway directly
- `server-methods.ts` `ctx` object carries connection identity and authorization level
- Admin operations check `ctx.isAdmin` or `ctx.role`

---

## Design System (hoc-ui Tailwind Tokens)

All colors are semantic design tokens — never use hex in hoc-ui:

```
bg-bg-primary / bg-bg-secondary / bg-bg-card / bg-bg-input / bg-bg-card-hover
text-text-primary / text-text-secondary / text-text-muted / text-text-heading
text-accent / bg-accent / border-accent
text-success / bg-success / bg-success-bg
text-danger  / bg-danger  / bg-danger-bg
text-warning / bg-warning / bg-warning-bg
text-info    / bg-info    / bg-info-bg
border-border / border-border-hover
```
