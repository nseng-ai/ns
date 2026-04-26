from __future__ import annotations

from pathlib import Path

import pytest

from twerk_slots.pool_state import (
    AssignmentFound,
    AssignmentMissing,
    PoolState,
    SlotAssignment,
)

NOW = "2026-04-12T00:00:00+00:00"


def _assignment(slot_name: str, branch_name: str) -> SlotAssignment:
    return SlotAssignment(
        slot_name=slot_name,
        branch_name=branch_name,
        assigned_at=NOW,
        worktree_path=Path(f"/wt/{slot_name}"),
    )


def test_with_assignment_added_appends_to_empty_state() -> None:
    state = PoolState(pool_size=4, assignments=())
    assignment = _assignment("slot-01", "feat/x")

    new_state = state.with_assignment_added(assignment)

    assert new_state.pool_size == 4
    assert new_state.assignments == (assignment,)
    assert state.assignments == ()  # original untouched


def test_with_assignment_added_preserves_existing_assignments() -> None:
    first = _assignment("slot-01", "feat/a")
    state = PoolState(pool_size=4, assignments=(first,))
    second = _assignment("slot-02", "feat/b")

    new_state = state.with_assignment_added(second)

    assert new_state.assignments == (first, second)


def test_with_assignment_added_rejects_duplicate_slot_name() -> None:
    state = PoolState(pool_size=4, assignments=(_assignment("slot-01", "feat/a"),))

    with pytest.raises(AssertionError, match="slot 'slot-01' is already assigned"):
        state.with_assignment_added(_assignment("slot-01", "feat/b"))


def test_with_assignment_added_rejects_duplicate_branch_name() -> None:
    state = PoolState(pool_size=4, assignments=(_assignment("slot-01", "feat/a"),))

    with pytest.raises(AssertionError, match="branch 'feat/a' is already assigned"):
        state.with_assignment_added(_assignment("slot-02", "feat/a"))


def test_with_assignment_added_rejects_over_capacity() -> None:
    state = PoolState(
        pool_size=2,
        assignments=(
            _assignment("slot-01", "feat/a"),
            _assignment("slot-02", "feat/b"),
        ),
    )

    with pytest.raises(AssertionError, match="pool is at capacity"):
        state.with_assignment_added(_assignment("slot-03", "feat/c"))


def test_with_assignment_added_allows_filling_to_exact_capacity() -> None:
    state = PoolState(pool_size=2, assignments=(_assignment("slot-01", "feat/a"),))
    second = _assignment("slot-02", "feat/b")

    new_state = state.with_assignment_added(second)

    assert len(new_state.assignments) == 2


def test_with_assignment_removed_drops_slot() -> None:
    first = _assignment("slot-01", "feat/a")
    second = _assignment("slot-02", "feat/b")
    state = PoolState(pool_size=4, assignments=(first, second))

    new_state = state.with_assignment_removed("slot-01")

    assert new_state.pool_size == 4
    assert new_state.assignments == (second,)
    assert state.assignments == (first, second)  # original untouched


def test_with_assignment_removed_empty_result() -> None:
    first = _assignment("slot-01", "feat/a")
    state = PoolState(pool_size=4, assignments=(first,))

    new_state = state.with_assignment_removed("slot-01")

    assert new_state.assignments == ()


def test_with_assignment_removed_missing_asserts() -> None:
    state = PoolState(pool_size=4, assignments=(_assignment("slot-01", "feat/a"),))

    with pytest.raises(AssertionError, match="slot 'slot-02' is not currently assigned"):
        state.with_assignment_removed("slot-02")


def test_find_by_slot_returns_found_when_assigned() -> None:
    assignment = _assignment("slot-01", "feat/a")
    state = PoolState(pool_size=4, assignments=(assignment,))

    result = state.find_by_slot("slot-01")

    assert isinstance(result, AssignmentFound)
    assert result.assignment is assignment


def test_find_by_slot_returns_missing_when_unassigned() -> None:
    state = PoolState(pool_size=4, assignments=(_assignment("slot-01", "feat/a"),))

    result = state.find_by_slot("slot-02")

    assert isinstance(result, AssignmentMissing)
    assert result.queried == "slot-02"


def test_find_by_branch_returns_found_when_assigned() -> None:
    assignment = _assignment("slot-01", "feat/a")
    state = PoolState(pool_size=4, assignments=(assignment,))

    result = state.find_by_branch("feat/a")

    assert isinstance(result, AssignmentFound)
    assert result.assignment is assignment


def test_find_by_branch_returns_missing_when_unassigned() -> None:
    state = PoolState(pool_size=4, assignments=(_assignment("slot-01", "feat/a"),))

    result = state.find_by_branch("feat/b")

    assert isinstance(result, AssignmentMissing)
    assert result.queried == "feat/b"
