# Finalization Helper

## Summary

This branch adds `pr-address exec finalize-run`, a deterministic local/read-only final verification helper. The command consumes the final compact `get-feedback` payload manifest (preferably fetched with `--include-resolved`) and the `data` objects returned by `record-batch-checkpoint`, then emits unresolved threads, unresolved unskipped work, skipped review/thread/discussion items, checkpoint summaries, failed validation evidence, and a `ready_to_stop` decision.

The helper keeps the payload discipline intact: it accepts `GetFeedbackPayloadManifest` rather than raw inline feedback, does not read raw payload artifacts, does not mutate GitHub, and does not push, commit, or create branches. The public `pr-address` skill, CLI reference, package README, and docs-site mirrors now route final handoff through `get-feedback --include-resolved` plus `finalize-run` instead of a manual reconciliation checklist.

Verification: targeted finalization scenario/unit tests passed, adjacent checkpoint/get-feedback/summary regressions passed, `pr-address exec finalize-run --json-schema` printed successfully, targeted Ruff/format/type/dprint checks passed, and full `just check` passed.

## Objective Impact

This completes the final unresolved-feedback summary roadmap row and removes the last documented manual finalization step from the improved happy path. Agents now have one tested end-state helper that distinguishes currently unresolved feedback from intentionally skipped/deferred items, preserves failed or incomplete checkpoint evidence, and returns an exit status that prevents claiming a run is complete when actionable unresolved work remains.

The public workflow documentation row is also complete: the skill and CLI reference now describe the improved helper chain from payload-backed feedback through classification, planning, mutation payload generation, batch checkpointing, and final verification.

The Objective remains open because closure still requires representative lower-orchestration evidence from a fixture, dry run, or live PR-addressing run with PR-level feedback, unresolved inline threads, discussion comments, and at least two batch types.

## Follow-Ups

- Exercise the full lower-orchestration happy path on a representative fixture, dry run, or live PR-addressing run.
- Decide later whether `finalize-run` should optionally dereference checkpoint summary artifacts directly; the normal documented path now works from checkpoint command result data.
