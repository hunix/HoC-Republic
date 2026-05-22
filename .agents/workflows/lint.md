---
description: Run oxlint across the whole project and report issues
---

## Steps

// turbo-all

1. Run oxlint from the repo root:

```
npx oxlint
```

Results are written to `oxlint_out.txt` (gitignored). Check the output for errors vs warnings.

> For a specific directory only:
> ```
> npx oxlint src/gateway/server-methods/
> ```
>
> For hoc-ui only:
> ```
> npx oxlint hoc-ui/src/
> ```

**Config files:**
- Rules: `.oxlintrc.json`
- Ignore patterns: `.oxlintignore`

**Common issues to fix:**
- `no-unused-vars` — remove or use underscore prefix (`_unusedVar`)
- `prefer-const` — replace `let` with `const` when not reassigned
- `no-explicit-any` — replace `any` with `unknown` and narrow with type guards
