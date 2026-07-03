# Roadmap

## Work

- [x] Inventory active Bun test-runner surfaces and classify Vitest conversion risks.
      Include package-local test scripts, `bun:test` imports, lifecycle hooks, matcher patterns, the known `mock.module` case, `@types/bun`, CI/justfile command paths, and active docs that describe TypeScript test execution. Evidence should distinguish mechanical import/script conversion from behavior-sensitive changes.
      Evidence: Semantic Update `20260608T173137Z-vitest-surface-inventory.md` records package scripts, `bun:test` import counts, the `mock.module` risk, lifecycle/state risk classes, Bun type references, CI/docs surfaces, and baseline command outcomes.

- [x] Decide and add the Vitest workspace configuration.
      Choose the shared-vs-package-local configuration shape, dependency placement, Node/TypeScript execution assumptions, and serial/concurrency policy needed to preserve the current `bun test --sequential` behavior where required.
      Evidence: Semantic Update `20260608T175255Z-vitest-workspace-config.md` records the shared root config decision, `vitest` dependency placement, explicit-import policy, serial `fileParallelism: false` posture, config-load evidence, and local Node baseline warning.

- [x] Convert package-local test scripts and `bun:test` imports to Vitest.
      Migrate `asdl-dev`, `ccc`, `pi-extension-runtime`, `pi-extensions`, and `planned-branch` package tests without changing production behavior or hiding genuine test-runner semantic differences.
      Evidence: Semantic Update `20260608T181655Z-low-risk-vitest-package-conversion.md` records that `asdl-dev`, `ccc`, `pi-extension-runtime`, and `planned-branch` package-local scripts and test imports now run through Vitest. Semantic Update `20260608T182139Z-pi-extensions-vitest-conversion.md` records the `pi-extensions` conversion. Semantic Updates `20260608T184644Z-post-restack-ts-plans-vitest-conversion.md` and `20260608T184809Z-post-restack-additional-vitest-imports.md` record post-restack conversions for newly surfaced active test files; no active `ts/packages/**` test file imports from `bun:test` after this slice.

- [x] Convert Bun-specific mocking and lifecycle behavior with targeted evidence.
      Give special attention to `ts/packages/pi-extensions/test/changes.test.ts` and any tests relying on module cache state, cleanup timing, temporary files, or shared process state.
      Evidence: Semantic Update `20260608T182139Z-pi-extensions-vitest-conversion.md` records the `@earendil-works/pi-ai` `vi.mock`/`vi.hoisted` replacement, matcher cleanup, and full package/workspace Vitest validation.

- [x] Remove obsolete Bun test-runner dependencies and update active command documentation.
      Remove `@types/bun` or other Bun test-runner-only support when no active runtime need remains, then update `justfile`, CI, package docs, and agent-facing command references that still describe TypeScript tests as Bun-backed.
      Evidence: Semantic Update `20260608T182547Z-final-vitest-migration-evidence.md` records removal of `@types/bun`, the `bun` tsconfig type entry, `ts/bun.lock`, and the transitional CI Bun setup step, plus updated agent guidance for Vitest-backed TypeScript package tests.

- [x] Record final Vitest migration evidence and downstream guidance.
      Evidence should include representative package-level and workspace-level test commands, any Node baseline caveats, any deliberately retained serial execution, and follow-ups for Node runtime compatibility or Bun-reference reconciliation.
      Evidence: Semantic Updates `20260608T182547Z-final-vitest-migration-evidence.md`, `20260608T184644Z-post-restack-ts-plans-vitest-conversion.md`, and `20260608T184809Z-post-restack-additional-vitest-imports.md` record package/workspace validation, the local Node baseline warning, deliberately retained serial Vitest execution, post-restack active-test conversions, and intentionally out-of-scope Bun references.

## Parked

- [ ] Reconsider Node's built-in test runner only if Vitest proves unsuitable for the current matcher, lifecycle, and module-mocking requirements.
- [ ] Introduce built JavaScript test artifacts only if Vitest cannot safely run the workspace's TypeScript tests through the settled Node-compatible tooling path.
