# Strict Claim Verification Pass

## Summary

A stricter `objective-branch-refresh` pass treated the Objective's material claims as untrusted and verified them against current repository ground truth. The remaining active `pr-address` scope is supported: `ts/packages/pr-address/src/core/` and the downloader/gateway surface exist; old mutation helpers and `read-feedback-detail`/payload-store/session files are absent from current `ts/packages/pr-address/src`; `reviewThreadPageArgs` and `reviewThreadCommentPageArgs` still pass string GraphQL variables through `-F`; `numericId` still coerces unparseable IDs to `0` and review/discussion comments with id `0` are filtered after normalization; `gateways.ts` and `index.ts` still contain re-export surfaces; `stdoutModeRequestShape` is absent.

Provenance: objective-branch-refresh basis tip=3550f03b2d551602fc5e4a6fdad2dba376cec8f2 from=ef9cc9aa61b46aedf07c90d8032f8e61cde9838e

## Objective Impact

The active scope remains relevant, but stale line-number references for the `numericId` finding were removed from durable prose and roadmap rows. The Objective now points at the durable functions/behavior instead of brittle historical line numbers.

## Follow-Ups

- Keep using function/symbol/path evidence rather than line-number evidence for future hardening updates.
- Re-run the same scoped probes before implementation if more `pr-address` strangler work lands first.
