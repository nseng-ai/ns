# Context-profiler Helper Dedupe Remediation

## Summary

The context-profiler helper-deduplication sub-slice re-probed two findings from `references/local-pi-tools.md` and fixed both without behavior changes:

- `analysisVerdictFields` is now exported from `model.ts` and reused by `interrogation-prompt.ts`, so episode scope construction no longer repeats the optional `efficiency` / `relevance` / `analysisSummary` projection.
- `dedupeAndCapBySnappedTurn` now centralizes the snapped-turn dedupe, sort, and cap mechanics shared by `repairEpisodes` and `repairDelegations`, while preserving episode first-turn fallback behavior and delegation caps.

Validation passed: `pnpm --dir ts --filter @local-pi-tools/context-profiler run check`, `pnpm --dir ts --filter @local-pi-tools/context-profiler run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

This reduces the open local-pi-tools/context-profiler backlog by two medium-severity duplicated-code findings. The separate high-severity `view.ts` repeated frame-switch finding remains open for a later TUI behavior-map slice.

## Follow-Ups

- Continue the local-pi-tools row with the remaining context-profiler `view.ts` repeated-switch finding or another open cluster/sub-slice.
