# PR Previews Command/Log Remediation

## Summary

Re-probed the `local-pi-tools` / `pr-previews` command sub-slice and confirmed both smaller command-level smells were still present: `preview-checks-command.ts` still mixed PR-check command/view orchestration with GitHub Actions log loading and LLM summarization, and checks/feedback commands each carried their own missing-target message helper.

The slice fixed both without touching tests or the larger modal-chrome duplication:

- `preview-check-logs.ts` now owns GitHub Actions log URL parsing, incomplete/unavailable-log handling, `gh` log loading, log-line normalization, and model summarization. `preview-checks-command.ts` now imports `loadCheckLogs` and re-exports the moved helper functions to preserve the existing import surface.
- `preview-view-utilities.ts` now owns `missingPreviewTargetMessage`, and both checks and feedback commands call it instead of maintaining divergent local copies.

Validation passed on 2026-07-01: `pnpm --dir ts --filter @local-pi-tools/pr-previews run check`, `pnpm --dir ts --filter @local-pi-tools/pr-previews run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

This reduces the open `local-pi-tools` findings by disposing the `pr-previews` Divergent Change in `preview-checks-command.ts` and the duplicated missing-target message logic between the checks and feedback commands. The higher-risk `PrPreviewChecksView` / `PrPreviewFeedbackView` modal chrome duplication remains open for a later, separate `pr-previews` slice.

## Follow-Ups

- Leave the high duplicated modal chrome finding in `pr-previews` for a dedicated slice; it should not be bundled with this command/log extraction.
