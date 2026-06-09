"""`slot gc` — free slots whose branch has a merged or closed PR."""

from __future__ import annotations

import sys
from typing import Annotated

import click
from rich.console import Console

from asdl_core import get_console
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRState
from asdl_slots.cli.slot.cleanup_rendering import (
    SlotCleanupResult,
    cleanup_failure_text,
    cleanup_preview_line,
    cleanup_result_line,
    cleanup_skipped_text,
    cleanup_success_text,
    cleanup_to_result,
)
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.lifecycle.outcomes import (
    SlotFreeCleanupAction,
    SlotGcAction,
    SlotGcOutcome,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release import (
    execute_gc_release,
    outcome_from_gc_release_preview,
    plan_gc_release,
)
from asdl_slots.repo_context import NoRepoSentinel


class SlotGcRequest(ClinkrModel):
    dry_run: Annotated[bool, click.Option(["--dry-run"], is_flag=True, default=False)] = False
    force: Annotated[bool, click.Option(["-f", "--force"], is_flag=True, default=False)] = False
    delete_branches: Annotated[
        bool,
        click.Option(
            ["--delete-branches"],
            is_flag=True,
            default=False,
            help="Force-delete local branches after successfully freeing eligible slots.",
        ),
    ] = False


SLOT_GC_DELETE_BRANCH_CLEANUP_ACTIONS: tuple[SlotFreeCleanupAction, ...] = ("local_branch",)


class SlotGcResultEntry(ClinkrModel):
    slot_name: str
    branch_name: str
    worktree_path: str
    action: SlotGcAction
    pr_number: int | None
    pr_state: PRState | None
    pr_url: str | None
    message: str | None
    cleanup: tuple[SlotCleanupResult, ...] = ()


class SlotGcResult(ClinkrModel):
    entries: tuple[SlotGcResultEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    cleanup_error_count: int = 0
    dry_run: bool
    cancelled: bool = False


_ACTION_LABELS: dict[SlotGcAction, tuple[str, str]] = {
    "freed": ("[green]✓ freed[/green]", "green"),
    "would_free": ("[yellow]→ would free[/yellow]", "yellow"),
    "kept_open_pr": ("[blue]• kept (open PR)[/blue]", "blue"),
    "kept_no_pr": ("[dim]• kept (no PR)[/dim]", "dim"),
    "skipped_dirty": ("[yellow]! skipped (dirty)[/yellow]", "yellow"),
    "skipped_operation": ("[yellow]! skipped (operation)[/yellow]", "yellow"),
    "error": ("[red]✗ error[/red]", "red"),
}


def _gc_console(*, err: bool = False) -> Console:
    if err:
        return Console(file=sys.stderr)
    return get_console()


def render_slot_gc(result: SlotGcResult, *, err: bool = False) -> None:
    console = _gc_console(err=err)
    if result.cancelled:
        console.print("[yellow]Cancelled — no slots freed.[/yellow]")
        return
    if not result.entries:
        console.print("[dim]No assignments to sweep.[/dim]")
        return

    for entry in result.entries:
        label, _colour = _ACTION_LABELS[entry.action]
        pr_suffix = ""
        if entry.pr_number is not None:
            pr_suffix = f" [dim]PR #{entry.pr_number} {entry.pr_state}[/dim]"
        console.print(
            f"{label} [bold cyan]{entry.slot_name}[/bold cyan] "
            f"([yellow]{entry.branch_name}[/yellow]){pr_suffix}"
        )
        if entry.message:
            console.print(f"    [dim]{entry.message}[/dim]")
        for cleanup in entry.cleanup:
            if result.dry_run:
                console.print(f"    {cleanup_preview_line(cleanup)}")
            else:
                console.print(f"    {cleanup_result_line(cleanup)}")

    verb = "Would free" if result.dry_run else "Freed"
    summary = (
        f"\n[bold]{verb} {result.freed_count}[/bold]; "
        f"kept {result.kept_count}; "
        f"skipped {result.skipped_count}; "
        f"errors {result.error_count}"
    )
    if result.cleanup_error_count:
        summary = f"{summary}; cleanup errors {result.cleanup_error_count}"
    console.print(summary)


def _confirm_free_slots(count: int, *, delete_branches: bool = False) -> bool:
    """Confirm on stderr without leaking echoed test input into stdout."""
    while True:
        prompt = (
            f"Free {count} slot(s) and delete local branches? [Y/n]: "
            if delete_branches
            else f"Free {count} slot(s)? [Y/n]: "
        )
        click.echo(prompt, err=True, nl=False)
        sys.stderr.flush()
        raw_value = sys.stdin.readline()
        if raw_value == "":
            raise click.Abort()
        value = raw_value.strip().lower()
        if value in ("", "y", "yes"):
            return True
        if value in ("n", "no"):
            return False
        click.echo("Error: invalid input", err=True)


def _result_from_outcome(outcome: SlotGcOutcome, *, cancelled: bool = False) -> SlotGcResult:
    return SlotGcResult(
        entries=tuple(
            SlotGcResultEntry(
                slot_name=e.slot_name,
                branch_name=e.branch_name,
                worktree_path=str(e.worktree_path),
                action=e.action,
                pr_number=e.pr_number,
                pr_state=e.pr_state,
                pr_url=e.pr_url,
                message=e.message,
                cleanup=cleanup_to_result(e.cleanup),
            )
            for e in outcome.entries
        ),
        freed_count=0 if cancelled else outcome.freed_count,
        kept_count=outcome.kept_count,
        skipped_count=outcome.skipped_count,
        error_count=outcome.error_count,
        cleanup_error_count=outcome.cleanup_error_count,
        dry_run=outcome.dry_run,
        cancelled=cancelled,
    )


def _cleanup_error_message(result: SlotGcResult) -> str:
    lines: list[str] = []
    for entry in result.entries:
        if not any(cleanup.status == "error" for cleanup in entry.cleanup):
            continue
        if result.dry_run:
            lines.append(f"Would free {entry.slot_name} ({entry.branch_name})")
        else:
            lines.append(f"✓ Freed {entry.slot_name} ({entry.branch_name})")
            lines.append(f"  Worktree kept at {entry.worktree_path}; detached HEAD at trunk")
        for cleanup in entry.cleanup:
            if cleanup.status == "success":
                lines.append(f"  ✓ {cleanup_success_text(cleanup)}")
            elif cleanup.status == "skipped":
                lines.append(f"  - {cleanup_skipped_text(cleanup)}")
            elif cleanup.status == "error":
                lines.append(f"  ✗ {cleanup_failure_text(cleanup)}")
    if not lines:
        return "Cleanup failed."
    return "\n".join(lines)


def _exit_for_result(result: SlotGcResult) -> ClinkrExit[SlotGcResult]:
    if result.cleanup_error_count:
        return ClinkrExit.negative(result, message=_cleanup_error_message(result))
    return ClinkrExit.ok(result)


@clinkr_operation(
    name="gc",
    help="Free slots whose branch has a merged or closed PR.",
    human_renderer=render_slot_gc,
)
def run_slot_gc(ctx: click.Context, request: SlotGcRequest) -> ClinkrExit[SlotGcResult]:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        Ensure.fail(error_type="not_in_repo", message=slots_ctx.message)

    Ensure.true(
        not (request.dry_run and request.force),
        error_type="conflicting_flags",
        message="--dry-run and --force are mutually exclusive.",
    )

    cleanup_actions = SLOT_GC_DELETE_BRANCH_CLEANUP_ACTIONS if request.delete_branches else ()

    preview = plan_gc_release(slots_ctx, cleanup_actions=cleanup_actions)
    if isinstance(preview, SlotLifecycleFailure):
        return ClinkrExit.failure(error_type=preview.error_type, message=preview.message)

    if request.dry_run:
        result = _result_from_outcome(preview.outcome)
        return _exit_for_result(result)

    if preview.plan.would_free_count == 0:
        outcome = outcome_from_gc_release_preview(preview, dry_run=False)
        return ClinkrExit.ok(_result_from_outcome(outcome))

    if request.force:
        result = _result_from_outcome(execute_gc_release(slots_ctx, preview))
        return _exit_for_result(result)

    render_slot_gc(_result_from_outcome(preview.outcome), err=True)
    sys.stderr.flush()
    proceed = _confirm_free_slots(
        preview.plan.would_free_count,
        delete_branches=request.delete_branches,
    )
    if proceed:
        result = _result_from_outcome(execute_gc_release(slots_ctx, preview))
        return _exit_for_result(result)
    return ClinkrExit.ok(
        _result_from_outcome(
            outcome_from_gc_release_preview(preview, dry_run=False),
            cancelled=True,
        )
    )
