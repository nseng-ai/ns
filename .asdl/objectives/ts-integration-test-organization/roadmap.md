# Roadmap

## Work

- [ ] Decide and document the TypeScript integration-test layout and command contract.
  - Capture the folder or filename convention, the default Vitest include/exclude behavior, and the intentional integration command.
- [ ] Split `brmem` real Git coverage into default fake-driven gateway tests and integration tests.
  - Default `test/gateways` coverage should mock or inject Git command execution.
  - Real `createTempGitRepo` / `RealGitBrmemGateway` subprocess coverage should move to the integration suite.
- [ ] Move Node runtime import and CLI smoke tests into the integration suite.
  - Keep coverage for cold Node package exports and CLI entrypoints, but exclude it from default local tests.
- [ ] Move sqlite-backed Graphite/worktree-status coverage into the integration suite or replace default-path sqlite setup with injected fakes.
  - Preserve representative real sqlite coverage intentionally.
- [ ] Add CI wiring for the separated TypeScript integration suite.
  - Evidence should include default TypeScript tests and the new integration command passing in the intended environments.

## Parked

- [ ] Revisit `packages/asdl-core/test/exec.test.ts` timeout tests after the separate time-injection abstraction is available.
