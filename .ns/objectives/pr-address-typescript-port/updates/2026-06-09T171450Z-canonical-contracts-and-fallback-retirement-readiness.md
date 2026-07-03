# Canonical Contracts and Fallback Retirement Readiness

## Summary

The latest TypeScript slice extracted feedback manifest and plan-feedback contracts into canonical Zod-first modules and submitted the work as PR #1180.

Durable implementation meaning if this branch lands:

- Feedback manifest schemas now live in `feedback-manifest-contracts.ts`, including payload references, domain/body locators, review manifest items, review-thread/comment manifest items, discussion comment manifest items, and get-feedback/prepare-run manifest shapes.
- Feedback plan schemas now live in `feedback-plan-contracts.ts`, including action complexity values, informational reasons, source-kind variants, action/informational plan items, batches, counts, validation results, canonical plan result parsing, and a legacy-compatible consumer schema.
- `classification-core.ts` now produces typed plan action and informational items rather than laundering plan output through `unknown[]` and `Record<string, unknown>`.
- `classification-schemas.ts` now builds the `plan-feedback` JSON schema document from the canonical runtime schema instead of generic unknown-object placeholders.
- Downstream consumers such as resolve-thread batch payloads, batch checkpoints, finalization, and stack-feedback diff compose canonical plan/manifest schemas where compatible while preserving broader legacy input parsing where needed.
- Contract tests now prove representative `plan-feedback` output parses the canonical schema, generated schema output exposes concrete item fields, and body locators preserve `item_pointer: null`.

Validation evidence: `pnpm --dir ts/packages/pr-address run check` passed and `pnpm --dir ts/packages/pr-address run test` passed for the TypeScript `pr-address` package.

This evidence also answers the immediate deletion-readiness question: the Python `asdl-pr-address` implementation is still present and broad deletion is not ready. Python remains the compatibility path for unported operations and public invocation surfaces, including `prepare-run`, `summarize-feedback`, default payload-writing `get-feedback`, `stack-feedback-prep`, `stack-feedback-plan`, `build-stack-resolve-thread-payloads`, `read-feedback-details`, public `record-batch-checkpoint` artifact behavior, operation-specific `--json-schema` routes that still return fallback, installed/prod skill wrapper mode, rollback via pinned Python fallback, and the `asdl pr-address ...` plugin.

## Objective Impact

This strengthens the completed classification/planning row and the in-progress payload/finalization row by making the core feedback contracts canonical in TypeScript without changing public runtime JSON shapes.

It reduces schema/document drift risk for `plan-feedback` and clarifies the future fallback-retirement boundary: fallback can shrink per operation after TypeScript parity and public invocation evidence exist, but deleting the Python package wholesale would still violate the Objective's compatibility and rollback requirements.

The Python fallback retirement row remains open. The evidence is now sharper: contract canonicalization is progress toward retirement, not deletion readiness.

## Follow-Ups

- Continue retiring fallback per operation only after TypeScript parity, schema/envelope behavior, wrapper routing, and rollback evidence are present.
- Port or explicitly retire the remaining fallback-backed operations and schema routes before considering broad Python package deletion.
- Decide npm/prod installed-skill execution and rollback behavior before changing installed wrapper defaults away from Python.
- Prove or replace `asdl pr-address ...` plugin compatibility before removing the Python plugin path.
- Keep mutation atomicity/retry semantics, GitHub ID typing, and process-runner robustness as separate follow-up work rather than mixing them into the contract canonicalization slice.
