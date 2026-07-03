# Closeout Guidance and Closure

## Summary

The closeout pass aligned current-facing guidance with the already-landed download-only implementation state.

Changes made:

- `@asdl/pr-address` README now describes the package as a current tiny read-only downloader and the retired workflow engine as deleted from the current CLI.
- Active `pr-address` skill guidance and references no longer describe `map-branch-prs` as a deletion-transition helper or say retired workflow families are merely scheduled for deletion.
- `/code:pr-feedback-watch` parity wording now describes downloader-only triage prompt injection and portable read-only feedback download/normalization, not a constrained mutation workflow.
- The roadmap now marks stack-address retirement, watcher retargeting, old workflow deletion, and Objective closeout complete.

Validation run:

- `pnpm --dir ts --filter @asdl/pr-address run check`
- `pnpm --dir ts --filter @asdl/pr-address run test`
- `pnpm --dir ts --filter @asdl/pi-extensions run check`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/pi-extensions/test/pr-feedback-watch.test.ts packages/pi-extensions/test/pr-download-feedback.test.ts`

`just dprint-check` was attempted but found an unrelated pre-existing formatting issue in `.asdl/objectives/ts-toolchain-eve-parity-triage/roadmap.md`. Per repo guidance, `just dprint-fix` was run and passed `just dprint-check`; the unrelated formatter edit was then reverted to keep this Objective update scoped to `pr-address-strangler-rewrite`.

## Objective Impact

The Objective is complete. Current active guidance now routes agents to `/pr:download-feedback` and `/pr:download-stack-feedback`; the retained `pr-address` CLI exposes only read-only downloader primitives plus minimal stack-download plumbing; `/code:pr-feedback-watch` no longer implies payload-session, classification/planning, mutation, checkpoint, or finalization semantics.

The Objective was closed with outcome `completed`. Remaining ownership and future addressing-workflow questions are parked follow-ups, not blockers for this deletion-first Objective.

## Follow-Ups

- If a full addressing workflow is needed again, create a new Objective with a fresh contract on top of the downloader foundation.
- If downloader ownership should move out of `pr-address`, create a separate migration Objective; do not reopen the retired workflow engine.
- Resolve the unrelated dprint formatting issue in `.asdl/objectives/ts-toolchain-eve-parity-triage/roadmap.md` under that Objective or as a repo-formatting cleanup.
