# Roadmap

## Work

- [ ] Establish the Node-centered tooling contract.
  Decide the exact pnpm workspace shape, Node v24 baseline, CLI execution/build policy, and how to treat `node:sqlite`'s experimental warning. Evidence should include a small documented policy update or equivalent durable decision in the Objective.

- [ ] Migrate package management and repo orchestration from Bun to pnpm.
  Replace active Bun lock/install/run assumptions for the TypeScript workspace and docs-site where in scope. Update `justfile`, deploy/build commands, and user-facing docs so normal active workflows no longer require Bun.

- [ ] Convert TypeScript tests from `bun:test` to Vitest.
  Preserve existing test behavior and cover special cases such as lifecycle hooks, matcher usage, and Bun module mocking. Evidence should include package-level and workspace-level test runs under Vitest.

- [ ] Harden Node runtime compatibility for Pi extensions and TypeScript CLIs.
  Add Node smoke coverage for project-local Pi extension modules and update runtime code to avoid Bun-only APIs. Resolve the Graphite metadata reader using `node:sqlite` or a documented Node-compatible alternative.

- [ ] Reconcile remaining Bun references and migration fallout.
  Review active docs, scripts, deployment configuration, and templates for stale Bun assumptions. Leave only deliberate, documented Bun references outside the Objective's active migration scope.

## Parked

- [ ] Reconsider npm plus Node's built-in test runner only if pnpm or Vitest proves unsuitable.
- [ ] Redesign Bun-centric skill templates only if the project decides those templates should stop creating Bun projects by default.
