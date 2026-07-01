# Branch Context Smell Remediation

## Summary

Remediated the `branch-context` code-smell cluster's three confirmed structural findings:

- `operations.ts` now classifies branch-context errors through one `classifyBranchContextError` function that returns code and data together, replacing parallel error-class cascades.
- `branch-memory.ts` now exposes `throwBranchContextBrmemError` and `unwrapBranchContextBrmemResult`, and attach/load/list/delete paths reuse those helpers for the repeated Brmem result unwrap-or-throw shape.
- `testing/index.ts` now shares fake branch-context cache synchronization through `InMemoryBranchMemoryGateway.recordEntryWriteResult`, used by both `putEntry` and `createEntry`.

Validation passed: `pnpm --dir ts --filter @sdl/branch-context run check`, `pnpm --dir ts --filter @sdl/branch-context run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

The three `references/branch-context.md` findings are now dispositioned as fixed in `roadmap.md`:

- Repeated Switches in branch-context error exit classification: fixed by a single code/data classifier.
- Duplicated Brmem result unwrap handling: fixed by shared branch-context Brmem error/unwrap helpers.
- Duplicated fake put/create cache update logic: fixed by one shared cache-update helper.

This reduces the open, no-disposition finding count by 3 without changing branch-context CLI or Branch Memory behavior.

## Follow-Ups

No branch-context follow-up is known. Future branch-context Brmem result call sites should use `unwrapBranchContextBrmemResult` or `throwBranchContextBrmemError` when preserving the existing throw-message behavior.
