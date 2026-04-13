from __future__ import annotations

from pathlib import Path

from twerk_slots.diagnostics import SyncIssue
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repair import (
    REPAIRABLE_CODES,
    RepairableAssignment,
    execute_repair,
    find_stale_assignments,
)


def _assignment(slot_name: str, branch_name: str = "feat/x") -> SlotAssignment:
    return SlotAssignment(
        slot_name=slot_name,
        branch_name=branch_name,
        assigned_at="2026-04-12T00:00:00+00:00",
        worktree_path=Path("/slots/repos/r/worktrees") / slot_name,
    )


def test_repairable_codes_cover_the_four_auto_fix_codes() -> None:
    assert REPAIRABLE_CODES == frozenset(
        {"orphan-state", "missing-branch", "git-registry-missing", "branch-mismatch"}
    )


def test_find_stale_assignments_picks_up_repairable_codes() -> None:
    state = PoolState(
        pool_size=4,
        assignments=(
            _assignment("slot-01"),
            _assignment("slot-02"),
            _assignment("slot-03"),
        ),
    )
    issues = (
        SyncIssue(code="orphan-state", message="m", slot_name="slot-01"),
        SyncIssue(code="branch-mismatch", message="m", slot_name="slot-02"),
        # Informational code is ignored.
        SyncIssue(code="untracked-worktree", message="m", slot_name="slot-07"),
    )

    stale = find_stale_assignments(state, issues)

    assert {ra.assignment.slot_name for ra in stale} == {"slot-01", "slot-02"}
    by_slot = {ra.assignment.slot_name: ra.issue_code for ra in stale}
    assert by_slot["slot-01"] == "orphan-state"
    assert by_slot["slot-02"] == "branch-mismatch"


def test_find_stale_assignments_skips_informational_only_issues() -> None:
    state = PoolState(pool_size=4, assignments=(_assignment("slot-01"),))
    issues = (
        SyncIssue(code="orphan-dir", message="m", slot_name="slot-07"),
        SyncIssue(code="untracked-worktree", message="m", slot_name="slot-08"),
    )

    assert find_stale_assignments(state, issues) == ()


def test_find_stale_assignments_ignores_codes_for_unknown_slots() -> None:
    state = PoolState(pool_size=4, assignments=(_assignment("slot-01"),))
    issues = (SyncIssue(code="missing-branch", message="m", slot_name="slot-99"),)

    assert find_stale_assignments(state, issues) == ()


def test_find_stale_assignments_first_repairable_code_wins() -> None:
    state = PoolState(pool_size=4, assignments=(_assignment("slot-01"),))
    issues = (
        SyncIssue(code="orphan-state", message="m", slot_name="slot-01"),
        SyncIssue(code="missing-branch", message="m", slot_name="slot-01"),
    )

    stale = find_stale_assignments(state, issues)

    assert len(stale) == 1
    assert stale[0].issue_code == "orphan-state"


def test_execute_repair_removes_only_stale_assignments() -> None:
    a1 = _assignment("slot-01")
    a2 = _assignment("slot-02")
    a3 = _assignment("slot-03")
    state = PoolState(pool_size=4, assignments=(a1, a2, a3))
    stale = (RepairableAssignment(assignment=a2, issue_code="missing-branch"),)

    new_state = execute_repair(state, stale)

    assert new_state.pool_size == 4
    assert tuple(a.slot_name for a in new_state.assignments) == ("slot-01", "slot-03")
    # Original state is untouched (immutability check).
    assert tuple(a.slot_name for a in state.assignments) == ("slot-01", "slot-02", "slot-03")


def test_execute_repair_no_op_when_nothing_stale() -> None:
    state = PoolState(pool_size=4, assignments=(_assignment("slot-01"),))

    new_state = execute_repair(state, ())

    assert new_state == state


def test_execute_repair_returns_new_instance() -> None:
    a1 = _assignment("slot-01")
    state = PoolState(pool_size=4, assignments=(a1,))
    stale = (RepairableAssignment(assignment=a1, issue_code="orphan-state"),)

    new_state = execute_repair(state, stale)

    assert new_state is not state
    assert new_state.assignments == ()
