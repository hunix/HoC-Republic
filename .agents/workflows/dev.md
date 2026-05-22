---
description: Start the full HoC development environment (gateway + hoc-ui dev server)
---

## Steps

1. From the repo root, start the full dev environment (gateway + hoc-ui hot-reload):

```
pnpm dev
```

This starts both the Node.js gateway (port 3000) and the Vite hoc-ui dev server (port 5173) concurrently.

> If you only want the gateway without the UI dev server:
> ```
> pnpm dev gateway
> ```
>
> If you only want the hoc-ui dev server:
> ```
> cd hoc-ui && pnpm dev
> ```

**Access points:**
- Gateway WebSocket: `ws://localhost:3000`
- React UI: `http://localhost:5173`
- Lit admin UI (built): served from gateway at `http://localhost:3000/ui`

**Note**: The dev UI (port 5173) hot-reloads on file save. For the Lit admin UI changes to reflect, you must run `/build-ui` to rebuild and restart the gateway.
