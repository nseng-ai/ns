# Handoff: Reexamine Saved-Plan Data Composition

Continuation focus: Reexamine all interface inheritance among the raw data structures in `ts/packages/incubating/extensions/plans/src/saved-plan-file.ts` and decide where composition better represents the domain.

## Context

PR #4279 (`publish-saved-plans-through-hidden-cli`) publishes Saved Plans through the hidden CLI. Review feedback questioned `DurableSavedPlanBase extends PlanStoreDirectoryEvidence`, prompting a local, uncommitted change to compose directory evidence instead. Continue that inquiry across the rest of the file rather than treating the one reviewed type in isolation.

## Current State

- The worktree has uncommitted changes in:
  - `ts/packages/incubating/extensions/plans/src/saved-plan-file.ts`
  - `ts/packages/incubating/extensions/plans/src/cli.ts`
  - `ts/packages/incubating/extensions/plans/src/plan-store-gateway.ts`
- `DurableSavedPlanBase` now has `directory: PlanStoreDirectoryEvidence` rather than extending it.
- `savePlanContentBytes()` returns that composed shape, and `savedPlanJson()` in `cli.ts` deliberately flattens it at the CLI serialization seam.
- The gateway change separately restructures exclusive writing around an inner `writeAndClose()` function so the acquired file handle is a `const`; preserve it unless this continuation explicitly broadens scope.
- No commit was created.
- Formatting, typecheck, lint, focused hidden-save scenarios, and focused real-gateway write tests passed. The full plans test runs exposed existing branch inconsistencies around legacy filename/list behavior; do not attribute those failures to the composition change without revalidation.

## Decisions / Findings

- Prefer semantic composition when one raw datum contains evidence about another concept rather than being substitutable for it.
- Preserve flat external wire formats where they are already the command contract; flatten composed domain data at the CLI serialization seam.
- Current remaining inheritance sites in `saved-plan-file.ts` are:
  - `PlanStoreDirectoryEvidence extends PlanStoreRepoEvidence`
  - `SavedPlanListItem extends PlanStoreRepoEvidence`
  - `LatestSavedPlanFileEvidence extends PlanStoreDirectoryEvidence`
  - `TimestampedDurableSavedPlan extends DurableSavedPlanBase`
  - `LegacyDurableSavedPlan extends DurableSavedPlanBase`
- Do not mechanically replace every `extends`. For each relationship, ask whether it represents honest substitutability, variant refinement, or containment of distinct evidence. Consider call-site ergonomics, structural assignability, serialization contracts, and whether changes improve locality rather than merely nesting fields.
- The repo vocabulary defines **Plan Store Directory Evidence** as repository identity, source branch, encoded path keys, and directory path facts used to validate Saved Plan evidence. Use that domain meaning when evaluating containment.

## Next Steps

1. Inventory constructors, consumers, exports, and tests for each inherited data shape in `saved-plan-file.ts`.
2. Classify each inheritance relationship as substitutability, discriminated-variant refinement, or containment.
3. Design the smallest coherent composition model; pay special attention to repo evidence versus directory evidence versus plan/file data.
4. Decide whether the timestamped/legacy variants should retain a shared interface, use intersections, or compose shared plan data.
5. Update domain constructors and consumers together, keeping hidden CLI JSON flat unless intentionally changing its contract.
6. Add or update focused tests that assert the chosen domain shape and CLI serialization independently.
7. Run formatting, lint, typecheck, package tests, and relevant integration tests. Revalidate and separately report baseline legacy-list failures if they remain.
8. Do not commit unless explicitly requested.

## Investigation Sources

- Source session ID: 01a02af6-0bd6-7e12-8913-6e566e76727c
- Source session log: /Users/schrockn/.pi/agent-ns-dev/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-09--/2026-08-22T19-32-43-094Z_01a02af6-0bd6-7e12-8913-6e566e76727c.jsonl
- Related files:
  - `ts/packages/incubating/extensions/plans/src/saved-plan-file.ts` — owns the raw evidence and durable-plan data structures under review.
  - `ts/packages/incubating/extensions/plans/src/cli.ts` — serializes composed domain results into the existing flat hidden-CLI contract.
  - `ts/packages/incubating/extensions/plans/src/api.ts` — curates exported plan data types for downstream consumers.
  - `ts/packages/incubating/extensions/plans/src/index.ts` — package-root compatibility exports for the same types.
  - `ts/packages/incubating/extensions/plans/src/saved-plan-selection.ts` — consumes directory and saved-plan evidence extensively.
  - `ts/packages/incubating/extensions/plans/CONTEXT.md` — defines Saved Plan and Plan Store Directory Evidence vocabulary.
  - `ts/packages/incubating/extensions/plans/test/scenario/cli.test.ts` — pins hidden CLI save/list/resolve wire output.
  - `ts/packages/incubating/extensions/plans/test/integration/plan-store-gateway.test.ts` — exercises durable save results and real filesystem behavior.
  - `ts/packages/incubating/extensions/plans/test/saved-plan-selection.test.ts` — constructs and validates directory/file evidence shapes.

## Useful Commands / Files

- PR: https://github.com/nseng-ai/ns/pull/4279
- Inspect inheritance: `rg -n '^(export )?interface .* extends ' ts/packages/incubating/extensions/plans/src/saved-plan-file.ts`
- Inspect current local changes: `git diff -- ts/packages/incubating/extensions/plans/src/saved-plan-file.ts ts/packages/incubating/extensions/plans/src/cli.ts ts/packages/incubating/extensions/plans/src/plan-store-gateway.ts`
- Validate types: `just ts-check`
- Validate formatting and lint: `just ts-format-check && just ts-lint`
- Package tests: `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts --filter @nseng-ai/plans test`
