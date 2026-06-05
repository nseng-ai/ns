# Planned-Branch Operation Model Implemented

## Summary

The planned-branch-owned operation model for CMUX composition is implemented. `@asdl/planned-branch` now owns create-operation derivation, planned-branch dry-run preview rendering, shared success evidence formatting, and planned-branch failure context. CMUX dispatch now composes those helpers and keeps only CMUX-specific responsibilities: selecting the current session saved plan, previewing/performing slot checkout, opening the CMUX workspace, and reporting CMUX recovery guidance.

## Objective Impact

This completes the roadmap row, "Planned-branch-owned operation model for CMUX composition." The implementation preserves the intended `/cmux:workspace:dispatch-plan` behavior while reducing CMUX ownership of planned-branch internals:

- branch, key, namespace, summary normalization, and create parameters are derived through `buildPlannedBranchCreateOperation`;
- dry-run git/gt/brmem mutation-command preview text is rendered by `formatPlannedBranchCreatePreview` in the planned-branch package;
- success evidence formatting is shared through `formatPlannedBranchEvidence` and reused by the planned-branch CLI and CMUX dispatch;
- planned-branch creation failure context is shared through `formatPlannedBranchCreateFailure`, with CMUX appending only the CMUX-specific `No CMUX slot was opened.` recovery line;
- CMUX dispatch no longer performs its own non-dry-run `git rev-parse HEAD` lookup before invoking planned-branch creation.

Evidence considered: working-tree diff on `planned-branch-cmux-operation-model` against Graphite parent `canonical-saved-plan-resolver`, with changes limited to planned-branch package helpers/tests, CMUX dispatch composition/tests, and this Objective update. PR evidence was not available for this branch and was not required.

Verification: `cd ts/packages/planned-branch && bun test`, `cd ts/packages/pi-extensions && bun test`, `just ts-check`, and `just ts-test` passed.

## Follow-Ups

Continue with the remaining roadmap rows. The next high-value cleanup is the unified Branch Memory envelope parsing row, followed by CLI/type-contract cleanup, shared content-slug derivation, semantic gateway boundaries, and public skills/docs accuracy.
