# Implicit Read Helper Resolution

## Summary

Implemented the next read-helper slice for payload-session resolution:

- `pr-address exec stack-feedback-diff-current` now resolves the latest `pr-address-stack-plan` summary artifact and latest `pr-address-stack-prep` summary artifact from the current harness payload session when invoked with empty stdin and no explicit source flags.
- `pr-address exec read-feedback-detail` now accepts `--pr-number` as an alternative to `--payload-path`, resolving the latest `pr-address-pr-<n>-feedback` raw artifact from the current payload session.
- `pr-address exec read-feedback-details` now accepts PR-number raw feedback sources through top-level `--pr-number` or selection JSON `pr_number`, while preserving selection `payload_path` compatibility.
- Session-resolved paths emit `resolved_inputs` with exact payload references; explicit/path/reference modes do not add that block.
- Touched CLI references and JSON-schema fixtures were updated for the changed command surfaces.

Validation completed before this update:

```bash
pnpm --dir ts/packages/pr-address run test -- stack-feedback-diff-current
pnpm --dir ts/packages/pr-address run test -- payload-operations
```

Both targeted invocations passed with 30 files / 409 tests.

## Objective Impact

Advances the `[~] Migrate planning and read helpers to implicit session resolution` roadmap row by moving the remaining non-mutating planning/read consumers in this slice onto payload-session lookup while keeping composed/path/reference compatibility intact.

This preserves the Objective's core boundary: implicit latest resolution is limited to read-only helpers and uses store-owned descriptor/role lookup plus auditable `resolved_inputs` facts.

## Follow-Ups

Still separate roadmap rows:

- Mutation helper migration and write-capable GitHub action boundaries.
- Batch build/checkpoint/finalization lifecycle helper migration.
- Compact stdout default migration.
- Later removal of composed/path input styles after compatibility is no longer needed.
- Full `pr-address` skill rewrite beyond the narrow helper-reference updates in this slice.
