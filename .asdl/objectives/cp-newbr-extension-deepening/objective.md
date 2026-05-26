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
  - `ts/packages/pi-extensions/src/newbr-flow.ts`
  - `ts/packages/pi-extensions/src/branch-slug.ts`
- The tests for those Modules:
  - `ts/packages/pi-extensions/test/checkpoint-flow.test.ts`
  - `ts/packages/pi-extensions/test/checkpoint-message.test.ts`
  - `ts/packages/pi-extensions/test/newbr-flow.test.ts`
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
- The highest-leverage first slice is the checkpoint seam plus pending worktree snapshot because both `/cp` and `/newbr` depend on checkpoint preparation and worktree facts.
- The existing TypeScript package style supports local fake adapters and harnesses; a single universal fake framework is not required for this Objective.
- Some command-order assertions remain appropriate when ordering is itself the safety invariant, such as prepare-before-stash, stash-before-Graphite-create, and restore-before-commit.
- `/newbr`'s Graphite dependency is acceptable because Graphite is part of the explicit user-facing command contract.

Risks:

- Premature extraction is the main architectural risk. The guardrail is the deletion test: a new seam should concentrate behavior that would otherwise reappear across `/cp`, `/newbr`, or their tests.
- Graphite/stash rollback behavior is safety-critical. Refactors that obscure the transaction order could make failures harder to reason about.
- Model-auth and provider policy could drift if checkpoint message drafting and branch slug drafting continue to use unrelated implementations.
- Branch naming could stay shallow if sanitation, fallback, suffixing, and availability checks remain split across tiny Modules.
- Tests could overfit shell choreography instead of workflow outcomes, making safe refactors look risky.

## Open Questions

- What exact Interface should the checkpoint seam expose so `/cp` and `/newbr` can share behavior without leaking the full Pi runtime through the seam?
- Should pending worktree snapshot own trunk refusal, clean-worktree detection, detached-head handling, untracked snippets, or only raw repository facts?
- Should small-model drafting become one shared Module now, or wait until checkpoint and branch naming work prove the common policy?
- Should Graphite branch creation become an explicit Adapter in this Objective, or be parked after transaction safety tests are clarified?
- Which candidates should be split into follow-on Objectives if the narrow PR #649 follow-up grows too large?
