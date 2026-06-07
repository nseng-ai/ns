# Resolve-Thread Batch Payload Helper

## Summary

This branch adds `pr-address exec build-resolve-thread-batch-payload`, a deterministic, non-mutating helper that consumes `plan-feedback` output, one selected batch ID, the batch commit SHA, and explicit per-thread `resolve` / `skip` decisions. The helper validates decisions against the selected plan batch and returns either a ready `resolve-thread-batch` payload, a valid no-payload result, or structured semantic errors with no GitHub mutation.

The builder preserves the existing mutation boundary: canonical reply formatting and GitHub resolution still belong to `resolve-thread-batch`, while this helper owns plan/batch identity checks, missing/duplicate decision checks, skipped-thread evidence, ignored non-thread batch items, mode/message/commit validation, and payload compatibility validation.

Verification evidence is tracked in scenario coverage for ready payload generation, explicit skip handling, non-thread no-payload batches, invalid resolve fields, thread mismatches, malformed JSON, and compatibility with the mutating batch helper. The public `pr-address` skill and CLI reference now route future agents through the builder before calling `resolve-thread-batch`.

## Objective Impact

This advances “Reduce manual GitHub mutation payload assembly.” Future agents no longer need to hand-author the `resolve-thread-batch` JSON shape directly after a batch commit; they provide the judgment fields that remain semantic (`mode`, `message`, `commit_sha`, and explicit skips), and the CLI helper builds the tested mutation payload shape.

The broader Objective remains open. Per-batch checkpoint/evidence support, finalization support, and a representative end-to-end lower-orchestration proof are still separate roadmap items.

## Follow-Ups

- Add per-batch evidence/checkpoint support for changed files, validation commands, commit SHAs, addressed IDs, GitHub mutation outcomes, and skipped items.
- Add finalization support for unresolved feedback summaries.
- Prove the lower-orchestration happy path on a representative PR-addressing run.
