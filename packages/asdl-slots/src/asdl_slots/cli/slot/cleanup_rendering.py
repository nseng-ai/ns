from __future__ import annotations

from collections.abc import Sequence

from asdl_core.clinkr.models import ClinkrModel
from asdl_slots.lifecycle.outcomes import (
    SlotFreeCleanupAction,
    SlotFreeCleanupStatus,
)
from asdl_slots.lifecycle.outcomes import (
    SlotFreeCleanupResult as LifecycleCleanupResult,
)


class SlotCleanupResult(ClinkrModel):
    slot_name: str
    branch_name: str
    action: SlotFreeCleanupAction
    status: SlotFreeCleanupStatus
    pr_number: int | None = None
    message: str | None = None


def cleanup_to_result(
    entries: Sequence[LifecycleCleanupResult],
) -> tuple[SlotCleanupResult, ...]:
    return tuple(
        SlotCleanupResult(
            slot_name=entry.slot_name,
            branch_name=entry.branch_name,
            action=entry.action,
            status=entry.status,
            pr_number=entry.pr_number,
            message=entry.message,
        )
        for entry in entries
    )


def cleanup_error_count(entries: Sequence[SlotCleanupResult]) -> int:
    return sum(1 for entry in entries if entry.status == "error")


def cleanup_by_slot(
    entries: Sequence[SlotCleanupResult],
) -> dict[str, tuple[SlotCleanupResult, ...]]:
    grouped: dict[str, list[SlotCleanupResult]] = {}
    for entry in entries:
        grouped.setdefault(entry.slot_name, []).append(entry)
    return {slot_name: tuple(slot_entries) for slot_name, slot_entries in grouped.items()}


def cleanup_preview_line(entry: SlotCleanupResult) -> str:
    if entry.status == "planned":
        if entry.action == "pr":
            return f"PR: close #{entry.pr_number}"
        return f"local branch: force-delete {entry.branch_name}"
    if entry.status == "skipped":
        return f"{cleanup_subject(entry)}: skipped ({entry.message or 'already complete'})"
    return f"{cleanup_subject(entry)}: error: {entry.message or 'failed'}"


def plain_cleanup_preview_line(entry: SlotCleanupResult) -> str:
    return cleanup_preview_line(entry)


def cleanup_result_line(entry: SlotCleanupResult) -> str:
    if entry.status == "success":
        return f"[green]✓[/green] {cleanup_success_text(entry)}"
    if entry.status == "skipped":
        return f"[yellow]-[/yellow] {cleanup_skipped_text(entry)}"
    if entry.status == "planned":
        return cleanup_preview_line(entry)
    return f"[red]✗[/red] {cleanup_failure_text(entry)}"


def cleanup_subject(entry: SlotCleanupResult) -> str:
    if entry.action == "pr":
        if entry.pr_number is not None:
            return f"PR #{entry.pr_number}"
        return "PR"
    return f"local branch {entry.branch_name}"


def cleanup_success_text(entry: SlotCleanupResult) -> str:
    if entry.action == "pr":
        return f"Closed PR #{entry.pr_number}"
    return f"Force-deleted local branch {entry.branch_name}"


def cleanup_skipped_text(entry: SlotCleanupResult) -> str:
    if entry.action == "pr":
        subject = f"PR #{entry.pr_number}" if entry.pr_number is not None else "PR"
        return f"Skipped {subject}: {entry.message or 'already complete'}"
    return f"Skipped {cleanup_subject(entry)}: {entry.message or 'already complete'}"


def cleanup_failure_text(entry: SlotCleanupResult) -> str:
    message = entry.message or "failed"
    if entry.action == "pr":
        if entry.pr_number is not None:
            return f"Failed to close PR #{entry.pr_number}: {message}"
        return f"Failed to close PR: {message}"
    return f"Failed to force-delete local branch {entry.branch_name}: {message}"
