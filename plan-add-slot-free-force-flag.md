# Plan: Add `--force` flag to `slot free`

## Context

When `pool.json` gets out of sync with the actual git worktree state (e.g. slot-07 has a real branch checked out but pool.json doesn't track it), `slot free --num 7` errors with "slot-07 is not currently assigned." The user needs a way to unconditionally reset a slot to its stub branch even when pool state is stale.

## Approach

Add a `-f` / `--force` flag to `slot free`. When force is set and the slot has no pool assignment, instead of erroring, derive the worktree path from the naming convention, verify it exists, and proceed with the normal stub-branch checkout. The dirty-worktree check still applies (force bypasses stale state, not uncommitted work).

## Changes

### 1. `allocation.py` — add `force` parameter to `free_slot_assignment`

**File:** `packages/twerk-slots/src/twerk_slots/allocation.py`

Add a new error sentinel:

```python
@dataclass(frozen=True)
class SlotWorktreeNotFoundError:
    """Force-free failed because the worktree directory doesn't exist on disk."""
    slot_name: str
    worktree_path: Path
```

Modify `free_slot_assignment` signature to accept `force: bool = False`. Update the return type to include `SlotWorktreeNotFoundError`.

When `assignment is None`:

- If not force: return `SlotNotAssignedError` (existing behavior)
- If force:
  1. Derive `worktree_path = ctx.repo.worktrees_dir / slot_name`
  2. Check `ctx.storage.path_exists(worktree_path)` — if not, return `SlotWorktreeNotFoundError`
  3. Get current branch via `ctx.git.get_current_branch(worktree_path)` for the outcome's `branch_name` (use `"<unknown>"` on `DetachedHead` or `GitCommandFailure`)
  4. Check `ctx.git.has_uncommitted_changes(worktree_path)` — if dirty, return `DirtyWorktreeError`
  5. Proceed with stub branch creation and checkout (same as normal path)
  6. No assignment to remove from pool state (skip `with_assignment_removed`)
  7. Return `SlotFreeOutcome`

### 2. `cli/slot/free.py` — add `--force` flag and handle new error

**File:** `packages/twerk-slots/src/twerk_slots/cli/slot/free.py`

- Add `force` field to `SlotFreeRequest`:
  ```python
  force: Annotated[bool, click.Option(["-f", "--force"], is_flag=True, default=False)] = False
  ```
- Import `SlotWorktreeNotFoundError` from allocation
- Pass `force=request.force` to `free_slot_assignment()`
- Add handler for `SlotWorktreeNotFoundError`:
  ```python
  if isinstance(outcome, SlotWorktreeNotFoundError):
      return ClinkrCommandError(
          error_type="slot_worktree_not_found",
          message=f"Worktree for {slot_name} not found at {outcome.worktree_path}.",
      )
  ```

### 3. Unit tests — force-free paths

**File:** `packages/twerk-slots/tests/unit/test_free_slot_assignment.py`

Add tests:

- `test_force_free_unassigned_slot_happy_path` — slot not in pool state, worktree exists on disk, force=True → succeeds, stub branch created and checked out, pool state unchanged
- `test_force_free_worktree_not_found` — slot not in pool state, worktree doesn't exist, force=True → returns `SlotWorktreeNotFoundError`
- `test_force_free_dirty_worktree` — slot not in pool state, worktree exists but dirty, force=True → returns `DirtyWorktreeError`
- `test_force_free_assigned_slot_works_normally` — slot IS in pool state, force=True → works same as normal free (assignment removed)

### 4. Scenario tests — CLI force-free paths

**File:** `packages/twerk-slots/tests/scenario/test_slot_free_cli.py`

Add tests:

- `test_slot_free_force_unassigned` — `free --force --num 7` with no pool assignment → succeeds
- `test_slot_free_force_worktree_missing` — `free -f --wt slot-07` with no worktree on disk → error
- `test_slot_free_force_dirty` — `free -f --num 1` with dirty worktree → error about uncommitted changes

## Verification

1. Run unit tests: `cd packages/twerk-slots && uv run pytest tests/unit/test_free_slot_assignment.py -v`
2. Run scenario tests: `cd packages/twerk-slots && uv run pytest tests/scenario/test_slot_free_cli.py -v`
3. Run full check: `cd packages/twerk-slots && just`
4. Manual: `uv run slot free --force --num 7` in the actual stale-state scenario

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final
commit of this branch must delete this file (`plan-add-slot-free-force-flag.md`). A
merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
