# Candidate Dispositions

This file records the working disposition for the six PR #649 deepening candidates. Dispositions may change as implementation evidence appears, but every change should preserve the deletion-test rationale: a new Module or seam is worthwhile only when deleting it would push real complexity back into `/cp`, `/newbr`, or their tests.

## Current Priority Order

1. Candidate 1 — Checkpoint seam and pending worktree snapshot.
2. Candidate 2 — New-branch transaction Module shape.
3. Candidate 5 — Branch naming policy depth.
4. Candidate 3 — Shared small-model drafting policy.
5. Candidate 4 — Explicit Graphite branch-creation Adapter, likely folded into Candidate 2.
6. Candidate 6 — Test surface cleanup, applied continuously rather than as a standalone refactor.

## Candidate 1 — Checkpoint Seam and Pending Worktree Snapshot

**Disposition:** Implement first.

**Files:** `ts/packages/pi-extensions/src/cp.ts`, `ts/packages/pi-extensions/src/checkpoint-flow.ts`, `ts/packages/pi-extensions/src/newbr-flow.ts`, `ts/packages/pi-extensions/test/checkpoint-flow.test.ts`, `ts/packages/pi-extensions/test/newbr-flow.test.ts`.

**Problem:** `/cp` and `/newbr` both depend on pending worktree facts and checkpoint preparation, but the shared seam currently requires callers to pass Pi runtime objects or low-level status/diff strings. `cp.ts` owns branch preflight and git diff loading, while `newbr-flow.ts` owns a separate snapshot path plus untracked snippets.

**Deletion test:** Positive. If a deeper checkpoint/snapshot Module is deleted, branch/status/diff/clean-tree/detached-head/trunk-refusal behavior reappears across both commands and their tests.

**Working Interface sketch:** expose a small pending-worktree snapshot and checkpoint-preparation Interface that callers can use without knowing Pi runtime details. The snapshot should likely own branch, status, diff, clean state, and detached-head errors. Untracked snippets should be considered carefully: they are required for branch slug generation but not necessarily for `/cp` commit-message fallback.

**Implementation direction:** move toward a Module where `/cp` can ask for “create a checkpoint from this worktree” and `/newbr` can ask for “prepare checkpoint message from this snapshot,” while Pi-specific model drafting and UI notification stay in an Adapter at the command edge unless they pass the deletion test too.

## Candidate 2 — New-Branch Transaction Module Shape

**Disposition:** Implement after Candidate 1.

**Files:** `ts/packages/pi-extensions/src/newbr-flow.ts`, `ts/packages/pi-extensions/src/newbr.ts`, `ts/packages/pi-extensions/test/newbr-flow.test.ts`.

**Problem:** `NewBranchFlowInput` exposes many low-level operations, and tests assert shell choreography. Some order is the safety guarantee, but not every command detail should be the Interface.

**Deletion test:** Positive for transaction semantics. If the transaction Module is deleted, stash/create/restore/commit rollback knowledge spreads into callers and tests.

**Implementation direction:** preserve safety-critical ordering as behavior: prepare before stash, stash before Graphite create, restore before commit, and stop safely on rollback failures. Avoid freezing incidental command spelling beyond what is the actual external contract.

## Candidate 3 — Shared Small-Model Drafting Policy

**Disposition:** Park until Candidates 1 and 5 clarify the shared drafting need.

**Files:** `ts/packages/pi-extensions/src/cp.ts`, `ts/packages/pi-extensions/src/newbr-flow.ts`, `ts/packages/pi-extensions/src/pi-runtime-modules.d.ts`.

**Problem:** checkpoint message drafting uses Pi model registry and `completeSimple`; branch slug drafting shells out to `pi --print`. That creates two model-selection and failure-reporting paths.

**Deletion test:** Partial. There is real duplication in provider/model/timeout/output policy, but the two call paths may have different host constraints. A shared Module now could become shallow or force the wrong Adapter shape.

**Implementation direction:** revisit after Candidate 1 separates checkpoint behavior from Pi runtime and Candidate 5 clarifies branch naming. If both still need the same small-drafting Interface, promote it then.

## Candidate 4 — Explicit Graphite Branch-Creation Adapter

**Disposition:** Fold into Candidate 2 unless implementation evidence shows a separate seam.

**Files:** `ts/packages/pi-extensions/src/newbr-flow.ts`, `ts/packages/pi-extensions/src/newbr.ts`, `ts/packages/pi-extensions/test/newbr-flow.test.ts`.

**Problem:** `/newbr` explicitly has a Graphite contract, but Graphite branch creation is currently a generic `exec("gt", ...)` call interleaved with git stash and restore operations.

**Deletion test:** Not yet independently positive. With only `/newbr` using this behavior, a standalone Graphite Adapter may be hypothetical. The seam becomes real if Candidate 2 needs to vary Graphite behavior in tests or if another caller appears.

**Implementation direction:** keep Graphite-specific behavior local and explicit inside the new-branch transaction. Do not introduce a broader Graphite runtime dependency beyond `/newbr`'s user-facing contract.

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

**Implementation direction:** use local fake adapters and harnesses consistent with the existing TypeScript package. Assert workflow outcomes and safety invariants first; assert command order only where order is itself the safety guarantee.
