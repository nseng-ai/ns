"""Shared target-release primitives for slot free and GC."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from asdl_core.git.git_gateway import GitGateway
from asdl_slots.inventory import SlotInventory, SlotRecord
from asdl_slots.lifecycle.outcomes import FreedSlot

ReleaseTargetFailureReason = Literal[
    "slot_not_assigned",
    "operation_in_progress",
    "dirty_worktree",
    "detach_failed",
]


@dataclass(frozen=True)
class ReleaseTargetFailure:
    reason: ReleaseTargetFailureReason
    slot_name: str
    branch_name: str
    worktree_path: Path
    operation: str | None = None
    detach_ref: str | None = None
    detach_error: str | None = None

    @property
    def error_type(self) -> str:
        if self.reason == "detach_failed":
            return "slot_allocation_error"
        return self.reason


def freed_slot_from_record(record: SlotRecord) -> FreedSlot:
    assert record.branch is not None
    return FreedSlot(
        slot_name=record.slot_name,
        branch_name=record.branch,
        worktree_path=record.path,
    )


def release_assigned_slot_target(
    git: GitGateway,
    inventory: SlotInventory,
    target: FreedSlot,
    trunk_branch: str,
) -> FreedSlot | ReleaseTargetFailure:
    """Recheck and detach one assigned target without owning caller policy."""
    record = inventory.find_by_slot(target.slot_name)
    if record is None or record.branch is None:
        return ReleaseTargetFailure(
            reason="slot_not_assigned",
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=target.worktree_path,
        )

    if record.branch != target.branch_name:
        return ReleaseTargetFailure(
            reason="slot_not_assigned",
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=record.path,
        )

    if record.operation is not None:
        return ReleaseTargetFailure(
            reason="operation_in_progress",
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=record.path,
            operation=record.operation,
        )

    if git.has_uncommitted_changes(record.path):
        return ReleaseTargetFailure(
            reason="dirty_worktree",
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=record.path,
        )

    try:
        git.detach_head(record.path, trunk_branch)
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else str(exc)
        return ReleaseTargetFailure(
            reason="detach_failed",
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=record.path,
            detach_ref=trunk_branch,
            detach_error=stderr,
        )

    return freed_slot_from_record(record)
