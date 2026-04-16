# Plan: Recover orphaned slot assignments in sync

## Context

`sync_pool_assignments` only reconciles _existing_ assignments in pool.json — it iterates `state.assignments` and updates branch names when they've drifted. It never discovers worktrees that have real branches checked out but no pool entry.

This means when a pool.json write race loses an assignment (two concurrent `slot checkout` commands load the same state, and one overwrites the other's changes), that slot becomes invisible to the pool. Worse, `find_inactive_slot` treats it as reusable, so the next `slot checkout` could silently clobber work in that worktree.

The fix: extend `sync_pool_assignments` to walk `git.list_worktrees()`, find managed slot worktrees not in assignments that are on real (non-stub, non-detached) branches, and recover them as assignments. Since sync runs at the start of every operation (`free`, `checkout`, `gc`), this makes lost assignments self-healing.

## Changes

### 1. `allocation.py` — extend `sync_pool_assignments` to discover orphaned worktrees

**File:** `packages/twerk-slots/src/twerk_slots/allocation.py`

After the existing loop over `state.assignments`, add a second phase:

```python
# Phase 2: discover orphaned worktrees (managed slots on real branches
# with no pool assignment). These arise from pool.json write races.
assigned_slots = {a.slot_name for a in updated}

for wt in git.list_worktrees():
    slot_name = wt.path.name
    if extract_slot_number(slot_name) is None:
        continue  # not a managed slot worktree
    if slot_name in assigned_slots:
        continue  # already tracked

    # Determine actual branch
    actual = git.get_current_branch(wt.path)
    if isinstance(actual, (GitCommandFailure, DetachedHead)):
        continue  # can't determine branch; skip silently
    if is_placeholder_branch(actual):
        continue  # genuinely free slot on stub branch

    # Orphaned: real branch, no assignment. Recover it.
    updated.append(
        SlotAssignment(
            slot_name=slot_name,
            branch_name=actual,
            assigned_at=datetime.now(timezone.utc).isoformat(),
            worktree_path=wt.path,
        )
    )
    changed = True
```

Add `from datetime import datetime, timezone` to the module imports.

The `changed` flag already gates the `pool_state_gw.save()` call at the bottom, so recovered assignments get persisted automatically.

### 2. Unit tests — orphan recovery

**File:** `packages/twerk-slots/tests/unit/test_allocation.py`

Add tests in the sync section:

- `test_sync_recovers_orphaned_worktree` — pool.json has slot-01 assigned, git shows slot-01 and slot-07 as worktrees, slot-07 is on `feat/z` with no assignment → sync adds slot-07 to assignments, persists
- `test_sync_skips_orphaned_stub_worktree` — slot-07 exists as a worktree on `__slot-07-br-stub__` with no assignment → sync does NOT add it (it's genuinely free)
- `test_sync_skips_orphaned_detached_head` — slot-07 worktree on detached HEAD, no assignment → sync does NOT add it
- `test_sync_skips_orphaned_git_failure` — `get_current_branch` returns `GitCommandFailure` for orphaned worktree → sync skips silently (no raise, unlike existing assignments where it raises)
- `test_sync_skips_non_slot_worktrees` — main repo worktree (path name doesn't match `slot-XX`) is ignored

### 3. Integration consideration

**No changes needed to callers.** `sync_pool_assignments` is already called at the top of `free_slot_assignment`, `allocate_slot_for_branch`, and `plan_gc`. The recovered assignments flow through naturally:

- **free**: sync recovers slot-07's assignment → `find_assignment_by_slot` finds it → normal free path (no `--force` needed for race-lost assignments)
- **checkout**: sync recovers slot-07 → it's no longer "inactive" → `find_inactive_slot` won't reuse it (prevents clobbering work)
- **gc**: sync recovers slot-07 → gc classifies it alongside other assignments

## Verification

1. Run sync unit tests: `cd packages/twerk-slots && uv run pytest tests/unit/test_allocation.py -k sync -v`
2. Run full allocation tests: `cd packages/twerk-slots && uv run pytest tests/unit/test_allocation.py -v`
3. Run full package check: `cd packages/twerk-slots && just`
4. Verify the fix would have prevented the original issue: the orphaned slot-07 on `consolidate-gateways` would be recovered by sync, so `slot free --num 7` would work without `--force`

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final
commit of this branch must delete this file (`plan-recover-orphaned-slot-assignments.md`). A
merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
