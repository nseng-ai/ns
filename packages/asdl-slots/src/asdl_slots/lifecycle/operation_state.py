"""Recovery messaging for slot lifecycle Git operation states."""

from __future__ import annotations

from pathlib import Path


def operation_recovery_instruction(operation: str) -> str:
    """Return the lower-case recovery instruction fragment for an operation state."""
    if operation == "rebase":
        return "run `git rebase --continue`/`--abort` there"
    if operation == "bisect":
        return "run `git bisect reset` there"
    return "finish or abort it there"


def operation_in_progress_detail(
    *,
    branch_name: str | None,
    worktree_path: Path,
    operation: str,
    action: str,
) -> str:
    """Return operation-in-progress detail for callers that render slot fields separately."""
    branch = branch_name or "unknown branch"
    return (
        f"{operation} in progress for '{branch}' at {worktree_path}; "
        f"{operation_recovery_instruction(operation)} before {action}."
    )


def slot_operation_in_progress_message(
    *,
    slot_name: str,
    branch_name: str | None,
    worktree_path: Path,
    operation: str,
    action: str,
) -> str:
    """Return the full slot-prefixed operation-in-progress message."""
    detail = operation_in_progress_detail(
        branch_name=branch_name,
        worktree_path=worktree_path,
        operation=operation,
        action=action,
    )
    return f"{slot_name} has a {detail}"
