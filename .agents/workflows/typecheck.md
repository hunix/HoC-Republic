---
description: Run type checks across all 3 packages (gateway, hoc-ui, Lit ui) using tsgo
---

## Steps

// turbo-all

1. Type-check the gateway:

```
npx tsgo --noEmit
```

2. Type-check the React UI:

```
cd hoc-ui && npx tsgo --noEmit && cd ..
```

3. Type-check the Lit admin UI:

```
cd ui && npx tsgo --noEmit && cd ..
```

> **Do NOT use `npx tsc --noEmit`** — it crashes on Node.js v25 due to a CJS/`using`-keyword incompatibility in TypeScript 5.9.x. Always use `tsgo` (the native Go-compiled TS checker already installed in the project).

All three commands must exit with 0 errors before a PR is considered clean.
