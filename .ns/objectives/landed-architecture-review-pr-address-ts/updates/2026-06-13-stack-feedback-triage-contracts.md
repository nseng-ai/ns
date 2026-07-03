# Stack-Feedback Triage and Contracts Slice Landed

## Summary

The stack-feedback consolidation slice is implemented. `ts/packages/pr-address/src/stack-feedback-triage.ts` is now the single owner for discussion-triage markers, Zod schemas, public triage types, hint classification, and summary building. `stack-feedback-prep-core.ts` imports that owner instead of carrying its own duplicate marker list, hint schemas, triage item/result interfaces, and summary helpers.

Stack-feedback contracts are split by owner: prep input/result and diff-current-compatible prep schemas live in `stack-feedback-prep-contracts.ts`; plan payload/result schemas and plan result interfaces live in `stack-feedback-plan-contracts.ts`; the old `stack-feedback-contracts.ts` is reduced to explicit named compatibility re-exports. `stack-feedback-plan.ts` now builds a local discussion-triage index and asks that abstraction whether a discussion item is automation-like instead of repeatedly scanning through `prep.stack[].discussion_triage.items[]`. `stack-feedback-diff-current.ts` imports producer-owned plan/prep schemas instead of maintaining private re-derived plan/prep wire schemas.

Verification: `pnpm --dir ts --filter @asdl/pr-address run check` passed; `pnpm --dir ts --filter @asdl/pr-address run test` passed; full `pnpm --dir ts run check` passed; full `pnpm --dir ts run test` passed; `git diff --check` passed.

## Objective Impact

Marks the stack-feedback prep/plan consolidation roadmap row complete and also resolves the parked question about decomposing the stack-feedback contracts hub. This de-risks the Objective's hidden-coupling concern for stack-feedback discussion triage and contract ownership while preserving CLI command semantics and leaving the separate operation-schema/Python-parity gate untouched.

The Objective remains open because payload-store deepening, shallow pass-through absorption, and the gated schema-collapse row remain active work.

## Follow-Ups

- Continue with the payload-store/filesystem-seam slice or the shallow pass-through absorption slice.
- Keep the `operation-schemas/` mirror collapse gated on Python `--json-schema` parity retirement; this stack-feedback slice intentionally did not collapse that layer.
- Treat any future broadening of `stack-feedback-contracts.ts` as ownership drift; new stack-feedback contracts should live with the producing concept unless a compatibility seam is explicitly justified.
