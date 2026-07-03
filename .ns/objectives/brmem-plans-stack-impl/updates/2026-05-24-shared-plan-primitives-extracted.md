# Shared Plan Primitives Extracted

## Summary

The first implementation slice extracted the existing `create-brmem-plan` persistence primitives into `ts/packages/pi-extensions/src/brmem-plans/plan-persistence.ts` while preserving current command and tool behavior.

Verification passed:

- `cd ts/packages/pi-extensions && bun test test/create-brmem-plan.test.ts`
- `cd ts/packages/pi-extensions && bun run check`

## Objective Impact

This completes the `brmem-plans/extract-shared-plan-primitives` roadmap row and establishes a reusable `brmem-plans` implementation boundary for later branch-from-plan-file work. The slice intentionally kept `/create-brmem-plan`, `persist_brmem_plan`, and namespace `plans` behavior unchanged so later no-compatibility cutover work can be reviewed separately.

## Follow-Ups

- Build the shared branch-from-plan-file core on top of the extracted primitives.
- Add focused tests for branch creation, `brmem-plans` namespace preflight/write behavior, and partial-failure reporting in the next slice.
