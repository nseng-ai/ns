# CP/Newbr Extension Deepening

## Thesis

PR #649 introduced `/cp` and `/newbr` as useful Pi extension commands, but the first implementation leaves several architectural seams too wide or implicit. This Objective exists to prioritize and work through the narrow PR #649 follow-up: deepen the checkpoint and new-branch Modules so `/cp` and `/newbr` gain locality, leverage, and behavior-first tests without expanding into a broad Pi-extension refactor.

The first implementation slice should be the checkpoint seam plus pending worktree snapshot, because both commands depend on it and it reduces the current Pi-runtime leak before changing Graphite branch-creation safety.

## Scope

In scope:

- The PR #649 `/cp` and `/newbr` Pi extensions and discovery adapters:
  - `.pi/extensions/cp.ts`
  - `.pi/extensions/newbr.ts`
  - `ts/packages/pi-extensions/src/cp.ts`
  - `ts/packages/pi-extensions/src/newbr.ts`
- The core Modules added for checkpoint and new-branch behavior:
  - `ts/packages/pi-extensions/src/checkpoint-flow.ts`
  - `ts/packages/pi-extensions/src/checkpoint-message.ts`
  - `ts/packages/pi-extensions/src/checkpoint-pi.ts`
  - `ts/packages/pi-extensions/src/pending-worktree.ts`
  - `ts/packages/pi-extensions/src/newbr-flow.ts`
  - `ts/packages/pi-extensions/src/newbr-transaction.ts`
  - `ts/packages/pi-extensions/src/branch-slug.ts`
  - `ts/packages/pi-extensions/src/newbr-preparation.ts`
- The tests for those Modules:
  - `ts/packages/pi-extensions/test/checkpoint-flow.test.ts`
  - `ts/packages/pi-extensions/test/checkpoint-message.test.ts`
  - `ts/packages/pi-extensions/test/pending-worktree.test.ts`
  - `ts/packages/pi-extensions/test/newbr-flow.test.ts`
  - `ts/packages/pi-extensions/test/newbr-transaction.test.ts`
  - `ts/packages/pi-extensions/test/newbr-preparation.test.ts`
- Prioritizing and dispositioning the six PR #649 deepening candidates:
  1. Checkpoint command Module seam and pending worktree snapshot.
  2. New-branch transaction safety and test surface.
  3. Shared small-model drafting policy.
  4. Explicit Graphite branch-creation Adapter inside `/newbr`.
  5. Branch naming policy depth.
  6. Test surface cleanup for behavior-first fakes and safety-critical ordering.
- Local fake adapters or harnesses in the existing TypeScript test style.
- Related context from `.asdl/objectives/pi-extension-deepening/`, used only as background unless later work needs an explicit cross-reference.

## Non-Goals

- Do not absorb the broader `pi-extension-deepening` Objective into this one.
- Do not redesign Pi core, Pi extension discovery, or the whole `ts/packages/pi-extensions/` package.
- Do not promote unrelated vibecoded extensions or change `/submit`, `/land-stack`, Objective commands, runner subagents, or worktree status as part of this Objective.
- Do not create a universal TypeScript fake framework or broad test DSL unless a production seam proves the need.
- Do not introduce Graphite dependencies outside `/newbr`'s explicit user-facing Graphite contract.
- Do not extract shallow pass-through Modules merely to reduce duplicated lines.

## Completion Criteria

This Objective can close when all of the following are true:

- All six PR #649 candidates listed in Scope have a recorded disposition: implemented, rejected with reason, parked with rationale, or split into a follow-on Objective.
- The first accepted slice, checkpoint seam plus pending worktree snapshot, is implemented or deliberately rejected with evidence.
- Accepted refactors preserve `/cp` and `/newbr` behavior and improve locality or leverage by the deletion test.
- Tests use behavior-first fake adapters or local harnesses, with command-order assertions only where the order is the safety guarantee.
- Validation for TypeScript changes passes, at minimum `bun run --cwd ts check` and `bun run --cwd ts test`.
- If new Graphite branch-creation behavior is changed, the relevant Graphite guidance has been consulted and failure/rollback behavior is covered.
- A human explicitly agrees that the PR #649 follow-up has been completed or split sufficiently.

## Assumptions and Risks

Assumptions:

- `cp-newbr-extension-deepening` is a durable Objective identity for the narrow PR #649 follow-up, not a replacement for `pi-extension-deepening`.
- The highest-leverage first slice is the checkpoint seam plus pending worktree snapshot because both `/cp` and `/newbr` depend on checkpoint preparation and worktree facts; implementation evidence now confirms the seam passes the deletion test for branch/status/diff/clean/detached-head facts and shared checkpoint preparation.
- The existing TypeScript package style supports local fake adapters and harnesses; Candidate 1 used local harnesses without requiring a universal fake framework.
- Some command-order assertions remain appropriate when ordering is itself the safety invariant, such as prepare-before-stash, stash-before-Graphite-create, and restore-before-commit.
- Candidate 2 confirms the new-branch transaction seam passes the deletion test: removing `newbr-transaction.ts` would push stash-ref lookup, Graphite-create rollback, restore-failure handling, typed transaction outcomes, and commit-stop rules back into `newbr-flow.ts` and its tests.
- `/newbr`'s Graphite dependency is acceptable because Graphite is part of the explicit user-facing command contract; Candidate 2 kept `gt create` local to `/newbr` rather than introducing a generic Graphite adapter.
- Branch naming alone was too narrow for the next slice; implementation evidence now confirms a holistic `/newbr` preparation boundary passes the deletion test by producing a typed plan before `newbr-transaction.ts` applies it.
- Candidate 3 remains parked as a standalone shared model-policy extraction because checkpoint message drafting and branch slug drafting still have different call paths, and the preparation boundary localized slug drafting without exposing unavoidable duplication.

Risks:

- Premature extraction remains the main architectural risk for later candidates. Candidate 1 is de-risked by the deletion test: removing `pending-worktree.ts` or `checkpoint-pi.ts` would push shared git fact gathering or checkpoint Pi adapter behavior back into `/cp`, `/newbr`, and their tests.
- Graphite/stash rollback behavior remains safety-critical, but Candidate 2 de-risked the main failure edges by making stash failure, missing stash refs, Graphite-create rollback, restore failures, and commit failures explicit typed outcomes.
- Model-auth and provider policy could drift if checkpoint message drafting and branch slug drafting continue to use unrelated implementations. Candidate 1 centralized checkpoint drafting policy in `checkpoint-pi.ts`, and the preparation boundary now localizes branch slug drafting in `newbr-preparation.ts`; shared provider/model policy remains an accepted future risk rather than a justified Module in this Objective.
- Branch naming could have stayed shallow if sanitation, fallback, suffixing, and availability checks remained split across tiny Modules. The preparation boundary de-risks that by owning prompt rules, fallback slug selection, branch availability, suffixing, and checkpoint readiness while keeping `branch-slug.ts` as a small primitive.
- Tests could still overfit shell choreography instead of workflow outcomes, but Candidate 2 moved detailed rollback/outcome coverage into transaction-level tests and the preparation boundary moved slug/fallback/suffix cases into typed preparation tests. Flow-level assertions now focus on user-visible messages and safety ordering.

## Open Questions

None remaining for this Objective. Future provider/model/auth policy for checkpoint drafting and branch slug drafting should become a separate Objective only if another cross-command need appears.

## Closure

Closed as completed for the narrow PR #649 follow-up. The six deepening candidates have recorded dispositions in `candidate-dispositions.md`: checkpoint seam and pending worktree snapshot implemented, new-branch transaction boundary implemented, shared small-model drafting policy parked, standalone Graphite adapter folded into the transaction boundary, standalone branch naming policy parked while its useful responsibilities moved into the preparation boundary, and behavior-first test surface applied without a universal fake framework.

Key evidence: `pending-worktree.ts`, `checkpoint-pi.ts`, `newbr-transaction.ts`, and `newbr-preparation.ts` now own the seams that passed the deletion test; `/cp` and `/newbr` behavior is preserved with thinner command workflows; transaction rollback and preparation outcomes have typed tests; and validation passed with `bun run --cwd ts check`, `bun run --cwd ts test`, and `just dprint-check` across the accepted TypeScript slices.

Remaining caveats are intentionally outside this Objective: shared provider/model/auth policy should wait for a future cross-command need, broader Pi extension architecture belongs to `pi-extension-deepening`, and a universal TypeScript fake framework remains unjustified by current evidence. This closure is the explicit human decision that the PR #649 follow-up is complete enough to close.
