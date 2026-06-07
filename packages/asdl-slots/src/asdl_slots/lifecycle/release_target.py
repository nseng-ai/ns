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
    error_type: str
    reason: ReleaseTargetFailureReason
    message: str
    slot_name: str
    branch_name: str
    worktree_path: Path


def operation_recovery_instruction(operation: str) -> str:
    if operation == "rebase":
        return "run `git rebase --continue`/`--abort` there"
    if operation == "bisect":
        return "run `git bisect reset` there"
    return "finish or abort it there"


def free_operation_in_progress_message(
    *,
    slot_name: str,
    branch_name: str,
    worktree_path: Path,
    operation: str,
    action: str,
) -> str:
    return (
        f"{slot_name} has a {operation} in progress for '{branch_name}' at {worktree_path}; "
        f"{operation_recovery_instruction(operation)} before {action}."
    )


def gc_operation_in_progress_message(record: SlotRecord, *, action: str) -> str:
    branch = record.branch or "unknown branch"
    assert record.operation is not None
    return (
        f"{record.operation} in progress for '{branch}' at {record.path}; "
        f"{operation_recovery_instruction(record.operation)} before {action}."
    )


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
    *,
    operation_action: str,
) -> FreedSlot | ReleaseTargetFailure:
    """Recheck and detach one assigned target without owning caller policy."""
    record = inventory.find_by_slot(target.slot_name)
    if record is None or record.branch is None:
        return ReleaseTargetFailure(
            error_type="slot_not_assigned",
            reason="slot_not_assigned",
            message=f"{target.slot_name} is not currently assigned.",
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=target.worktree_path,
        )

    if record.branch != target.branch_name:
        return ReleaseTargetFailure(
            error_type="slot_not_assigned",
            reason="slot_not_assigned",
            message=(
                f"slot {target.slot_name} was not assigned to {target.branch_name} "
                "during free (state changed between plan and execute)."
            ),
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=record.path,
        )

    if record.operation is not None:
        return ReleaseTargetFailure(
            error_type="operation_in_progress",
            reason="operation_in_progress",
            message=free_operation_in_progress_message(
                slot_name=record.slot_name,
                branch_name=record.branch,
                worktree_path=record.path,
                operation=record.operation,
                action=operation_action,
            ),
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=record.path,
        )

    if git.has_uncommitted_changes(record.path):
        return ReleaseTargetFailure(
            error_type="dirty_worktree",
            reason="dirty_worktree",
            message=f"worktree has uncommitted changes at {record.path}",
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=record.path,
        )

    try:
        git.detach_head(record.path, trunk_branch)
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else str(exc)
        return ReleaseTargetFailure(
            error_type="slot_allocation_error",
            reason="detach_failed",
            message=(
                f"Failed to detach {target.slot_name} at {record.path} to {trunk_branch}: {stderr}"
            ),
            slot_name=target.slot_name,
            branch_name=target.branch_name,
            worktree_path=record.path,
        )

    return freed_slot_from_record(record)
