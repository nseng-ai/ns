# Foundation and Brmem Filesystem Acceptance Complete

## Summary

Foundation now exposes `defineClinkrAppCli` as a durable modern lifecycle beside the unchanged legacy `defineCli` path. The modern lifecycle reads package metadata once, prepares dependencies before constructing a fresh contextful `ClinkrApp`, propagates rewritten arguments, invocation context, structured stdin, and ANSI capability, supports handled preparation and application error policy, and owns direct process-entry handling. Injectable output sinks use a scoped process-writer interception that restores both writers in `finally`; because that interception is process-global, override-backed in-process runs must remain sequential.

Brmem is the first production consumer. Its binary now lives at `src/cli/app.ts` and discovers ten selected-only command definitions from the filesystem, including the hidden but invocable `exec resolve-prompt` route. Each command owns its annotated request schema, handler, modern outcome, and presentation. The CLI context carries only consumed collaborators and invocation facts; framework `--input-json` stdin is distinct from Brmem source-content stdin. The reusable Entry-resolution seam is `src/entry-request.ts`, while `src/git-setup.ts` contains the setup command's pure planner.

The old eager `src/cli.ts`, the complete `src/operations/` layer, legacy Clinkr imports, mutable `ClinkrGroup` construction, and old confirmation gate are deleted. The package root no longer exposes CLI lifecycle or Git setup implementation details; `runCli`, `VERSION`, and `CliDeps` remain local test seams in the executable module.

## Acceptance Evidence

- Foundation's modern lifecycle suite covers package metadata/runtime diagnostics, preparation inputs and handled exits, fresh app construction, rewritten args/context, stdin JSON, ANSI rendering, stdout/stderr capture and restoration on success and throw, handled/declined errors, and `runIfMain`.
- Brmem's fake-driven scenarios preserve command behavior, status/exit envelopes, confirmation semantics, hidden-route invocation, and CLI metadata surfaces.
- A structural guard proves the exact filesystem route inventory, exact command file pairs, cheap metadata/group imports, hidden `exec`, and absence of the old operations directory.
- Packed acceptance prepares the publish root, creates and extracts the tarball, checks every route module and the `src/cli/app.ts` bin path, links dependencies explicitly, and executes help plus a selected `check` command from the extracted package.
- Generated `dist` output is removed after packed verification.

## Validation

- `pnpm --dir ts --filter @nseng-ai/foundation check`
- `pnpm --dir ts --filter @nseng-ai/foundation test`: 37 files, 351 tests
- `pnpm --dir ts --filter @nseng-ai/clinkr check`
- `pnpm --dir ts --filter @nseng-ai/clinkr test`: 31 files, 488 tests
- `pnpm --dir ts --filter @nseng-ai/brmem check`
- `pnpm --dir ts --filter @nseng-ai/brmem test`: 18 files, 122 tests
- `pnpm --dir ts --filter @nseng-ai/brmem pack:local`
- `just`: 570 default files / 6043 tests plus format, lint, type, dprint, dependency, style-guard, and Objective checks
- `just ts-test-integration`: 53 files, 260 tests
- `just ts-test-isolated`: 5 files, 16 tests

## Objective Impact

The Foundation/Brmem acceptance roadmap row is complete. The Foundation seam is independently modern and does not lower through the legacy runtime; Brmem proves the standalone filesystem authoring, selected loading, fake-driven invocation, and packed discovery contracts. SDK/host composition, Objectives acceptance, broad caller migration, package-root cutover, and full legacy deletion remain later rows.
