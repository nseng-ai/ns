# Real Git Temp Repo Testing Standard

## Summary

Documented the default-vs-integration standard for temporary Git repository tests in `ts/TESTING.md`.

The new standard is explicit: a test that creates a temporary Git repository by invoking real Git commands such as `git init`, `git commit`, or `git worktree` is an integration test. The default lane may still keep fake-driven Git protocol coverage, injected `GitGateway` behavior, inert `.git`-shaped fixture parsing, and temporary directories used only for local fixtures or path-shape checks.

The documentation also clarifies the broader default-lane expectation: keep real Git, Graphite/sqlite, network, host-tool discovery, cold Node runtime, subprocess, and wall-clock behavior out of default tests unless the test is a deliberately cheap user-facing scenario and no narrower boundary smoke preserves the same confidence.

## Objective Impact

This turns the rebaseline finding about `createTempGitRepo` into a durable repository convention rather than a one-off judgment. Future migrations can cite `ts/TESTING.md` when deciding that temp directories alone are acceptable in default tests but real Git commands against a temp repo belong in `test/integration/`.

The standing Objective remains open. The next implementation slice remains moving the `@sdl/core/testing` real `createTempGitRepo` behavior smoke from `ts/packages/sdl-core/test/testing-export.test.ts` to the TypeScript integration lane while retaining default export-shape coverage.

## Follow-Ups

- Apply the documented standard to the `createTempGitRepo` smoke in `ts/packages/sdl-core/test/testing-export.test.ts`.
- Continue classifying temp filesystem tests by whether they invoke real external boundaries, not by temp-directory usage alone.
