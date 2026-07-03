# Autobranch Failure Locality Slice Completed

## Summary

Autobranch shared flow result types moved out of the dirty-worktree flow into `ts/packages/capabilities/flow/src/autobranch/flow-result.ts`. Latest-commit preparation and transaction failure classification/formatting now live with their owning result arms in `latest-commit-preparation.ts` and `latest-commit-transaction.ts`; the separate `latest-commit-formatting.ts` central switch file was deleted. Dirty transaction failure formatting moved into `dirty-transaction.ts`, and dirty/latest orchestrators now read as the same prepare → transact → classify/format flow shape.

Validation evidence:

- Slice-local targeted validation passed during implementation: `pnpm --dir ts --filter sdl-flow test -- test/autobranch test/scenario/autobranch-command.test.ts test/scenario/branch-latest-commit-command.test.ts` (36 files / 360 tests in that run), `pnpm --dir ts --filter sdl-flow run check`, `pnpm --dir ts run fmt:check`, `pnpm --dir ts run lint`, and `git diff --check`.
- Combined targeted Flow validation later passed: 36 files / 361 tests covering land-stack, autobranch, and PR-description scenarios.
- Full TS validation later passed: `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-test-integration`, `just ts-test-typescript-style-guard`, and `just ts-deps-check`.

## Objective Impact

Completes the roadmap row "Give each autobranch failure one home". The shared public-ish result contract no longer lives in `dirty-worktree.ts`, latest-commit refusal guardrails remain refusal outcomes, and each failure arm's verdict/message is now local to the module that defines the failure data.

## Follow-Ups

None for this slice before review.
