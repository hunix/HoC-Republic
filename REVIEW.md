# HoC — Code Review Focus Areas

> This file guides Claude Code Review (and any AI reviewer) on what to focus on.

## Critical Checks (Must Catch)

1. **Missing `<RpcStatus>` guards** — every hoc-ui page that fetches data MUST have `<RpcStatus loading={loading} error={error} onRetry={refetch} />` before rendering content
2. **Raw `fetch()` in hoc-ui** — all gateway calls must go through `useRpc` / `rpc()` / `mutateRpc()`
3. **Inline hex colors** — only Tailwind design tokens allowed (`bg-bg-primary`, `text-text-heading`, etc.)
4. **`any` type usage** — use `unknown` and narrow with type guards
5. **Handler in wrong file** — handlers should be in `server-methods/<domain>/<file>.ts`, never in `server-methods.ts` or `server-methods/<domain>.ts` barrels

## Important Patterns

- Icon-only buttons need `aria-label`
- Pages export a named function (not default export)
- Animations: `animate-fade-in` on outermost container
- Mutations: use `mutateRpc()` then `refetch()` for instant UI updates

## Ignore

- Pre-existing `react-router-dom` JSX type incompatibility warnings (known TS 5.9 / Node 25 issue)
- Lit UI (`ui/`) type errors from `html` tagged templates
- The 600+ lazy Route components in `App.tsx` all showing same Suspense/Safe error
