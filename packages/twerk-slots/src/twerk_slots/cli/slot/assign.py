from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any

import click

from twerk_core import get_console
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_slots.allocation import (
    DetachedHeadError,
    DirtyCurrentWorktreeError,
    PoolFullError,
    SlotAllocationResult,
    allocate_slot_for_branch,
    allocate_slot_for_current_branch,
)
from twerk_slots.cli.slot._context import build_slots_context
from twerk_slots.repo_context import NoRepoSentinel, ensure_slots_metadata_dir


@dataclass(frozen=True)
class SlotAssignRequest:
    branch_name: Annotated[
        str | None,
        click.Argument(["branch_name"], required=False, default=None),
    ] = None
    current: Annotated[bool, click.Option(["--current"], is_flag=True, default=False)] = False
    force: Annotated[bool, click.Option(["--force"], is_flag=True, default=False)] = False


@dataclass(frozen=True)
class SlotAssignResult:
    slot_name: str
    branch_name: str
    worktree_path: str
    already_assigned: bool
    evicted_slot: str | None
    current_wt_note: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slot_name": self.slot_name,
            "branch_name": self.branch_name,
            "worktree_path": self.worktree_path,
            "already_assigned": self.already_assigned,
            "evicted_slot": self.evicted_slot,
            "current_wt_note": self.current_wt_note,
        }


def render_slot_assign(result: SlotAssignResult) -> None:
    console = get_console()
    if result.evicted_slot is not None:
        console.print(
            f"[yellow]Evicted {result.evicted_slot} to make room for {result.branch_name}[/yellow]"
        )
    if result.current_wt_note is not None:
        console.print(f"[yellow]{result.current_wt_note}[/yellow]")
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


def _result_from_allocation(
    allocation: SlotAllocationResult,
    *,
    current_wt_note: str | None = None,
) -> SlotAssignResult:
    return SlotAssignResult(
        slot_name=allocation.slot_name,
        branch_name=allocation.branch_name,
        worktree_path=str(allocation.worktree_path),
        already_assigned=allocation.already_assigned,
        evicted_slot=allocation.evicted_slot,
        current_wt_note=current_wt_note,
    )


def _pool_full_error(outcome: PoolFullError) -> ClinkrCommandError:
    return ClinkrCommandError(
        error_type="pool_full",
        message=(
            f"Pool is full. Oldest slot {outcome.oldest_slot} holds "
            f"'{outcome.oldest_branch}'. Re-run with --force to evict it."
        ),
    )


@clinkr_operation(
    name="assign",
    help="Assign a branch to a pool slot and create its worktree.",
    human_renderer=render_slot_assign,
)
def run_assign_slot(request: SlotAssignRequest) -> SlotAssignResult | ClinkrCommandError:
    if request.current and request.branch_name is not None:
        return ClinkrCommandError(
            error_type="mutually_exclusive_args",
            message="Pass BRANCH_NAME or --current, not both.",
        )
    if not request.current and request.branch_name is None:
        return ClinkrCommandError(
            error_type="missing_arg",
            message="Pass BRANCH_NAME or --current to identify the branch.",
        )

    ctx = build_slots_context()
    if isinstance(ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=ctx.message)

    ensure_slots_metadata_dir(ctx.repo, ctx.storage)
    now = datetime.now(UTC).isoformat()

    if request.current:
        current_outcome = allocate_slot_for_current_branch(
            ctx, cwd=ctx.repo.root, now=now, force=request.force
        )
        if isinstance(current_outcome, DetachedHeadError):
            return ClinkrCommandError(
                error_type="detached_head",
                message=(
                    f"HEAD at {current_outcome.cwd} is detached. Check out a branch "
                    f"before running `slot assign --current`."
                ),
            )
        if isinstance(current_outcome, DirtyCurrentWorktreeError):
            return ClinkrCommandError(
                error_type="dirty_worktree",
                message=(
                    f"Current worktree at {current_outcome.cwd} has uncommitted changes. "
                    f"Commit or stash before running `slot assign --current`."
                ),
            )
        if isinstance(current_outcome, PoolFullError):
            return _pool_full_error(current_outcome)
        return _result_from_allocation(
            current_outcome.allocation, current_wt_note=current_outcome.current_wt_note
        )

    assert request.branch_name is not None  # mutual-exclusion validated above
    if not ctx.git.branch_exists(request.branch_name):
        return ClinkrCommandError(
            error_type="branch_missing",
            message=f"Branch '{request.branch_name}' does not exist. Create it first.",
        )

    outcome = allocate_slot_for_branch(
        ctx,
        branch_name=request.branch_name,
        now=now,
        force=request.force,
    )
    if isinstance(outcome, PoolFullError):
        return _pool_full_error(outcome)
    return _result_from_allocation(outcome)
