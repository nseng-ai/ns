# TypeScript Style — References

Read these only when the top-level files are not enough. They are project-neutral: examples are
motivating patterns you can adapt to the repository you are working in.

## Reference map

- **[philosophy.md](./philosophy.md)** — why the guide prefers small cores, honest types,
  errors-as-values, and low machinery.
- **[type-system.md](./type-system.md)** — unions, open unions, generics, `satisfies`, declaration
  merging, and the tradeoffs behind avoiding emit-only TS features.
- **[error-handling.md](./error-handling.md)** — `Result<T,E>`, terminal error events, typed errors,
  cancellation, and invariant throws.
- **[case-study-backend-neutrality.md](./case-study-backend-neutrality.md)** — a generic multi-backend API
  pattern for storage, payments, LLMs, transports, or any backend-neutral layer.
- **[case-study-context-management.md](./case-study-context-management.md)** — a generic stateful
  workflow/context loop with budgeting, compaction, retry, and hook points.
- **[case-study-extension-system.md](./case-study-extension-system.md)** — plugin/extension loading,
  registry design, capability isolation, and stale-runtime protection.
- **[case-study-tui.md](./case-study-tui.md)** — terminal UI component, rendering, input, keybinding,
  and width-safety patterns.
- **[review-taste-and-process.md](./review-taste-and-process.md)** — a terse review rubric for
  identifying incoherent types, needless machinery, misplaced layers, and unowned complexity.

## How to use the examples

Treat every code snippet as a shape, not a package path:

1. Rename concepts to match the domain.
2. Use the project's formatter and import suffix convention.
3. Preserve public compatibility unless the task asks you to break it.
4. Add tests at the abstraction boundary, not only at the leaf helper.
