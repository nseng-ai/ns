# Classification Deep Module Landed

## Summary

The first roadmap slice is implemented: `ts/packages/pr-address/src/classification.ts` now owns the feedback-classification schemas, manifest-view construction, validation, planning, and template building. The former `classification-shared.ts`, `classification-validation.ts`, `classification-planning.ts`, and `classification-template.ts` leaf modules are removed, and the previously exported `validateFeedbackClassificationArtifacts` helper is gone; validation artifacts are private pipeline state inside the deep module.

Public callers now use the curated classification surface: `classificationLocatorSchema`, `validateFeedbackClassification`, `planFeedback`, `buildFeedbackClassificationTemplate`, and the externally consumed result/error types. CLI adapter behavior remains in `classification-operations.ts`.

Verification: `pnpm --dir ts run check` passed; `pnpm --dir ts run test` passed. A final source/test sweep found no references to the old leaf module paths or leaked helper.

## Objective Impact

Marks the top, ungated classification roadmap row complete and de-risks the hidden-coupling concern for this slice. The Objective remains open because stack-feedback consolidation, payload-store deepening, pass-through absorption, and schema-collapse/gate resolution remain active or parked work.

## Follow-Ups

- Continue with the next independent deepening slice rather than expanding the classification refactor further.
- Keep the schema-collapse row gated on Python `--json-schema` parity retirement unless that gate changes.
