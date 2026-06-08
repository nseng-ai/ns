# Roadmap

## Work

- [x] Tooling contract child Objective (`bun-to-node-ts-migration-tooling-contract`).
      Create a child Objective to decide the exact pnpm workspace shape, Node v24 baseline, TypeScript CLI execution/build policy, and how to treat `node:sqlite`'s experimental warning.

- [x] pnpm workspace migration child Objective (`bun-to-node-ts-migration-pnpm-workspace`).
      Create a child Objective to replace active Bun lock/install/run assumptions for the TypeScript workspace and docs-site where in scope, including `justfile`, deploy/build commands, and user-facing docs.

- [ ] Vitest migration child Objective (`bun-to-node-ts-migration-vitest`).
      Create a child Objective to convert TypeScript tests from `bun:test` to Vitest while preserving behavior for lifecycle hooks, matcher usage, and Bun module mocking cases.

- [ ] Node runtime compatibility child Objective (`bun-to-node-ts-migration-node-runtime`).
      Create a child Objective to harden project-local Pi extension modules and TypeScript CLIs under Node, including smoke coverage for Bun-only APIs and the Graphite metadata reader replacement.

- [ ] Bun-reference reconciliation child Objective (`bun-to-node-ts-migration-bun-reference-reconciliation`).
      Create a child Objective to review active docs, scripts, deployment configuration, and templates for stale Bun assumptions, leaving only deliberate and documented references outside the migration target.

## Parked

- [ ] Reconsider npm plus Node's built-in test runner only if pnpm or Vitest proves unsuitable.
- [ ] Redesign Bun-centric skill templates only if the project decides those templates should stop creating Bun projects by default.
