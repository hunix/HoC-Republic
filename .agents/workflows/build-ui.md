---
description: Build the React UI and restart the gateway so browser sees the latest pages
---

## Steps

1. From the repo root, build the React UI:

```
pnpm ui:build
```

This outputs to `dist/control-ui/` which the gateway serves automatically.

2. Restart the gateway:

```
pnpm dev gateway run
```

**Do NOT** use `cd hoc-ui && pnpm build` alone — that also works but only if `dist/` wasn't wiped by a root `pnpm build` afterwards.

The gateway finds the UI by looking for `dist/control-ui/index.html` relative to the package root. If it falls back to an old UI, it means that file is missing — always run `pnpm ui:build` from the root after making UI changes.

// turbo-all
