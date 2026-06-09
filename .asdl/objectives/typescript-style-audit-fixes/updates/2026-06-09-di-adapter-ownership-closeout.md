# Dependency Injection and Adapter Ownership Slice Completed

## Summary

The dependency-injection / adapter-ownership roadmap row is now implemented for the remaining narrow TypeScript filesystem/path seams.

Four domain-ish direct Node seams now have fake-driveable collaborators while preserving default runtime behavior:

- `ts/packages/ccc/src/land-stack/stack-facts.ts` exposes `DetectInProgressOperationOptions.pathExists`; active rebase detection still resolves Git's `rebase-merge` / `rebase-apply` paths, but tests can decide path existence without creating `.git` state.
- `ts/packages/ccc/src/land-stack/worktrees.ts` exposes `DetectWorktreeConflictsOptions.normalizePath`; current-worktree equivalence can be tested through a fake normalizer while managed-slot/manual classification still uses the original display path.
- `ts/packages/planned-branch/src/plan-content-slug.ts` exposes `DerivePlanContentSlugInput.readTextFile`; slug derivation can be driven from supplied Markdown content without reading a real plan file, and the prompt remains content-only rather than path/filename-derived.
- `ts/packages/planned-branch/src/attached-plan.ts` adds `LoadAttachedPlanOptions.readTextFile`; saved-plan fallback loads selected local-plan-store content through an injected reader while keeping static prompt-template loading as module-owned runtime setup.

No broad filesystem, runtime, clock, or timer framework was introduced. The new object-shape contracts are interfaces and the default collaborators remain local to their owning modules.

## Adapter-Owned Exceptions

This slice deliberately leaves larger direct-runtime modules as adapter ownership sites rather than abstracting them prematurely:

- `ts/packages/asdl-dev/src/checkpoint-flow.ts` continues to own temporary commit-message file lifecycle (`mkdtemp`, `writeFile`, `rm`, `tmpdir`, `join`) because `createCommitWithPreparedMessage` is the command-flow adapter for invoking `git commit -F`. Git command execution remains injected through `exec`.
- `ts/packages/pi-extensions/src/pr-feedback-watch.ts` continues to own extension-controller runtime state: timestamps, timers, executable/path probing, GitHub/CLI polling, and Pi message dispatch. A clock/timer/filesystem runtime abstraction would be a separate controller-runtime design slice.

The optional runtime scan still reports direct Node/global usage in explicit adapter modules such as TypeScript CLIs, command runners, planned-branch/brmem CLI helpers, and asdl-dev gateways. Those are adapter-owned surfaces, not remaining domain seams for this row.

## Tests and Validation

Fake-driven tests were added for the four seams:

- land-stack rebase detection with injected `pathExists`, including an absent-directory negative case.
- land-stack worktree conflict detection with injected path normalization, including current-worktree equivalence and original-path managed-slot classification.
- planned-branch content slug derivation with injected `readTextFile` and prompt assertions excluding the fake source path/basename.
- saved-plan fallback loading through injected `readTextFile`, asserting saved source metadata and byte count are based on reader-supplied content.

Validation passed:

- `pnpm --dir ts/packages/ccc run check`
- `pnpm --dir ts/packages/ccc run test -- land-stack.test.ts` (package test suite passed: 15 files, 213 tests)
- `pnpm --dir ts/packages/planned-branch run check`
- `pnpm --dir ts/packages/planned-branch run test -- plan-content-slug.test.ts` (package test suite passed: 9 files, 67 tests)
- `pnpm --dir ts/packages/pi-extensions run check`
- `pnpm --dir ts/packages/pi-extensions run test -- attached-plan.test.ts` (package test suite passed: 37 files, 547 tests)
- `just ts-check`
- `just ts-test`
- `just dprint-check`

## Follow-Ups

- The final audit-loop row remains open. It should perform the explicit final exception/deviation summary and closeout scan rather than treating this narrow DI slice as the whole audit completion.
