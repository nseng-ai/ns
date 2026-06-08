# Bun-to-Node TypeScript Migration

## Thesis

Migrate the repository's TypeScript and documentation tooling away from Bun toward a Node-centered contract using pnpm for package management, Vitest for tests, and Node-safe runtime code for Pi extensions and local CLIs.

The migration should eliminate the current split where tests run under Bun while live Pi extensions run under Node. The desired end state is that TypeScript test evidence, package scripts, lockfiles, CLI launch paths, and project-local Pi extension runtime assumptions all agree on the same Node-compatible behavior.

## Scope

- Replace Bun-based TypeScript workspace package management with pnpm, including workspace scripts and lockfile policy.
- Replace `bun:test` usage with Vitest across TypeScript packages while preserving the current test intent and matcher ergonomics.
- Update repo orchestration such as `justfile`, `js-test`, `ts-check`, `ts-test`, and related install/check/test commands to use the new Node-centered tooling.
- Migrate `docs-site` install/build/deploy configuration away from Bun where practical, including Vercel configuration and docs instructions.
- Make project-local Pi extension runtime code explicitly Node-safe because live Pi runs under Node and loads TypeScript extensions through Pi's extension loader.
- Use Node v24+ as the target runtime for TypeScript runtime behavior, including `node:sqlite` for Graphite metadata reads despite the current experimental warning.
- Revisit the current Graphite metadata patch so SQLite access no longer depends on the external `sqlite3` CLI when Node's built-in SQLite support is available.
- Decide and document the CLI execution/build policy for TypeScript CLIs currently launched with `#!/usr/bin/env bun`.

## Non-Goals

- Do not migrate the Python package/tooling stack.
- Do not redesign Pi itself or change the installed Pi package runtime beyond what is needed for project-local extension compatibility.
- Do not use npm plus Node's built-in test runner as the default migration path unless later evidence overturns the pnpm + Vitest decision.
- Do not perform broad style rewrites unrelated to the runtime/tooling migration.
- Do not require removing every historical mention of Bun from skill templates or archived documentation unless those references affect active repo tooling or developer workflow.

## Completion Criteria

- The TypeScript workspace installs reproducibly with pnpm and has a committed pnpm lockfile replacing the Bun lockfile for active TS tooling.
- TypeScript package check/test scripts run without Bun and pass under the Node-centered toolchain.
- Existing `bun:test` tests are migrated to Vitest with equivalent coverage and behavior, including module mocking cases.
- Project-local Pi extension runtime paths are smoke-tested under Node in a way that would catch Bun-only APIs such as `bun:sqlite`, `Bun.*`, or browser-only Worker assumptions.
- The Graphite metadata reader uses `node:sqlite` or an explicitly justified Node-compatible alternative, not an untracked `sqlite3` CLI dependency.
- TypeScript CLI entry points have a clear Node-compatible execution policy, such as built output with Node shebangs or an explicitly accepted Node TypeScript-stripping path.
- `justfile`, docs-site deploy/build configuration, and relevant README/docs commands no longer require Bun for normal active workflows.
- Any remaining Bun dependency is deliberate, documented, and outside the active migration target.

## Assumptions and Risks

Assumptions:

- Node v24+ is an acceptable baseline for this repository's TypeScript tooling and runtime behavior.
- Vitest will be a lower-friction replacement for `bun:test` than Node's built-in test runner because the current tests use Jest/Vitest-style `expect` matchers extensively.
- pnpm will handle the workspace dependency model more cleanly than npm, which currently rejects the existing `workspace:*` dependency shape during a dry-run install.
- Pi's installed CLI will continue to execute project-local extensions under Node, so extension runtime compatibility should be validated with Node even if tests are run by another tool.

Risks:

- `node:sqlite` is available on current Node v24 but still emits an experimental warning; the migration may need to suppress, accept, or document that warning.
- Node TypeScript execution remains a policy choice: relying on native type stripping may produce experimental warnings or fail on non-erasable syntax, while building CLIs introduces a dist/build workflow.
- Package-manager migration can expose dependency resolution differences, especially for patched dependencies and Pi peer dependencies.
- Vitest mocking semantics may not exactly match Bun's `mock.module`, so module-mocking tests need careful conversion rather than blind import replacement.
- Removing Bun from docs-site deploy configuration may surface hosting or Astro version constraints separate from the TS workspace.

## Open Questions

- Should TypeScript CLIs be built to JavaScript with Node shebangs, or should they run directly as TypeScript under Node v24's type-stripping support?
- How should the project handle the `node:sqlite` experimental warning in tests, live Pi sessions, and CI output?
- Should docs-site migration happen in the same stack as the TypeScript workspace migration or as a follow-up branch after pnpm/Vitest is stable?
- Are skill templates that intentionally scaffold Bun projects in scope for update, or should they remain as separate product guidance until explicitly redesigned?
