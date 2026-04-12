"""Worktree pool state dataclasses.

Persistence lives in :class:`twerk_slots.gateway.pool_state_gateway.PoolStateGateway`.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

DEFAULT_POOL_SIZE = 16


@dataclass(frozen=True)
class SlotAssignment:
    """A branch currently assigned to a pool slot."""

    slot_name: str
    branch_name: str
    assigned_at: str
    worktree_path: Path


@dataclass(frozen=True)
class PoolState:
    """Complete state of the worktree pool."""

    pool_size: int
    assignments: tuple[SlotAssignment, ...]

    def with_assignment_added(self, assignment: SlotAssignment) -> PoolState:
        """Return a new :class:`PoolState` with ``assignment`` appended.

        Enforces the pool's internal invariants:

        * ``slot_name`` must not already be assigned.
        * ``branch_name`` must not already be assigned to another slot.
        * Total assignment count must not exceed ``pool_size``.

        Raises :class:`AssertionError` when any invariant would be violated.
        """
        existing_slots = {a.slot_name for a in self.assignments}
        existing_branches = {a.branch_name for a in self.assignments}
        if assignment.slot_name in existing_slots:
            raise AssertionError(
                f"slot {assignment.slot_name!r} is already assigned; "
                f"remove the existing assignment before adding a new one"
            )
        if assignment.branch_name in existing_branches:
            raise AssertionError(
                f"branch {assignment.branch_name!r} is already assigned to another slot"
            )
        if len(self.assignments) + 1 > self.pool_size:
            raise AssertionError(
                f"pool is at capacity ({self.pool_size} assignments); "
                f"evict an assignment before adding a new one"
            )
        return PoolState(
            pool_size=self.pool_size,
            assignments=(*self.assignments, assignment),
        )
