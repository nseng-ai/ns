# Classification Core Parity

## Summary

The managed-stack classification branch ported the deterministic classification/planning core into `ts/packages/pr-address`.

TypeScript now directly handles these `pr-address exec` operations:

- `classification-template`
- `validate-feedback-classification`
- `plan-feedback`

The implementation reuses the local runtime/schema seams from the previous branch: operation registry dispatch, legacy fallback for unrelated operations, stdin/inline/file JSON input handling, Clinkr-compatible JSON envelopes and exit-code mapping, and local Zod schema emission. Full behavior is covered by the existing Python golden fixture families instead of newly rewritten fixtures.

Validation evidence:

- `pnpm --dir ts/packages/pr-address run test` passed with the classification golden parity suite included.
- `pnpm --dir ts/packages/pr-address run check` passed.
- Targeted CLI probes confirmed the three managed operations emit top-level `input_json_schema` and `output_json_schema` documents.
- Targeted CLI probes confirmed managed JSON envelopes for valid `validate-feedback-classification` and `plan-feedback` fixture inputs.

## Objective Impact

This completes the roadmap rows for `classification-template` and for validation/deterministic planning on top of the first-slice seams.

The TypeScript port now has proven operation parity for the pure classification/planning slice while keeping legacy Python fallback active for unported payload, GitHub-backed, mutation, wrapper/distribution, and cutover surfaces.

## Follow-Ups

- Continue with non-GitHub-mutating payload, detail, batch-payload, checkpoint, and finalization helpers.
- Reuse the classification validation/planning types only where they fit the next operation families; do not generalize them into a shared framework prematurely.
- Keep fallback retirement per-operation and evidence-backed rather than deleting broad Python paths.
