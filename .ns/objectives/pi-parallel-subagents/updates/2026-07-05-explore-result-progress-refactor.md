# Explore Result/Progress Refactor

## Summary

A follow-on package-quality refactor for `@nseng-ai/ns-pi-subagents` split the explore extension's result formatting, progress rendering, and shared type plumbing out of the large `src/explore/extension.ts` orchestration module.

Material changes:

- Added `src/explore/result.ts` for final tool-result formatting, diagnostics, cancellation/error helpers, and direct scout-output truncation.
- Added `src/explore/progress.ts` for live progress summaries and `ns.explore.progress` widget rows.
- Added `src/explore/types.ts` for shared explore task/result/details contracts.
- Changed `dispatchExplorerSubagent` to consume a caller-provided, already validated explorer definition instead of loading the agent definition internally.
- Removed `cwd` from the dispatch intent and kept cwd ownership on `RunnerSubagentContext`.
- Updated explore tests for the new dispatch and result/progress plumbing contracts.

Validation on the implementing branch passed:

```bash
pnpm --dir ts --filter @nseng-ai/ns-pi-subagents run check
pnpm --dir ts --filter @nseng-ai/ns-pi-subagents run test
just ts-format-check
just ts-lint
just
```

PR evidence:

- PR #3005: `Refactor explore result plumbing into dedicated progress/result modules` — current open PR evidence for reducing concept density in the packaged explore extension while preserving the existing tool behavior and test coverage.

## Objective Impact

The `ns-pi-subagents` package row remains complete, and this refactor strengthens its maintainability evidence: `extension.ts` now owns orchestration/registration while result formatting and live progress presentation have clearer module ownership.

The dispatch contract also now matches the intended package boundary more closely: configuration validation loads the explorer definition once, and dispatch receives that definition as plain input rather than hiding agent-definition discovery behind a fake dependency seam.

No Objective completion criteria changed, and no non-blocking follow-on rows were completed by this slice.

## Follow-Ups

- Continue treating fleet/transcript viewer, in-process runtime adapter, and consolidation assessment as explicit remaining choices before closure: either implement a narrow slice or park them intentionally.
- If PR review on #3005 requests behavioral changes rather than refactor-only fixes, record a new update only if the Objective semantics or roadmap state changes.
