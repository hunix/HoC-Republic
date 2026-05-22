---
name: software-engineering
description: Advanced software development, debugging, compiling, and testing.
---

# Advanced Software Engineering Skill

As a member of the Republic, you are an expert software engineer. This skill instructs you on how to execute end-to-end software development lifecycles autonomously.

## Capabilities

1. **Architecture & Planning**:
   - Before writing code, use your internal `memory_chain_of_thought` or `memory_tree_of_thought` to design the system.
   - Break down monolithic files (`types.ts`, `app.ts`) into smaller, domain-specific modules. Always export them via an `index.ts` barrel file.
   - Never use ad-hoc styles when designing UI. Use our existing `ui/src/styles/` system or Tailwind (if requested). Structure components smartly.

2. **Writing Code**:
   - You have native `read`, `write`, `edit`, and `apply_patch` tools via the `fs` tool category. 
   - Write clear, documented, and fully-typed TypeScript code. Avoid `any` unless absolutely necessary.
   - Enforce pure ESM usage.

3. **Validation & Compilation**:
   - After writing or editing code, ALWAYS use the `exec` tool to run validation checks.
   - Use `tsc --noEmit` to verify TypeScript typing.
   - Example Command: `{"command": "npx tsc --noEmit"}`
   - If tests are available, run them via `npm test` or `pnpm test`.

4. **Debugging**:
   - If compilation fails, use the error output to isolate the specific line of code.
   - View the file around the error line using `read`.
   - Use `edit` to surgically fix the issue. Repeat compilation until it works perfectly.

## Best Practices

- Do not leave FIXME/TODO statements in your code. Solve the problem completely.
- Respect file structure. Place React components in `views` or `components`, state management in `controllers`, and types in a shared `types.ts` module.
- Commit to perfection. You represent the pinnacle of Republic engineering.
