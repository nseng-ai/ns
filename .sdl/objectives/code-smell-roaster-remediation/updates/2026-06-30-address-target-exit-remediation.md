# Address Target Payload and Exit Remediation

## Summary

Remediated the `address` code-smell cluster's confirmed structural findings while disposing one stale/not-worth-churn finding after re-probe:

- Added `ts/packages/address/src/core/pr-target-payload.ts` as the shared owner for GitHub PR target payload construction and validation.
- `download-feedback` and `pr-checks` now share `PrTargetPayload`, `prTargetPayloadSchema`, and `buildPrTargetPayload` instead of maintaining parallel target types, schemas, and builders.
- `exec-operation.ts` now exposes `prTargetFailureExit`, and the `download-feedback` and `pr-checks` operation handlers delegate their common `git_failure` / `pr_feedback_failure` / `detached_head` exit mapping to it.
- Left `json-input.ts` unchanged: re-probe found file JSON loading and missing-file/source-conflict behavior is explicitly covered by `ts/packages/address/test/unit/json-input.test.ts`, and removing it would require behavior and test-source churn outside this Objective's boundary.

Validation passed: `pnpm --dir ts --filter @sdl/address run test`, `pnpm --dir ts --filter @sdl/address run check`, `just ts-format-check`, `just ts-lint`, and `just ts-check`.

## Objective Impact

The three `references/address.md` findings now have dispositions in `roadmap.md`:

- Data Clumps in PR target payloads: fixed by the shared target payload type/schema/helper.
- Speculative Generality in `json-input.ts`: disposed because the file-input path is now existing, test-covered behavior and not worth removing for this remediation Objective.
- Repeated Switches in PR target failure exit mapping: fixed by the shared `prTargetFailureExit` helper.

This reduces the open, no-disposition finding count by 3 without changing address CLI output behavior.

## Follow-Ups

No address follow-up is known. Future address operations that resolve a GitHub PR target should reuse `buildPrTargetPayload` for target payloads and `prTargetFailureExit` for common target-resolution failure exits.
