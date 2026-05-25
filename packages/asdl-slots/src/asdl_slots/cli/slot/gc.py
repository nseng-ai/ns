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
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.lifecycle.gc import execute_gc_plan, outcome_from_gc_plan, plan_gc
from asdl_slots.lifecycle.outcomes import SlotGcAction, SlotGcOutcome, SlotLifecycleFailure
from asdl_slots.repo_context import NoRepoSentinel


class SlotGcRequest(ClinkrModel):
    dry_run: Annotated[bool, click.Option(["--dry-run"], is_flag=True, default=False)] = False
    force: Annotated[bool, click.Option(["-f", "--force"], is_flag=True, default=False)] = False


class SlotGcResultEntry(ClinkrModel):
    slot_name: str
    branch_name: str
    worktree_path: str
    action: SlotGcAction
    pr_number: int | None
    pr_state: PRState | None
    pr_url: str | None
    message: str | None


class SlotGcResult(ClinkrModel):
    entries: tuple[SlotGcResultEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool
    cancelled: bool = False


_ACTION_LABELS: dict[SlotGcAction, tuple[str, str]] = {
    "freed": ("[green]✓ freed[/green]", "green"),
    "would_free": ("[yellow]→ would free[/yellow]", "yellow"),
    "kept_open_pr": ("[blue]• kept (open PR)[/blue]", "blue"),
    "kept_no_pr": ("[dim]• kept (no PR)[/dim]", "dim"),
    "skipped_dirty": ("[yellow]! skipped (dirty)[/yellow]", "yellow"),
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

    verb = "Would free" if result.dry_run else "Freed"
    console.print(
        f"\n[bold]{verb} {result.freed_count}[/bold]; "
        f"kept {result.kept_count}; "
        f"skipped {result.skipped_count}; "
        f"errors {result.error_count}"
    )


def _confirm_free_slots(count: int) -> bool:
    """Confirm on stderr without leaking echoed test input into stdout."""
    while True:
        click.echo(f"Free {count} slot(s)? [Y/n]: ", err=True, nl=False)
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
            )
            for e in outcome.entries
        ),
        freed_count=0 if cancelled else outcome.freed_count,
        kept_count=outcome.kept_count,
        skipped_count=outcome.skipped_count,
        error_count=outcome.error_count,
        dry_run=outcome.dry_run,
        cancelled=cancelled,
    )


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

    plan = plan_gc(slots_ctx)
    if isinstance(plan, SlotLifecycleFailure):
        return ClinkrExit.failure(error_type=plan.error_type, message=plan.message)

    if request.dry_run:
        return ClinkrExit.ok(_result_from_outcome(outcome_from_gc_plan(plan, dry_run=True)))

    if plan.would_free_count == 0:
        return ClinkrExit.ok(_result_from_outcome(outcome_from_gc_plan(plan, dry_run=False)))

    if request.force:
        return ClinkrExit.ok(_result_from_outcome(execute_gc_plan(slots_ctx, plan)))

    preview = _result_from_outcome(outcome_from_gc_plan(plan, dry_run=True))
    render_slot_gc(preview, err=True)
    sys.stderr.flush()
    proceed = _confirm_free_slots(plan.would_free_count)
    if proceed:
        return ClinkrExit.ok(_result_from_outcome(execute_gc_plan(slots_ctx, plan)))
    return ClinkrExit.ok(
        _result_from_outcome(outcome_from_gc_plan(plan, dry_run=False), cancelled=True)
    )
