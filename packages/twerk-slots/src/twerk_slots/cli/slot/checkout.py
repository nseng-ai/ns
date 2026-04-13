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
from twerk_slots.cli.slot.context import build_slots_context
from twerk_slots.context import SlotsCliContext
from twerk_slots.repo_context import NoRepoSentinel, ensure_slots_metadata_dir


@dataclass(frozen=True)
class SlotCheckoutRequest:
    branch_name: Annotated[
        str | None,
        click.Argument(["branch_name"], required=False, default=None),
    ] = None
    new_branch: Annotated[
        bool,
        click.Option(["-b", "--new"], "new_branch", is_flag=True, default=False),
    ] = False
    current: Annotated[bool, click.Option(["--current"], is_flag=True, default=False)] = False
    no_clipboard: Annotated[
        bool,
        click.Option(["--no-clipboard"], is_flag=True, default=False),
    ] = False


@dataclass(frozen=True)
class SlotCheckoutResult:
    slot_name: str
    branch_name: str
    worktree_path: str
    cd_command: str
    already_assigned: bool
    created_branch: bool
    evicted_slot: str | None
    current_wt_note: str | None
    clipboard_copied: bool
    clipboard_skipped: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slot_name": self.slot_name,
            "branch_name": self.branch_name,
            "worktree_path": self.worktree_path,
            "cd_command": self.cd_command,
            "already_assigned": self.already_assigned,
            "created_branch": self.created_branch,
            "evicted_slot": self.evicted_slot,
            "current_wt_note": self.current_wt_note,
            "clipboard_copied": self.clipboard_copied,
            "clipboard_skipped": self.clipboard_skipped,
        }


def render_slot_checkout(result: SlotCheckoutResult) -> None:
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
            f"Checked out [bold cyan]{result.slot_name}[/bold cyan] -> "
            f"[green]{result.branch_name}[/green]"
        )
    click.echo(result.cd_command)
    if result.clipboard_skipped:
        return
    if result.clipboard_copied:
        console.print("[dim]Copied cd command to clipboard.[/dim]")
    else:
        console.print("[dim]Clipboard unavailable (pbcopy failed).[/dim]")


def _pool_full_error(outcome: PoolFullError) -> ClinkrCommandError:
    return ClinkrCommandError(
        error_type="pool_full",
        message=(
            f"Pool is full. Oldest slot {outcome.oldest_slot} holds "
            f"'{outcome.oldest_branch}'. Free a slot before checking out a new branch."
        ),
    )


def _build_result(
    ctx: SlotsCliContext,
    allocation: SlotAllocationResult,
    *,
    created_branch: bool,
    current_wt_note: str | None,
    no_clipboard: bool,
) -> SlotCheckoutResult:
    worktree_path = str(allocation.worktree_path)
    cd_command = f"cd {worktree_path}"
    clipboard_copied = False
    if not no_clipboard:
        clipboard_copied = ctx.clipboard.copy(cd_command)
    return SlotCheckoutResult(
        slot_name=allocation.slot_name,
        branch_name=allocation.branch_name,
        worktree_path=worktree_path,
        cd_command=cd_command,
        already_assigned=allocation.already_assigned,
        created_branch=created_branch,
        evicted_slot=allocation.evicted_slot,
        current_wt_note=current_wt_note,
        clipboard_copied=clipboard_copied,
        clipboard_skipped=no_clipboard,
    )


@clinkr_operation(
    name="checkout",
    help="Check out a branch into a pool slot worktree (like `git checkout [-b]`).",
    human_renderer=render_slot_checkout,
)
def run_checkout_slot(request: SlotCheckoutRequest) -> SlotCheckoutResult | ClinkrCommandError:
    inputs_provided = sum((request.branch_name is not None, request.current))
    if inputs_provided > 1:
        return ClinkrCommandError(
            error_type="mutually_exclusive_args",
            message="Pass exactly one of BRANCH_NAME or --current.",
        )
    if inputs_provided == 0:
        return ClinkrCommandError(
            error_type="missing_arg",
            message="Pass BRANCH_NAME or --current to identify the branch.",
        )
    if request.current and request.new_branch:
        return ClinkrCommandError(
            error_type="mutually_exclusive_args",
            message="-b/--new cannot be combined with --current.",
        )

    ctx = build_slots_context()
    if isinstance(ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=ctx.message)

    ensure_slots_metadata_dir(ctx.repo, ctx.storage)
    now = datetime.now(UTC).isoformat()

    if request.current:
        current_outcome = allocate_slot_for_current_branch(
            ctx, cwd=ctx.repo.root, now=now, force=False
        )
        if isinstance(current_outcome, DetachedHeadError):
            return ClinkrCommandError(
                error_type="detached_head",
                message=(
                    f"HEAD at {current_outcome.cwd} is detached. Check out a branch "
                    f"before running `slot checkout --current`."
                ),
            )
        if isinstance(current_outcome, DirtyCurrentWorktreeError):
            return ClinkrCommandError(
                error_type="dirty_worktree",
                message=(
                    f"Current worktree at {current_outcome.cwd} has uncommitted changes. "
                    f"Commit or stash before running `slot checkout --current`."
                ),
            )
        if isinstance(current_outcome, PoolFullError):
            return _pool_full_error(current_outcome)
        return _build_result(
            ctx,
            current_outcome.allocation,
            created_branch=False,
            current_wt_note=current_outcome.current_wt_note,
            no_clipboard=request.no_clipboard,
        )

    assert request.branch_name is not None  # validated above
    branch_name = request.branch_name
    branch_exists = ctx.git.branch_exists(branch_name)
    created_branch = False

    if request.new_branch:
        if branch_exists:
            return ClinkrCommandError(
                error_type="branch_exists",
                message=(
                    f"Branch '{branch_name}' already exists. "
                    f"Drop -b to check out the existing branch."
                ),
            )
        ctx.git.create_branch(branch_name, "HEAD", force=False)
        created_branch = True
    elif not branch_exists:
        return ClinkrCommandError(
            error_type="branch_missing",
            message=(
                f"Branch '{branch_name}' does not exist. Pass -b/--new to create it from HEAD."
            ),
        )

    outcome = allocate_slot_for_branch(
        ctx,
        branch_name=branch_name,
        now=now,
        force=False,
    )
    if isinstance(outcome, PoolFullError):
        return _pool_full_error(outcome)
    return _build_result(
        ctx,
        outcome,
        created_branch=created_branch,
        current_wt_note=None,
        no_clipboard=request.no_clipboard,
    )
