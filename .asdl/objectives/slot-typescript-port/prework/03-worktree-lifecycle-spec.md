# 03 — Worktree Lifecycle Spec

The git-worktree-mutating operations: `init`, `resize`, `checkout`/`co`, `claim`, `free`, `gc`. All
build a fresh `SlotInventory` per call (no persisted state), validate against worktree state, then
mutate via the git gateway. Slices: roadmap rows 4, 5, 6.

Python source: `lifecycle/{pool,checkout,claim,free,gc}.py`, `lifecycle/outcomes.py`,
`checkout_planning.py` (planners — see `02`). Git gateway method set in `04`.

## Outcomes (JSON `data` payloads — `lifecycle/outcomes.py`)

These dataclass field sets are the durable JSON envelopes; reproduce as Zod result schemas. See
`../slot-contract-inventory.md §3` for the per-command field lists with `file:line`.

## init (`pool.py:61-94`)

1. Bounds: `1..99`; else `SlotLifecycleFailure(error_type="invalid_size", ...)` (`pool.py:33-37,64-65`).
2. Build inventory; if `pool_size > 0` → `pool_already_initialized` (`pool.py:71-78`).
3. `ensure_slots_metadata_dir` (creates `~/.slots/repos/<name>/worktrees`).
4. `trunk = git.get_trunk_branch()`; for `n in 1..size`: `git.add_detached_worktree(worktrees_dir/slot-NN, trunk)`,
   collect names (`pool.py:82-88`).
5. Return `SlotInitOutcome{created, pool_size: len(created), worktrees_dir}`.

## resize (`pool.py:97-178`)

- `build_resize_plan(inventory, target)` (`pool.py:44-58`):
  - `target == poolSize` → no-op plan.
  - `target > poolSize` → **grow**: fill the lowest absent slot numbers first, then extend
    (`pool.py:47-56`). Produces exactly `target - poolSize` new numbers.
  - `target < poolSize` → **shrink**: remove `sorted(records, by number)[target:]` — i.e. the
    highest-numbered slots (`pool.py:57-58`).
- Shrink safety (`_validate_removals`, `pool.py:151-178`): for each removal, refuse if
  `operation is not None` (in-progress), then if `branch is not None` (assigned), then if
  `git.has_uncommitted_changes(path)` (dirty). Collect **all** offenders into a `resize_unsafe`
  failure joined by newlines (`pool.py:119-125`). Do not stop at the first.
- Execute: ensure metadata dir; create new detached worktrees; `git.remove_worktree(path)` for each
  removal (`pool.py:127-141`).
- Return `SlotResizeOutcome{previous_pool_size, pool_size, created, removed, worktrees_dir}`. Note
  `pool_size = previous + len(created) - len(removed)` (`pool.py:142-148`).

## checkout / co (`checkout.py:32-198`, planners in `02`)

`checkout_branch(ctx, branch, { new_branch, base })` (`checkout.py:32-86`):

1. `ensure_slots_metadata_dir`.
2. `branch_exists = git.branch_exists(branch)`.
3. If `new_branch` (`-b`): refuse if exists (`branch_exists`), refuse if `base` given and missing
   (`base_missing`), else `git.create_branch(branch, base ?? "HEAD", force=false)`, mark created
   (`checkout.py:43-62`).
4. elif not exists → `branch_missing` (`checkout.py:63-69`).
5. `plan = plan_checkout(inventory, git, branch)`; `PoolFull` → `pool_full_failure(assigned, ...)`;
   `BranchInUse` → `_branch_in_use_failure` (`checkout.py:76-79`).
6. `_execute_plan` (`checkout.py:155-198`): `ReuseAssignment` → outcome `already_assigned=true`, no
   git; `BranchInMainWorktree` → outcome with `slot_name=""` and the main path; `AssignToSlot` →
   `git.checkout_branch(record.path, branch)`, mapping failure to `checkout_failed`.

`checkout --current` (`checkout_current`, `checkout.py:89-139`): plan via `plan_current_checkout`
(`02`), surfacing `detached_head` / `dirty_worktree` refusals (`checkout.py:104-119`); execute the
caller-worktree redirect first (`execute_current_worktree_redirect`) if present, then `_execute_plan`
(`checkout.py:126-139`). **Key safety:** planning happens before any mutation, so `pool_full` /
`branch_in_use` leave the caller worktree untouched.

`_branch_in_use_failure` (`checkout.py:142-152`): if the occupancy has an operation, build a message
with the operation recovery instruction; else "already checked out at <path>".

## claim (`claim.py:40-473`)

The most branch-heavy command. `claim_branch(ctx, branch)` (`claim.py:40-89`):

1. `ensure_slots_metadata_dir`; refuse if `!git.branch_exists(branch)` → `branch_missing`
   (`claim.py:47-51`).
2. `plan_claim` (`claim.py:92-273`); if `already_current`, return outcome with no mutation.
3. If `plan.source` set, `_detach_source_slot` (detach the source slot at trunk; failure →
   `source_detach_failed`) (`claim.py:60-69,405-422`).
4. Execute caller/main redirect if present (`claim.py:70-77`).
5. `git.checkout_branch(target.path, slot_checkout_branch)`; failure → `checkout_failed`
   (`claim.py:79-87`).

`plan_claim` cases:

- **From a managed slot** (current slot record found, `claim.py:107-163`): refuse if current slot has
  an operation (`operation_in_progress`); if branch already in current slot → `already_current`; if in
  another slot → validate source not-busy/not-dirty (`_source_slot_failure`) and current not-dirty
  (`_current_slot_dirty_failure`), set `source`; if in main worktree → `branch_in_main_worktree`; if
  occupied elsewhere → `branch_in_use`; else claim into current slot.
- **From the main worktree** (`_plan_claim_from_main_worktree`, `claim.py:173-273`): only allowed when
  `repo.root == main_repo_root`, else `not_current_slot`. Special trunk handling
  (`_plan_trunk_claim_from_main_worktree`, `claim.py:276-356`); refuses moving trunk out of the main
  worktree (`trunk_in_main_worktree`). Can claim an unassigned branch into the lowest available slot
  without touching main, or move the main worktree's current branch into a slot and redirect main
  (`caller_redirect` / `main_redirect`).

Error types to preserve: `branch_missing`, `pool_empty`, `operation_in_progress`,
`branch_in_main_worktree`, `branch_in_use`, `not_current_slot`, `trunk_in_main_worktree`,
`dirty_current_slot`, `dirty_source_slot`, `dirty_current_worktree`, `source_detach_failed`,
`checkout_failed`, `current_branch_failed`, plus `pool_full`. Outcome `_outcome_from_plan`
(`claim.py:425-440`) nulls `replaced_branch_name` when it equals the checkout branch.

## free (`free.py:23-167`)

- `plan_free_slots` (`free.py:23-45`): build inventory, `_validated_free_targets`, combine with any
  `preflight_errors`; any errors → `invalid_slot_args` (newline-joined). Else
  `SlotFreePlan{targets, trunk_branch}`.
- `_validated_free_targets` (`free.py:100-132`): per slot name — refuse if not found or not assigned
  ("is not currently assigned"), if `operation is not None` (in-progress), if dirty. Valid targets →
  `FreedSlot`.
- `execute_free_plan` (`free.py:48-76`): re-build inventory, `release_assigned_slot_target` per
  target; on failure, return `SlotLifecycleFailure` with a partial-progress message listing
  already-freed slots (`_partial_failure_message`, `free.py:163-167`).
- Selector resolution (`-n`/`-w`/`-b`/`-c`/`--all`/`--dry-run`/`-y`) lives in the command layer
  (`cli/slot/free.py`): multiple selectors combine, dedup in order. `--all` adds PR-close +
  local-branch-delete cleanup (`release_cleanup.py`). In `--format json`, `--all` requires `-y/--yes`.

## gc (`gc.py:44-203`)

- `plan_gc` (`gc.py:44-100`): pool-empty → `pool_empty`. Per assigned slot: operation-in-progress →
  `skipped_operation`; else `pr.get_pr_for_branch(branch)`:
  - `PRLookupMiss` → `kept_no_pr`.
  - `PRGatewayFailure` → `error` (with stderr/stdout/returncode message).
  - `state == "OPEN"` → `kept_open_pr` (carry pr number/state/url).
  - otherwise (merged/closed) → `would_free` (increment `would_free_count`).
- `execute_gc_plan` (`gc.py:116-169`): for each `would_free` entry, `release_assigned_slot_target`;
  failures map to `error` / `skipped_operation` / `skipped_dirty` via `_entry_from_release_failure`
  (`gc.py:233-264`). Optional cleanup (`--delete-branches` adds `local_branch`; PR close is the gc
  default cleanup action) via `execute_release_cleanup`, merged per slot (`gc.py:151-158`).
- Counts (`_count_gc_actions`, `gc.py:325-344`): `freed`+`would_free` → `freed_count`;
  `kept_*` → `kept_count`; `skipped_*` → `skipped_count`; `error` → `error_count`;
  `cleanup_error_count` from per-entry cleanup statuses (`gc.py:321-322`).
- `garbage_collect_slots(ctx, { dry_run })` (`gc.py:192-203`): plan, then `outcome_from_gc_plan(dry_run=True)`
  or `execute_gc_plan`. `--force` (command layer) skips the interactive confirm; `--dry-run` plans only.

## TS test checklist (port from `test_lifecycle.py`, `test_release_workflows.py`, the `test_slot_*_cli.py` scenarios)

- init: invalid size (0, 100); refuse when pool exists; creates N detached worktrees + metadata dir;
  outcome fields.
- resize: no-op when equal; grow fills gaps then extends; shrink removes highest; shrink refuses
  assigned/dirty/operation and reports **all** offenders; outcome `pool_size` arithmetic.
- checkout: existing branch into lowest slot; `-b` create (+ `base_missing`, `branch_exists`);
  `branch_missing`; reuse already-assigned; branch in main worktree; `pool_full` lists assignments;
  `branch_in_use` (checked-out vs operation); `--current` happy + `detached_head` + `dirty_worktree`
  - untouched-on-failure; clipboard/cd fields.
- claim: from-slot reuse/move/already-current; source busy/dirty refusals; current dirty refusal;
  from-main unassigned-into-lowest; from-main move-current-branch + redirect; trunk refusals
  (`trunk_in_main_worktree`); `not_current_slot`; `branch_in_use`; `source_detach_failed`.
- free: single/multi selector; dedup-in-order; not-assigned/operation/dirty refusals;
  `invalid_slot_args` aggregation; partial-failure message; `--dry-run`; `--all` PR-close +
  branch-delete over fake PR gateway; JSON `--all` requires `-y`.
- gc: classification matrix (`kept_no_pr`/`kept_open_pr`/`would_free`/`skipped_operation`/`error`);
  `--dry-run` plan; execute frees would-free; `--delete-branches`; count aggregation incl.
  `cleanup_error_count`; pool-empty failure.
