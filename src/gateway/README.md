# Gateway Source Layout

The gateway root contains ~136 files. To make navigation easier, sub-package
index files group modules by domain domain. Import from the sub-package index
for a cleaner path, or directly from the root file — both work identically.

```
src/gateway/
├── core/           ← boot, gateway-lifecycle, server-startup, net, mission-control
├── http/           ← server-http, openai-http, openresponses-http, http-common, http-utils
├── ws/             ← ws-log, ws-logging, server-broadcast, server-ws-runtime
├── chat/           ← server-chat, chat-abort, chat-attachments, chat-sanitize
├── sessions/       ← session-utils, sessions-patch, sessions-resolve
├── channels/       ← server-channels
├── auth/           ← auth, origin-check, device-auth, pair-request-store
├── nodes/          ← server-node-events, server-node-subscriptions, node-registry, node-command-policy
├── server-methods/ ← all RPC handler barrels (one file per domain)
│   ├── handler-registry.ts   ← central scope registry (Phase 2 migration)
│   ├── types.ts              ← HandlerDescriptor, defineHandlers(), toHandlerMap()
│   ├── windows/              ← windows-capabilities.ts
│   └── republic/             ← republic-specific handlers and missing-rpcs
└── protocol/       ← wire protocol types, validators, error helpers
```

## Sub-package index strategy

Each `<domain>/index.ts` file is a pure re-export shim. No files were moved —
this keeps all existing imports valid while making the directory navigable.

New code should prefer importing from the sub-package index:

```ts
// preferred
import { authorizeGatewayConnect } from "./auth/index.js";

// also valid (direct root import)
import { authorizeGatewayConnect } from "./auth.js";
```

## Phase 2 Migration Progress

Handler barrels that support the descriptor-based auth system (no READ_METHODS/WRITE_METHODS needed):

- ✅ `health.ts`
- ✅ `logs.ts`
- ✅ `sessions.ts`
- ✅ `agents.ts`
- ✅ `republic/missing-rpcs.ts`

Remaining barrels still using legacy flat-set auth (tracked via `[gateway:startup]` boot log):

- `chat.ts`, `channels.ts`, `cron.ts`, `config.ts`, `wizard.ts`, `update.ts`,
  `skills.ts`, `system.ts`, `models.ts`, `usage.ts`, `browser.ts`, `republic.ts`,
  `connect.ts`, `send.ts`, `tts.ts`, `talk.ts`, `voicewake.ts`, `web.ts`,
  `devices.ts`, `exec-approvals.ts`, `companion-handlers.ts`, `cluster.ts`,
  `nodes.ts`, `agent.ts`, `windows-control.ts`
