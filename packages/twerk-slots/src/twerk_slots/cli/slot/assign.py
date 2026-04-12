from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any

import click

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_core import get_console
from twerk_slots.allocation import (
    PoolFullError,
    allocate_slot_for_branch,
)
from twerk_slots.cli.slot._context import build_slots_context
from twerk_slots.repo_context import NoRepoSentinel, ensure_slots_metadata_dir


@dataclass(frozen=True)
class SlotAssignRequest:
    branch_name: str
    force: Annotated[bool, click.Option(["--force"], is_flag=True, default=False)]


@dataclass(frozen=True)
class SlotAssignResult:
    slot_name: str
    branch_name: str
    worktree_path: str
    already_assigned: bool
    evicted_slot: str | None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slot_name": self.slot_name,
            "branch_name": self.branch_name,
            "worktree_path": self.worktree_path,
            "already_assigned": self.already_assigned,
            "evicted_slot": self.evicted_slot,
        }


def render_slot_assign(result: SlotAssignResult) -> None:
    console = get_console()
    if result.evicted_slot is not None:
        console.print(
            f"[yellow]Evicted {result.evicted_slot} to make room for {result.branch_name}[/yellow]"
        )
    if result.already_assigned:
        console.print(
            f"[dim]{result.branch_name}[/dim] is already assigned to "
            f"[bold cyan]{result.slot_name}[/bold cyan]"
        )
    else:
        console.print(
            f"Assigned [bold cyan]{result.slot_name}[/bold cyan] -> "
            f"[green]{result.branch_name}[/green]"
        )
    # Pipeable worktree path on its own line.
    click.echo(result.worktree_path)


@clinkr_operation(
    name="assign",
    help="Assign a branch to a pool slot and create its worktree.",
    human_renderer=render_slot_assign,
)
def run_assign_slot(request: SlotAssignRequest) -> SlotAssignResult | ClinkrCommandError:
    ctx = build_slots_context()
    if isinstance(ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=ctx.message)

    if not ctx.git.branch_exists(ctx.repo.root, request.branch_name):
        return ClinkrCommandError(
            error_type="branch_missing",
            message=f"Branch '{request.branch_name}' does not exist. Create it first.",
        )

    ensure_slots_metadata_dir(ctx.repo, ctx.storage)

    now = datetime.now(UTC).isoformat()
    outcome = allocate_slot_for_branch(
        ctx,
        branch_name=request.branch_name,
        now=now,
        force=request.force,
    )

    if isinstance(outcome, PoolFullError):
        return ClinkrCommandError(
            error_type="pool_full",
            message=(
                f"Pool is full. Oldest slot {outcome.oldest_slot} holds "
                f"'{outcome.oldest_branch}'. Re-run with --force to evict it."
            ),
        )

    return SlotAssignResult(
        slot_name=outcome.slot_name,
        branch_name=outcome.branch_name,
        worktree_path=str(outcome.worktree_path),
        already_assigned=outcome.already_assigned,
        evicted_slot=outcome.evicted_slot,
    )
