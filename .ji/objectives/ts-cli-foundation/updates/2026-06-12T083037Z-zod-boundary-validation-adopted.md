# Zod boundary validation adopted across TS CLI foundation packages

## Summary

`@asdl/plans`, `@asdl/planned-branch`, and `asdl-dev` now use private Zod schemas at the targeted boundary-validation seams.

- `@asdl/plans` parses saved-plan session tool-result evidence with a private schema for the Pi/tool-result envelope and saved-plan evidence payload. Unknown session/message/detail metadata is accepted and stripped before returning project-owned evidence.
- `@asdl/planned-branch` parses successful planned-branch output details with a private schema backed by the existing `BRANCH_CREATION_METHODS` runtime list. Required evidence strings remain non-empty, optional `summary` remains string-only, and unknown metadata is accepted and stripped.
- `asdl-dev` checkpoint-message validation now originates from a private Zod string schema using custom issues. The public `CheckpointValidationResult` shape remains project-owned; Zod custom issue metadata is projected back into `CheckpointMessageIssue[]` for repair feedback.

Evidence: local working-tree diff on branch `zod-boundary-validation-cli-packages`; targeted package checks/tests passed for `@asdl/plans`, `@asdl/planned-branch`, and `asdl-dev`; `pnpm --dir ts run check`, `pnpm --dir ts run test`, and full `just` passed.

## Objective Impact

The roadmap row "Adopt Zod boundary validation in `plans`, `planned-branch`, and `asdl-dev`" is complete. This also satisfies the Objective completion criterion that boundary validation in those three packages uses Zod schemas rather than hand-rolled extractors.

The checkpoint validation risk was handled without exposing raw Zod errors: issue codes stayed project-owned and repair feedback continues through `formatCheckpointValidationFeedback`.

## Follow-Ups

- Keep the schemas private unless a concrete consumer proves a public schema API is needed.
- Continue the remaining provider-owned rows: declare the `asdl-dev` public surface/end deep imports, then consolidate reusable non-pr-address scenario-test scaffolding.
