# Replace slot stub branches with detached HEAD

## Context

Today, a "free" slot in `twerk-slots` is represented by a named per-slot branch
`__slot-NN-br-stub__` pointing at trunk, checked out in the slot's worktree.
This requires a naming convention, creation/force-reset logic in two places
(`free_slot_assignment` and `_resolve_current_wt_redirect`), and a
`is_placeholder_branch()` guard in two branches of `sync_pool_assignments`.

The stub branches are implementation lint — user-visible garbage in
`git branch` output with no purpose beyond "this slot has no real work." The
cleaner representation is a **detached HEAD** on the trunk commit. The gateway
already has `detach_head(cwd, ref)` (real + fake), and sync's orphan-recovery
phase already has a branch that skips detached HEAD worktrees. We're
collapsing the "stub branch" case into the existing "detached HEAD" case.

### Design decisions (confirmed with user)

1. **Free-slot signal** = detached HEAD. `sync_pool_assignments` and
   `find_inactive_slot` use detached-HEAD to recognize a free slot; pool.json
   is not the sole source of truth.
2. **New worktrees** continue to be created with a named branch (current
   `add_worktree` behavior). The detach only happens when a slot is freed.
3. **Migration**: none. Single user, private repo — any lingering
   `__slot-NN-br-stub__` branches will either be ignored (sync's branch-match
   logic now treats them like any other user branch) or get cleaned up via
   `git branch -D` manually if they surface.

## Files to modify

### `packages/twerk-slots/src/twerk_slots/naming.py`

- Delete `_PLACEHOLDER_RE`, `get_placeholder_branch_name`,
  `is_placeholder_branch`.
- Keep `generate_slot_name`, `extract_slot_number`, `SLOT_NAME_PREFIX`.

### `packages/twerk-slots/src/twerk_slots/allocation.py`

- Remove imports of `get_placeholder_branch_name` / `is_placeholder_branch`.
- Delete `SlotFreeOutcome.placeholder_branch` field.
- `sync_pool_assignments` (phase 1, ~line 199): remove
  `if is_placeholder_branch(actual): ... continue`. The preceding
  `isinstance(actual, DetachedHead)` check (line 195) already skips detached
  HEAD worktrees, which is now the free-slot signal, so the stub branch that
  used to reach this block is gone.
- `sync_pool_assignments` (phase 2, ~line 226): remove
  `if is_placeholder_branch(actual): ... continue`. Line 224 already skips
  `DetachedHead`; free slots naturally fall into that skip branch.
- `_resolve_current_wt_redirect` (~line 386–392): for the slot-worktree
  branch, replace the "create stub + checkout" sequence with
  `ctx.git.detach_head(cwd, trunk)`. Drop the `get_placeholder_branch_name`
  import site and the `list_local_branches` / `create_branch` calls.
- `free_slot_assignment` (~line 483–495): replace
  `create_branch(placeholder, trunk, force=...)` +
  `checkout_branch(worktree_path, placeholder)` with
  `ctx.git.detach_head(assignment.worktree_path, trunk)`.
- Update `SlotFreeOutcome` construction at line 500 to drop
  `placeholder_branch=`.

### `packages/twerk-slots/src/twerk_slots/cli/slot/free.py`

- Drop `placeholder_branch` field from `SlotFreeResult`.
- Drop the `"placeholder_branch"` key from `to_json_dict()`.
- Update `render_slot_free()` second line to something like:
  `"Worktree kept at {path}; detached HEAD at trunk"` — no more stub-branch
  name to surface.
- Drop `placeholder_branch=` from the `SlotFreeResult(...)` construction at
  line 126–131.

### `packages/twerk-slots/src/twerk_slots/gc.py`

No structural change. `gc.py` only checks `isinstance(free_result,
SlotFreeOutcome)` — the `placeholder_branch` field is not read — but double
check the constructor site if it references that field. (Current code at
line 180 does not.)

## Tests to update

All in `packages/twerk-slots/tests/`.

### Delete

- `tests/unit/test_naming.py::test_get_placeholder_branch_name`
- `tests/unit/test_naming.py::test_is_placeholder_branch`
- Trim imports to drop `get_placeholder_branch_name` / `is_placeholder_branch`.
- `tests/unit/test_free_slot_assignment.py::test_free_slot_forces_existing_placeholder`
  — no stub to force anymore; detach replaces create-branch. If any coverage
  is still useful (idempotence of repeat free), rewrite as a detach-idempotence
  test.

### Rewrite

- `tests/unit/test_free_slot_assignment.py::test_free_slot_happy_path`:
  replace the `_create_branch_calls` / `_checkout_calls` assertions with an
  assertion on `git._detach_head_calls == [(slot_path, "main")]`. Remove the
  `outcome.placeholder_branch == ...` assertion. The `SlotFreeOutcome` no
  longer has that field.
- `tests/unit/test_free_slot_assignment.py` (other tests around line 255+):
  replace stub-branch expectations with detach-call expectations; the fake
  already tracks `_detach_head_calls` (gateway testing.py line 66).
- `tests/unit/test_allocation.py::test_sync_ignores_placeholder_branches`
  (line 209): rename to `test_sync_ignores_detached_head_on_assigned_slot`
  (or similar), and change the fake's `current_branch_by_path` to return
  `DetachedHead()` instead of `"__slot-01-br-stub__"`. The assigned slot should
  still be preserved in state when the worktree is detached.
- `tests/unit/test_allocation.py::test_find_inactive_slot_reuses_clean_worktree`
  (~line 123–134): change the fixture `WorktreeInfo` branch from
  `"__slot-01-br-stub__"` to `None` (detached). `find_inactive_slot` reads
  from `list_worktrees` + `get_file_status` only, so as long as the worktree
  is unassigned and clean it should still reuse it.
- `tests/unit/test_allocation.py::test_sync_skips_orphaned_stub_worktree`
  (~line 302): replace stub-branch fixture with detached HEAD (the sibling
  test `test_sync_skips_orphaned_detached_head` at ~line 321 already exercises
  this). Either delete the stub-variant test (redundant with detached-head
  variant) or rewrite it with a different scenario that's worth keeping.
- `tests/unit/test_allocation.py` lines 503, 530: replace
  `"__slot-01-br-stub__"` with `None` for `WorktreeInfo.branch` in those
  inactive/dirty-slot fixtures.
- `tests/unit/test_gc.py` lines 168–169, 432: replace
  `_create_branch_calls` + `_checkout_calls` stub assertions with
  `_detach_head_calls == [(..., "main")]`. The comment on line 383 can stay;
  re-word slightly ("no detach occurred" instead of "no placeholder").
- `tests/scenario/test_slot_checkout_cli.py` lines 508, 523: remove the stub
  branch from the initial fake `branches=(...)` tuple; drop the
  `"__slot-01-br-stub__" in list_local_branches()` assertion. Replace it (if
  there's semantic value) with an assertion that the prior slot worktree is
  now detached (`_detach_head_calls` contains the expected cwd).
- `tests/scenario/test_slot_free_cli.py` lines 171, 209, 315: replace
  checkout-to-stub assertions with detach assertions; drop the
  `payload["placeholder_branch"] == ...` assertion (JSON key is gone). The
  human-output assertion (if any) needs updating to match the new render text.
- `tests/scenario/test_slot_gc_cli.py` line 195: replace checkout-to-stub
  assertion with detach assertion.

## Reused utilities (do not add new gateway methods)

- `GitGateway.detach_head(cwd, ref)` exists on both real and fake gateways
  (`packages/twerk-core/src/twerk_core/git/real_git_gateway.py:276`;
  `packages/twerk-core/src/twerk_core/git/testing.py:136`). Use it directly
  in `free_slot_assignment` and `_resolve_current_wt_redirect`.
- `GitGateway.get_current_branch` already returns `DetachedHead` sentinel,
  which sync's phase 1 and phase 2 already special-case.
- `find_inactive_slot` does not check branch names, so no change needed once
  the fixtures stop injecting stub branches.

## Verification

1. `just check` (runs lint, format, ty, tests) in the repo root — full suite
   must pass.
2. Manual end-to-end smoke:
   - In a scratch repo with the pool initialized, `twerk slot checkout feat/x`
     to populate slot-01.
   - `twerk slot free --num 1` → verify `git -C <repo>/.twerk/worktrees/slot-01
     symbolic-ref HEAD` fails (detached) and `git branch` does **not** list
     `__slot-01-br-stub__`.
   - `twerk slot checkout feat/y` → verify slot-01 is reused (no new slot
     directory), worktree now on `feat/y`.
   - `twerk slot list` → pool.json still reflects a single assignment for
     `feat/y`.
3. Inspect JSON output of `twerk slot free --num 1 --output json` to confirm
   the `placeholder_branch` key is gone and remaining fields are unchanged.

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final
commit of this branch must delete this file (`plan-detach-free-slot-worktrees.md`). A
merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
