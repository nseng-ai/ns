# Session-only planning, docs, and evidence cutover

## Summary

The remaining planning/read composed-input compatibility surfaces were removed from the TypeScript `pr-address` exec helpers:

- `classification-template` now requires `--pr-number` and resolves the manifest only from the payload session.
- `plan-feedback` now requires `--pr-number` and resolves the manifest plus validated classification only from the payload session.
- `stack-feedback-plan` now resolves latest stack prep plus per-PR classifications only from the payload session.
- `stack-feedback-diff-current` now resolves latest stack plan plus current prep only from the payload session.

Removed JSON/file/reference flags are raw usage errors; non-empty stdin to these session-only helpers returns a machine `invalid_request`. Generated JSON schema fixtures were updated for the narrowed request surfaces.

The `pr-address` skill and CLI references were rewritten to teach the session-store flow: pipeline-produced artifacts live in the payload session, while agent-authored classification, decisions, and evidence remain explicit files.

Validation: `pnpm --dir ts/packages/pr-address run test` passed, and `pnpm --dir ts/packages/pr-address run check` passed.

Real non-mutating evidence was captured without composed pipeline wrappers:

- Single PR #1567: `get-feedback`, `classification-template --pr-number`, agent-authored classification file, `validate-feedback-classification --pr-number --classification-file`, `plan-feedback --pr-number`, refreshed `get-feedback --include-resolved`, and `finalize-run --pr-number` in payload session `pr-address-session-store-evidence-single-1567`.
- Stack slice #1563/#1567: `stack-feedback-prep`, per-PR `classification-template --pr-number`, per-PR validation from agent-authored classification files, `stack-feedback-plan`, fresh `stack-feedback-prep --include-resolved`, and `stack-feedback-diff-current` in payload session `pr-address-session-store-evidence-stack-1563-1567`.

No GitHub write helper was invoked. The available real feedback was automation feedback classified as informational, so no safe actionable mutation/checkpoint tail was exercised.

## Objective Impact

The planning/read session-resolution and composed-input-removal roadmap rows are complete. The docs row is materially complete for the session-store rewrite, but remains in progress because final evidence is non-mutating: the Objective still needs either a safe real actionable target to exercise the mutation/checkpoint tail or an explicit decision that non-mutating real evidence is sufficient for closure.

The Objective's risk record is updated: the composed-input debugging affordance has now been intentionally removed across planning/read, lifecycle, and mutation surfaces, and the remaining risk is evidence completeness rather than known compatibility surface.

## Follow-Ups

- Find a safe real actionable PR/stack target for mutation/checkpoint evidence, or explicitly accept the non-mutating PR #1567 and #1563/#1567 stack evidence as sufficient.
- Keep using only `pr-address` mutation helpers for any future GitHub write evidence; do not use raw GitHub write endpoints.
