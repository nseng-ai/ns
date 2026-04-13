"""Pure repair logic: map sync issues to stale assignments and filter them out.

All functions are pure — they accept :class:`PoolState` / :class:`SyncIssue`
inputs and return new values. Persistence is the CLI layer's job.
"""

from __future__ import annotations

from dataclasses import dataclass

from twerk_slots.diagnostics import SyncIssue, SyncIssueCode
from twerk_slots.pool_state import PoolState, SlotAssignment

REPAIRABLE_CODES: frozenset[SyncIssueCode] = frozenset(
    {
        "orphan-state",
        "missing-branch",
        "git-registry-missing",
        "branch-mismatch",
    }
)


@dataclass(frozen=True)
class RepairableAssignment:
    """Pairs a stale assignment with the issue code that condemns it."""

    assignment: SlotAssignment
    issue_code: SyncIssueCode


def find_stale_assignments(
    state: PoolState,
    issues: tuple[SyncIssue, ...],
) -> tuple[RepairableAssignment, ...]:
    """Return assignments in ``state`` flagged by a repairable issue code."""
    slot_to_code: dict[str, SyncIssueCode] = {}
    for issue in issues:
        if issue.code in REPAIRABLE_CODES:
            # First repairable code wins — deterministic and stable.
            slot_to_code.setdefault(issue.slot_name, issue.code)

    result: list[RepairableAssignment] = []
    for assignment in state.assignments:
        code = slot_to_code.get(assignment.slot_name)
        if code is None:
            continue
        result.append(RepairableAssignment(assignment=assignment, issue_code=code))
    return tuple(result)


def execute_repair(
    state: PoolState,
    stale: tuple[RepairableAssignment, ...],
) -> PoolState:
    """Return a new :class:`PoolState` with ``stale`` assignments removed."""
    stale_slots = {ra.assignment.slot_name for ra in stale}
    return PoolState(
        pool_size=state.pool_size,
        assignments=tuple(a for a in state.assignments if a.slot_name not in stale_slots),
    )
