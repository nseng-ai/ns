# Candidate Dispositions

This file records the working disposition for the six PR #649 deepening candidates. Dispositions may change as implementation evidence appears, but every change should preserve the deletion-test rationale: a new Module or seam is worthwhile only when deleting it would push real complexity back into `/cp`, `/newbr`, or their tests.

## Current Priority Order

1. Candidate 5 — Branch naming policy depth.
2. Candidate 3 — Shared small-model drafting policy.
3. Candidate 6 — Test surface cleanup, applied continuously rather than as a standalone refactor.
4. Candidate 2 — New-branch transaction Module shape, implemented.
5. Candidate 4 — Explicit Graphite branch-creation Adapter, folded into Candidate 2 with no standalone adapter.
6. Candidate 1 — Checkpoint seam and pending worktree snapshot, implemented.

## Candidate 1 — Checkpoint Seam and Pending Worktree Snapshot

**Disposition:** Implemented as the first slice.

**Files:** `ts/packages/pi-extensions/src/cp.ts`, `ts/packages/pi-extensions/src/checkpoint-pi.ts`, `ts/packages/pi-extensions/src/pending-worktree.ts`, `ts/packages/pi-extensions/src/checkpoint-flow.ts`, `ts/packages/pi-extensions/src/newbr.ts`, `ts/packages/pi-extensions/src/newbr-flow.ts`, `ts/packages/pi-extensions/test/pending-worktree.test.ts`, `ts/packages/pi-extensions/test/checkpoint-flow.test.ts`, `ts/packages/pi-extensions/test/newbr-flow.test.ts`.

**Problem:** `/cp` and `/newbr` both depend on pending worktree facts and checkpoint preparation, but the first implementation required `/newbr` to import shared checkpoint behavior from the `/cp` command module and gathered git facts through separate paths.

**Deletion test:** Positive and now evidenced. If `pending-worktree.ts` is deleted, branch/status/diff/clean-tree/detached-head fact gathering reappears across both commands and tests. If `checkpoint-pi.ts` is deleted, Pi model drafting, spinner/status handling, preparation-source notification, prompt building, and commit adapter behavior reappear in `/cp` or `/newbr`.

**Implemented Interface:** `pending-worktree.ts` exposes `loadPendingWorktreeSnapshot`, `PendingWorktreeSnapshot`, structured `PendingWorktreeError` variants, and command-detail formatting. The snapshot owns repository facts: root, branch, status, diff, and clean state. `checkpoint-pi.ts` owns the Pi-facing checkpoint adapter: shared `ExtensionAPI`/`ExtensionCommandContext` types, `prepareCheckpointMessageForPi`, and `commitPreparedCheckpointMessage`.

**Boundary decisions:** trunk refusal remains `/cp` policy, not a snapshot fact. Clean state is reported by the snapshot and interpreted by each command. Detached HEAD and non-repository states are structured errors formatted by each command. Untracked file contents remain local to `/newbr` slug generation and are read only when a slug must be generated. The shared diff command uses `git diff HEAD --no-ext-diff` for deterministic snapshot input.

**Validation:** `bun run --cwd ts check` and `bun run --cwd ts test` passed after implementation.

## Candidate 2 — New-Branch Transaction Module Shape

**Disposition:** Implemented as Candidate 2.

**Files:** `ts/packages/pi-extensions/src/newbr-flow.ts`, `ts/packages/pi-extensions/src/newbr-transaction.ts`, `ts/packages/pi-extensions/src/newbr.ts`, `ts/packages/pi-extensions/test/newbr-flow.test.ts`, `ts/packages/pi-extensions/test/newbr-transaction.test.ts`.

**Problem:** `NewBranchFlowInput` exposed many low-level operations, and tests asserted shell choreography. Some order is the safety guarantee, but not every command detail should be the Interface.

**Deletion test:** Positive and now evidenced. If `newbr-transaction.ts` is deleted, stash push, stash-ref lookup, Graphite branch creation, rollback restoration, restore-failure stop rules, and checkpoint-commit failure outcomes reappear in `newbr-flow.ts` and its tests.

**Implemented Interface:** `runNewBranchTransaction` owns the safety-critical sequence: stash pending changes, find the stash ref, create the Graphite branch, restore the stash, and create the checkpoint commit. It returns typed transaction outcomes for `stash_failed`, `stash_ref_missing`, `graphite_create_failed` with restored true/false, `restore_failed_after_branch_create`, and `commit_failed_after_branch_create`.

**Boundary decisions:** `newbr-flow.ts` still owns worktree snapshot loading, clean-worktree refusal, slug generation/validation, branch-name availability, checkpoint message preparation, notification wording, and final clean/dirty probing. Transaction helpers keep exact git stash and `gt create` spelling private except where Graphite branch creation is `/newbr`'s explicit command contract.

**Validation:** `bun run --cwd ts check`, `bun run --cwd ts test`, and `just dprint-check` passed after implementation.

## Candidate 3 — Shared Small-Model Drafting Policy

**Disposition:** Park until Candidate 5 clarifies the shared drafting need.

**Files:** `ts/packages/pi-extensions/src/cp.ts`, `ts/packages/pi-extensions/src/newbr-flow.ts`, `ts/packages/pi-extensions/src/pi-runtime-modules.d.ts`.

**Problem:** checkpoint message drafting uses Pi model registry and `completeSimple`; branch slug drafting shells out to `pi --print`. That creates two model-selection and failure-reporting paths.

**Deletion test:** Partial. Candidate 1 moved checkpoint model drafting into `checkpoint-pi.ts`, but branch slug drafting still shells out to `pi --print`; the two call paths may have different host constraints.

**Implementation direction:** revisit after Candidate 5 clarifies branch naming. If checkpoint drafting and branch slug drafting still need the same small-drafting Interface, promote it then.

## Candidate 4 — Explicit Graphite Branch-Creation Adapter

**Disposition:** Folded into Candidate 2; no standalone adapter introduced.

**Files:** `ts/packages/pi-extensions/src/newbr-transaction.ts`, `ts/packages/pi-extensions/src/newbr-flow.ts`, `ts/packages/pi-extensions/src/newbr.ts`, `ts/packages/pi-extensions/test/newbr-transaction.test.ts`, `ts/packages/pi-extensions/test/newbr-flow.test.ts`.

**Problem:** `/newbr` explicitly has a Graphite contract, but Graphite branch creation was a generic `exec("gt", ...)` call interleaved with git stash and restore operations.

**Deletion test:** Independently negative for a standalone Graphite Adapter in this slice. With only `/newbr` using branch creation, an adapter would be shallow; Candidate 2 provided the useful seam by making Graphite creation one step in the transaction boundary.

**Boundary decision:** keep Graphite-specific behavior local and explicit inside the new-branch transaction. Do not introduce a broader Graphite runtime dependency beyond `/newbr`'s user-facing contract. Revisit only if another caller or a richer Graphite-specific policy appears.

## Candidate 5 — Branch Naming Policy Depth

**Disposition:** Implement after transaction/snapshot foundations, unless Candidate 1 reveals it should move earlier.

**Files:** `ts/packages/pi-extensions/src/branch-slug.ts`, `ts/packages/pi-extensions/src/newbr-flow.ts`, `ts/packages/pi-extensions/test/newbr-flow.test.ts`.

**Problem:** sanitation and truncation live in `branch-slug.ts`; prompt rules, fallback slug construction, suffixing, git ref validation, and availability checks live in `newbr-flow.ts`.

**Deletion test:** Positive for a deeper policy Module, negative for the current tiny helper. Deleting current `branch-slug.ts` would mostly move string rules into the caller; deleting a Module that owns generation/sanitation/fallback/collision behavior would push meaningful policy back into `newbr-flow.ts`.

**Implementation direction:** deepen only if it can own branch-name policy end-to-end. Do not merely rename the existing string helpers.

## Candidate 6 — Behavior-First Test Surface

**Disposition:** Apply continuously; reject standalone universal fake framework for now.

**Files:** `ts/packages/pi-extensions/test/checkpoint-flow.test.ts`, `ts/packages/pi-extensions/test/newbr-flow.test.ts`, plus any tests added for accepted candidates.

**Problem:** Some tests assert command order or command spellings. The order assertions are sometimes valuable safety evidence, but broad shell choreography can make implementation details look like the Interface.

**Deletion test:** Positive as a testing policy, not as a production Module. A universal fake DSL is not justified by current evidence.

**Implementation direction:** use local fake adapters and harnesses consistent with the existing TypeScript package. Assert workflow outcomes and safety invariants first; assert command order only where order is itself the safety guarantee. Candidate 1 followed this policy with direct `pending-worktree.test.ts` coverage and retained `/newbr` order assertions only for safety sequencing. Candidate 2 added `newbr-transaction.test.ts` for typed outcomes and rollback behavior, while `newbr-flow.test.ts` now covers user-facing failure messages for stash push failure, missing stash refs, and Graphite-create rollback failure without freezing every incidental command argument.
