# Resolve-Thread Batch File Input and Shared JSON Loader Consolidation

## Summary

`resolve-thread-batch` now accepts a `--payload-file` option alongside stdin and `--payload-json`, backed by the shared `load_json_input` loader. An agent can write a large generated batch payload to a file and pass its path instead of inlining JSON in the main transcript. The shared loader gained optional file-path support (with `read_json_input_text` exposing the raw-text layer), enforces a single explicit source, and reports missing files and source conflicts as structured `invalid_request` results.

The same slice consolidates `pr-address`'s `json_sources` helpers onto the shared loader, routes the `validate-feedback-classification` wrapper path through a single `load_json_input` call, and removes duplicated file-reading, empty-check, and error-translation logic. It also hardens payload-store and lookup symlink checks so broken symlinks are rejected as symlinks rather than as missing files, and tightens several planning/classification internals (a `validate_feedback_classification_artifacts` helper that avoids re-parsing after validation, a shared `FeedbackPlanSourceItem` base, and `build-resolve-thread-batch-payload` cross-item duplicate-thread-id checking).

Evidence: landed on `master` as commit `e5bd5abb`. Unit tests cover file reads, missing/empty files, conflicting sources, and the no-stdin path; `resolve-thread-batch` scenario tests cover the file path, the `--payload-json` vs `--payload-file` conflict, and stdin fallback; broken-symlink rejection is covered for both the payload-store and lookup paths. This work was committed and merged with its own validation; no separate verification was re-run for this Objective edit.

## Objective Impact

This advances "Reduce manual GitHub mutation payload assembly" and serves the Objective's "less transcript-heavy" thesis directly: the mutation step now has a tested `@file` affordance, so a generated `resolve-thread-batch` payload can stay in a file rather than being pasted into the transcript. It also partially answers the open question about `@file`/stdin mutation affordances — that affordance now exists for `resolve-thread-batch`; the remaining question is whether a higher-level batch checkpoint helper should own mutation payload generation and per-batch evidence.

The change is progress, not closure. The mutation-assembly row stays in progress, and per-batch evidence/checkpoint support, finalization support, and a representative lower-orchestration proof remain required before the Objective can close.

## Follow-Ups

- Add per-batch evidence/checkpoint support so changed files, validation commands, commit SHAs, addressed thread IDs, mutation outcomes, and skipped items are auditable without transcript memory.
- Add finalization support for the unresolved-feedback summary path.
- Decide whether a higher-level checkpoint helper should own mutation payload generation rather than leaving agents to write payload files, then prove the lower-orchestration happy path on a representative PR-addressing run.
