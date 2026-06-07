# Deterministic Feedback Planning

## Summary

The current branch adds deterministic planning for validated pr-address classifications. `pr-address exec plan-feedback` accepts the same `{ "manifest": ..., "classification": ... }` wrapper used by classification validation, validates internally before planning, and returns machine-readable execution batches rather than requiring the agent to hand-group actionable feedback.

The plan output groups actionable reviews, review threads, and discussion comments in deterministic complexity order; marks `cross_cutting` and `complex` batches as approval-required; carries exact review/thread/comment IDs, compact body locators, file/line context, covered comment IDs, authors, URLs, and reply flags; and explicitly reports informational items. Informational review threads require user decisions with `act`, `dismiss`, or `skip`; informational reviews and discussion comments remain visible without the same per-item decision gate.

Verification: targeted pr-address scenario coverage passed for planning, classification-template, and classification-validation flows; targeted Ruff checks and formatting passed; Markdown dprint checks passed.

## Objective Impact

This completes the deterministic planning roadmap slice. It removes another manual orchestration step from the normal pr-address path: after classification validation, future agents can call `plan-feedback` and display the helper-produced batches and informational decisions instead of reconstructing batch membership, approval gates, and exact identities from scratch.

The public `pr-address` skill and CLI reference now route the workflow through `plan-feedback` after validation, so the improved happy path is documented alongside the existing payload, selected-detail, validation, and mutation-helper guarantees. The broader Objective remains open because mutation skeletons/checkpoints, per-batch evidence, finalization, and a representative lower-orchestration proof remain incomplete.

## Follow-Ups

- Continue reducing mutation payload assembly through skeletons, checkpoints, or higher-level helpers that consume planned batch identities after each commit.
- Add per-batch evidence/checkpoint support for changed files, validation commands, commit SHAs, addressed IDs, and skipped items.
- Add finalization support and then prove the lower-orchestration happy path on a representative PR-addressing run.
