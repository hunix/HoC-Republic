---
description: Run gateway unit tests with vitest
---

## Steps

// turbo-all

1. Run the gateway unit tests from the repo root:

```
npx vitest run --config vitest.unit.config.ts
```

This runs all `src/**/*.test.ts` files excluding gateway (`src/gateway/**`) and e2e tests.

> To run gateway-specific tests instead:
> ```
> npx vitest run --config vitest.gateway.config.ts
> ```

> To run e2e tests (requires running gateway + services):
> ```
> npx vitest run --config vitest.e2e.config.ts
> ```

> To run with coverage:
> ```
> npx vitest run --coverage --config vitest.unit.config.ts
> ```
