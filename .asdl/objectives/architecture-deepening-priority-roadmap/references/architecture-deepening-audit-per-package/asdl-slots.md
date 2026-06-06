# asdl-slots Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-5mwT3K/a388947a-8130-411b-8f22-3b4ba10e3189.jsonl`

Read-only audit completed. No files edited. Validation was inspection-only plus line/count discovery commands; no tests run.

## 1. Package map

**Package language inferred from `README.md` and source**: managed slot, slot pool, assigned/available slot, worktree, trunk detach, free, cleanup, GC sweep, current checkout redirect, shell directive, Graphite navigation.

**Key modules / seams**

- `inventory.py` — deep module. Derives `SlotInventory` from Git worktree facts. Interface: `SlotRecord`, `find_by_branch`, `lowest_available`, etc. Deletion test: deleting it would re-spread slot naming, main-worktree detection, operation occupancy, and dirty-slot filtering across checkout/free/gc/list.
- `context.py`, `repo_context.py`, `cli/slot/context.py` — adapter assembly seam. `SlotsCliContext` carries `GitGateway`, `PRGateway`, storage, clipboard. Actual callers must know which operations need PR/clipboard/storage even when many do not.
- `lifecycle/free.py` — explicit free lifecycle plus cleanup implementation. Interface includes plan/execute wrappers and cleanup helpers. It owns PR-close and local-branch-delete policy.
- `lifecycle/gc.py` — GC classification and execution. It imports free cleanup helpers, so GC depends on free’s implementation policy.
- `lifecycle/checkout.py` + `checkout_planning.py` — checkout allocation split. `checkout_planning.py` claims pure planning, but `plan_current_checkout` mutates worktree state.
- `lifecycle/outcomes.py` — common outcome dataclasses. Useful test surface, but currently forces repeated CLI result mapping.
- `cli/slot/*.py` — Clinkr request/result/rendering modules. They do more than CLI adaptation: `free.py` and `gc.py` repeatedly orchestrate plan → preview → confirmation → execute → cleanup → Clinkr exit.
- `gateway/*` and fakes — real seams where there are at least two adapters: storage, clipboard, Git, PR, Graphite via asdl-core.

**Dependency categories**

- **In-process**: naming, inventory, outcome dataclasses, selectors, cleanup rendering.
- **Local-substitutable**: Git worktree state via `GitGateway`, filesystem storage, clipboard, Graphite gateway.
- **Remote-owned**: GitHub PR state via `PRGateway`.
- **True external**: terminal/prompt/shell directive effects and real subprocess failure behavior.

## 2. Lifecycle control-flow maps

### `slot free`

Source flow:

- CLI entry: `cli/slot/free.py:210-304`
  1. Load `SlotsCliContext`.
  2. Build inventory and check pool/missing selector args.
  3. Resolve selectors via `_resolve_targets` at `cli/slot/free.py:137-185`.
  4. Call `plan_free_slots` at `lifecycle/free.py:50-99`.
  5. Choose cleanup actions.
  6. If `--dry-run`, call `plan_cleanup_for_free_targets` at `lifecycle/free.py:193-207`, map cleanup to CLI result, return ok/negative.
  7. If destructive cleanup without `--yes`, do machine-mode rejection or confirmation preview.
  8. Execute with `execute_free_plan` at `lifecycle/free.py:102-169`.
  9. Execute cleanup with `execute_cleanup_for_freed_slots` at `lifecycle/free.py:210-224`.
  10. Map lifecycle outcome to `SlotFreeResult` via `_outcome_to_result` at `cli/slot/free.py:188-199`.

Lifecycle internals:

- `plan_free_slots` validates assigned/clean/operation-free targets and resolves trunk.
- `execute_free_plan` re-builds inventory, rechecks assignment/operation/dirty state, detaches HEAD, and reports partial failures.
- Cleanup policy lives in `_cleanup_for_targets`, `_cleanup_pr`, `_cleanup_local_branch` at `lifecycle/free.py:227-335`.

Rendering:

- Human renderer: `render_slot_free` at `cli/slot/free.py:102-134`.
- Cleanup error rendering duplicated in `_cleanup_error_message` at `cli/slot/free.py:334-354`.

### `slot gc`

Source flow:

- CLI entry: `cli/slot/gc.py:217-264`
  1. Load context.
  2. Reject `--dry-run + --force`.
  3. Pick cleanup actions from `--delete-branches`.
  4. Call `plan_gc` at `lifecycle/gc.py:152-203`.
  5. If dry run: `plan_gc_cleanup` at `lifecycle/gc.py:206-221`, then `outcome_from_gc_plan` at `lifecycle/gc.py:318-335`.
  6. If no candidates: return non-mutating outcome.
  7. If force: execute directly with `execute_gc_plan` at `lifecycle/gc.py:224-315`.
  8. Otherwise: preview render, confirm, then execute or return cancelled result.

Lifecycle internals:

- `plan_gc` classifies assigned slots by PR lookup: open PR kept, no PR kept, lookup failure error, merged/closed PR would free.
- `execute_gc_plan` rechecks inventory, operation, dirty state, detaches, then calls free cleanup helpers.
- `garbage_collect_slots` at `lifecycle/gc.py:338-349` is a shallow wrapper that does not support cleanup.

Rendering:

- Human renderer: `render_slot_gc` at `cli/slot/gc.py:99-134`.
- Result mapping: `_result_from_outcome` at `cli/slot/gc.py:158-181`.
- Cleanup error message: `cli/slot/gc.py:184-203`, parallel to free.

### `slot checkout`

Source flow:

- CLI entry: `cli/slot/checkout.py:162-215`
  1. Validate mutually exclusive/current/new/base args.
  2. Load context.
  3. Run `checkout_current` or `checkout_branch`.
  4. Convert `SlotLifecycleFailure` to `ClinkrExit`.
  5. Build CLI result in `_build_result` at `cli/slot/checkout.py:110-142`, including shell directive and clipboard.

Lifecycle:

- `checkout_branch`: `lifecycle/checkout.py:36-90`
  - Ensure metadata dir.
  - Validate branch existence/new branch/base.
  - Create new branch if requested.
  - Build inventory.
  - Call `plan_checkout` at `checkout_planning.py:82-105`.
  - Convert `PoolFull`/`BranchInUse` to failures.
  - Execute selected plan in `_execute_plan` at `lifecycle/checkout.py:170-213`.

- `checkout_current`: `lifecycle/checkout.py:93-136`
  - Calls `plan_current_checkout` at `checkout_planning.py:170-213`.
  - Converts detached/dirty/planning failures.
  - Executes returned plan.

Rendering:

- `render_slot_checkout`: `cli/slot/checkout.py:80-107`.

## 3. LifecycleCoordinator hypothesis

**Verdict: valid if narrowed; risky if broad.**

The hypothesis is right that free/gc currently leak lifecycle sequencing into CLI modules. Evidence:

- `cli/slot/free.py:210-304` and `cli/slot/gc.py:217-264` both know plan/preview/confirm/execute/cleanup sequencing.
- GC imports cleanup planning/execution from free: `lifecycle/gc.py` imports `execute_cleanup_for_freed_slots` and `plan_cleanup_for_free_targets`.
- Cleanup policy is not “free-only”; GC needs it too.
- Outcome-to-Clinkr mapping is repeated in free/gc/checkout.

But a broad `LifecycleCoordinator` that returns Clinkr-shaped results would make the interface too presentation-coupled. The deeper module should not expose Clinkr or human rendering.

**Smallest deep module interface, conceptually**

A better name/interface would be a release-focused module, e.g. `SlotReleaseWorkflow`:

```python
run_slot_release(
    slots_ctx,
    scope: ExplicitTargets | GcEligibleTargets,
    cleanup: CleanupPolicy,
    execute: bool,
) -> SlotReleaseReport | SlotLifecycleFailure
```

Where:

- `execute=False` is dry-run/preview.
- `execute=True` mutates after the same classification path.
- `SlotReleaseReport` contains entries, counts, cleanup results, and partial failure status.
- CLI owns request parsing, confirmation, Clinkr exits, JSON models, and rendering.

**Behind the interface**

- target classification
- dirty/operation checks
- PR lookup/gate policy
- free detach execution
- PR close/local branch cleanup
- cleanup error counting
- GC/free shared target shape

**Not public**

- `_cleanup_pr`, `_cleanup_local_branch`
- free-specific `FreedSlot` conversion helpers
- GC-specific `_with_cleanup_by_slot`
- Clinkr result models
- Click confirmation behavior

## 4. Test analysis

Counts validate the clue:

- Source: **4,526** Python LOC.
- Tests: **9,453** Python LOC.
- Ratio: **~2.09:1 tests/source**.

Not all of that is bad; this package has real CLI scenario coverage. But lifecycle behavior is tested at too many layers.

Redundant/brittle layers:

- `tests/unit/test_lifecycle.py` — 1,639 lines. It tests pool, checkout, free, cleanup, and GC in one large file. Free/cleanup unit matrix at roughly `609-1196`; GC matrix at `1223-1622`.
- `tests/scenario/test_slot_free_cli.py` — 1,310 lines. Many cases repeat cleanup policy already tested in lifecycle: PR miss, completed PR, lookup failure, local branch failure, trunk refusal, etc.
- `tests/scenario/test_slot_gc_cli.py` — 854 lines. Repeats GC classification and cleanup behavior from unit lifecycle tests.
- `tests/scenario/test_slot_checkout_cli.py` — 957 lines. Repeats allocation/planning behavior from `test_checkout_planning.py` and lifecycle checkout tests.
- `tests/unit/test_checkout_planning.py` — currently brittle because it tests mutation inside a module documented as pure planning.

Tests that should survive at a new interface:

- Release workflow unit tests: explicit free, GC eligible sweep, dry-run, cleanup order, partial failure, dirty/operation recheck, PR lookup failure.
- CLI scenario smoke tests: help/schema, JSON envelope, selector parsing, confirmation behavior, machine-mode confirmation rejection, renderer smoke.
- Integration roundtrip: `tests/integration/test_list_checkout_roundtrip.py`.

Tests to delete/demote:

- Duplicate CLI matrices that assert internal cleanup classifications already covered by the workflow interface.
- Direct tests of private plan/execute split once a release workflow becomes the interface.
- Checkout planning tests that assert redirect side effects during “planning”; these should move to execution/transaction tests.

## 5. Checkout planning-time mutation bug

**Code evidence**

- File header claims pure planners: `checkout_planning.py:1-8`.
- `resolve_current_wt_redirect` mutates Git state via `git.checkout_branch` and `git.detach_head`: `checkout_planning.py:108-157`.
- `plan_current_checkout` calls that mutation before final `plan_checkout`: `checkout_planning.py:170-213`.

**Bug scenario**

1. User is in main worktree on `feat/x`.
2. Runs `slot checkout --current`.
3. Current worktree is clean.
4. Pool is full or only dirty slots remain.
5. `plan_current_checkout` redirects current worktree to previous/trunk/detached.
6. Only after redirect does it rebuild inventory and return `PoolFull`.
7. `checkout_current` returns failure, but the user’s current worktree has already moved off `feat/x`.

This is especially clear around `checkout_planning.py:204-213`: redirect first, then fresh inventory, then plan.

**Confidence: high.** The tests even encode pool-full-after-redirect behavior without asserting rollback: `tests/unit/test_checkout_planning.py:285-302`.

**Recommended fix**

Move redirect out of planning. Preflight availability and conflicts before mutation, then perform redirect + slot checkout in the lifecycle execution path. A minimal fix:

- make `plan_current_checkout` pure: identify current branch, dirty/detached state, already-in-slot, candidate slot availability, intended redirect strategy;
- only execute redirect after validating there is a clean target slot;
- optionally attempt rollback if post-redirect slot checkout fails.

## 6. Top 3 deepening/collapse candidates

### 1. `SlotReleaseWorkflow` for free/gc cleanup

- **Files**: `lifecycle/free.py`, `lifecycle/gc.py`, `cli/slot/free.py`, `cli/slot/gc.py`, `lifecycle/outcomes.py`.
- **Deletion test**: deleting current free/gc orchestration does not remove complexity; it reappears across two CLIs and tests. A shared release workflow would concentrate it.
- **Dependency category**: Git local-substitutable; PR remote-owned; CLI in-process.
- **Strength**: Strong.
- **Risk**: preserving partial-failure semantics and confirmation behavior.
- **Leverage/locality**: high leverage for tests and future cleanup policy; high locality for PR/local-branch cleanup.

### 2. Split current-checkout planning from mutation

- **Files**: `checkout_planning.py`, `lifecycle/checkout.py`, `tests/unit/test_checkout_planning.py`, `tests/scenario/test_slot_checkout_cli.py`.
- **Deletion test**: deleting `resolve_current_wt_redirect` as a planner helper would not delete behavior; it belongs behind execution after preflight.
- **Dependency category**: Git local-substitutable.
- **Strength**: Strong.
- **Risk**: preserving current UX and handling rollback on checkout failure.
- **Leverage/locality**: high bug-prevention leverage; localizes mutation to lifecycle execution.

### 3. Collapse lifecycle outcome → CLI result mapping

- **Files**: `lifecycle/outcomes.py`, `cli/slot/free.py`, `cli/slot/gc.py`, `cli/slot/checkout.py`, `cli/slot/gt/navigation.py`.
- **Deletion test**: deleting the mapping helpers would re-spread field copying, cleanup error counting, and cd/clipboard patterns.
- **Dependency category**: in-process plus clipboard local-substitutable.
- **Strength**: Worth exploring.
- **Risk**: do not make lifecycle return Clinkr-specific models.
- **Leverage/locality**: moderate leverage; improved locality for JSON/result shape drift.

## 7. Final verdict

**Yes — `asdl-slots` should be a top candidate for the main architecture skill report.**

Confidence: **high (~0.85)**.

Why:

- The package has strong domain depth but no package `CONTEXT.md` yet.
- Test/source ratio is genuinely high at ~2:1.
- There is concrete lifecycle/CLI orchestration duplication.
- Free/gc cleanup policy crosses module boundaries awkwardly.
- The checkout planner contains a likely real mutation-before-validation bug.
- A focused deep module could reduce test redundancy while improving correctness and locality.
