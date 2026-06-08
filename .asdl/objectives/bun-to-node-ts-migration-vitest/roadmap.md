# Roadmap

## Work

- [x] Inventory active Bun test-runner surfaces and classify Vitest conversion risks.
      Include package-local test scripts, `bun:test` imports, lifecycle hooks, matcher patterns, the known `mock.module` case, `@types/bun`, CI/justfile command paths, and active docs that describe TypeScript test execution. Evidence should distinguish mechanical import/script conversion from behavior-sensitive changes.
      Evidence: Semantic Update `20260608T173137Z-vitest-surface-inventory.md` records package scripts, `bun:test` import counts, the `mock.module` risk, lifecycle/state risk classes, Bun type references, CI/docs surfaces, and baseline command outcomes.

- [ ] Decide and add the Vitest workspace configuration.
      Choose the shared-vs-package-local configuration shape, dependency placement, Node/TypeScript execution assumptions, and serial/concurrency policy needed to preserve the current `bun test --sequential` behavior where required.

- [ ] Convert package-local test scripts and `bun:test` imports to Vitest.
      Migrate `asdl-dev`, `ccc`, `pi-extension-runtime`, `pi-extensions`, and `planned-branch` package tests without changing production behavior or hiding genuine test-runner semantic differences.

- [ ] Convert Bun-specific mocking and lifecycle behavior with targeted evidence.
      Give special attention to `ts/packages/pi-extensions/test/changes.test.ts` and any tests relying on module cache state, cleanup timing, temporary files, or shared process state.

- [ ] Remove obsolete Bun test-runner dependencies and update active command documentation.
      Remove `@types/bun` or other Bun test-runner-only support when no active runtime need remains, then update `justfile`, CI, package docs, and agent-facing command references that still describe TypeScript tests as Bun-backed.

- [ ] Record final Vitest migration evidence and downstream guidance.
      Evidence should include representative package-level and workspace-level test commands, any Node baseline caveats, any deliberately retained serial execution, and follow-ups for Node runtime compatibility or Bun-reference reconciliation.

## Parked

- [ ] Reconsider Node's built-in test runner only if Vitest proves unsuitable for the current matcher, lifecycle, and module-mocking requirements.
- [ ] Introduce built JavaScript test artifacts only if Vitest cannot safely run the workspace's TypeScript tests through the settled Node-compatible tooling path.
