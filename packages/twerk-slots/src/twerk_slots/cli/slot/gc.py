"""`slot gc` — free slots whose branch has a merged or closed PR."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core import get_console
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRState
from twerk_slots.cli.slot.context import load_slots_context
from twerk_slots.gc import SlotGcAction, run_gc
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGcRequest:
    dry_run: Annotated[bool, click.Option(["--dry-run"], is_flag=True, default=False)] = False


@dataclass(frozen=True)
class SlotGcResultEntry:
    slot_name: str
    branch_name: str
    worktree_path: str
    action: SlotGcAction
    pr_number: int | None
    pr_state: PRState | None
    pr_url: str | None
    message: str | None


@dataclass(frozen=True)
class SlotGcResult:
    entries: tuple[SlotGcResultEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "dry_run": self.dry_run,
            "freed_count": self.freed_count,
            "kept_count": self.kept_count,
            "skipped_count": self.skipped_count,
            "error_count": self.error_count,
            "entries": [
                {
                    "slot_name": e.slot_name,
                    "branch_name": e.branch_name,
                    "worktree_path": e.worktree_path,
                    "action": e.action,
                    "pr_number": e.pr_number,
                    "pr_state": e.pr_state,
                    "pr_url": e.pr_url,
                    "message": e.message,
                }
                for e in self.entries
            ],
        }


_ACTION_LABELS: dict[SlotGcAction, tuple[str, str]] = {
    "freed": ("[green]✓ freed[/green]", "green"),
    "would_free": ("[yellow]→ would free[/yellow]", "yellow"),
    "kept_open_pr": ("[blue]• kept (open PR)[/blue]", "blue"),
    "kept_no_pr": ("[dim]• kept (no PR)[/dim]", "dim"),
    "skipped_dirty": ("[yellow]! skipped (dirty)[/yellow]", "yellow"),
    "error": ("[red]✗ error[/red]", "red"),
}


def render_slot_gc(result: SlotGcResult) -> None:
    console = get_console()
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


@clinkr_operation(
    name="gc",
    help="Free slots whose branch has a merged or closed PR.",
    human_renderer=render_slot_gc,
)
def run_slot_gc(ctx: click.Context, request: SlotGcRequest) -> SlotGcResult | ClinkrCommandError:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=slots_ctx.message)

    if not slots_ctx.pool_state.exists():
        return ClinkrCommandError(
            error_type="pool_empty",
            message="No pool configured. Run `slot checkout` first.",
        )

    outcome = run_gc(slots_ctx, dry_run=request.dry_run)
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
        freed_count=outcome.freed_count,
        kept_count=outcome.kept_count,
        skipped_count=outcome.skipped_count,
        error_count=outcome.error_count,
        dry_run=outcome.dry_run,
    )
