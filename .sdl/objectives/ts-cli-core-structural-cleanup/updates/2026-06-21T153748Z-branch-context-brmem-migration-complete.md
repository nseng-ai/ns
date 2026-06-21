# Branch-Context Brmem Migration Complete

## Summary

The branch-context side of Branch-Memory access unification is complete. PR #1996 (`add-branch-context-testing-gateway`) closes the final evidence gaps after the in-process gateway migration: the dry-run preview no longer claims a `brmem put --format json` subprocess command will run, and CLI scenario tests now cover Branch Memory attach/list/get/check/delete failure diagnostics through the shared in-memory gateway.

Combined with the downstack migration evidence, `branch-context` now constructs `RealGitBrmemGateway`, consumes the `BrmemGateway` interface, has no remaining `@sdl/core/brmem-cli` references under `ts/packages/branch-context`, and no longer carries the old `src/brmem-gateway.ts` JSON-envelope parser layer.

Validation evidence recorded for this slice: focused branch-context tests, focused branch-context + ccc + pi-extension consumer tests, and the normal TypeScript gates passed (`ts-format-check`, `ts-lint`, `ts-check`, `ts-test`, `ts-deps-check`, `ts-guard`).

## Objective Impact

The roadmap row for unifying `branch-context` Branch-Memory access can be marked complete. This completes the branch-context migration/deletion portion of the Branch-Memory cleanup, including behavior-preserving diagnostics and partial-failure coverage.

The related `@sdl/core/brmem-cli` candidate-framework cleanup remains a separate open roadmap row: remaining `brmem-cli` consumers outside branch-context still need the planned `runBrmem` simplification / candidate-loop cleanup before the broader Branch-Memory completion criterion is fully satisfied.

## Follow-Ups

- Continue with the separate `@sdl/core/brmem-cli` multi-candidate framework collapse row.
- When touching Branch Memory dry-run or preview surfaces, keep wording gateway-oriented unless the code truly shells out to a user-visible CLI command.
