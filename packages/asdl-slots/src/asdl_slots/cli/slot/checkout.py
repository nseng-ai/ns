from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

import click

from asdl_core import get_console
from asdl_core.clinkr.context import is_machine_mode
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.real_git_gateway import RealGitGateway, resolve_repo_root
from asdl_slots.checkout_planning import (
    AssignToSlot,
    BranchInMainWorktree,
    CurrentCheckoutPlan,
    DetachedHeadError,
    DirtyCurrentWorktreeError,
    PoolFull,
    ReuseAssignment,
    SlotAllocationError,
    plan_checkout,
    plan_current_checkout,
)
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.clipboard import ClipboardCopySuccess
from asdl_slots.inventory import build_slot_inventory
from asdl_slots.naming import extract_slot_number
from asdl_slots.repo_context import NoRepoSentinel, ensure_slots_metadata_dir
from asdl_slots.shell_integration import write_cd_directive_if_active


def _complete_branch_name(ctx: click.Context, param: click.Parameter, incomplete: str) -> list[str]:
    repo_root = resolve_repo_root(Path.cwd())
    if repo_root is None:
        return []
    try:
        branches = RealGitGateway(repo_root=repo_root).list_local_branches()
    except (subprocess.CalledProcessError, OSError):
        # Shell completion callbacks must never raise — any exception that
        # escapes here breaks the user's tab-completion in the shell. Swallow
        # `git for-each-ref` failures (CalledProcessError) and missing/unrunnable
        # git binaries (OSError) and degrade silently to "no completions".
        return []
    return [b for b in branches if b.startswith(incomplete)]


@dataclass(frozen=True)
class SlotCheckoutRequest:
    branch_name: Annotated[
        str | None,
        click.Argument(
            ["branch_name"],
            required=False,
            default=None,
            shell_complete=_complete_branch_name,
        ),
    ] = None
    base: Annotated[
        str | None,
        click.Argument(["base"], required=False, default=None),
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
class SlotCheckoutResult(JsonSerializable):
    slot_name: str
    branch_name: str
    worktree_path: str
    cd_command: str
    already_assigned: bool
    created_branch: bool
    current_wt_note: str | None
    clipboard_copied: bool
    clipboard_skipped: bool
    clipboard_failure_reason: str | None
    clipboard_failure_detail: str | None


def render_slot_checkout(result: SlotCheckoutResult) -> None:
    console = get_console()
    if result.current_wt_note is not None:
        console.print(f"[yellow]{result.current_wt_note}[/yellow]")
    if result.already_assigned:
        if extract_slot_number(result.slot_name) is None:
            console.print(
                f"[dim]{result.branch_name}[/dim] is already checked out in the "
                f"main worktree at [bold cyan]{result.worktree_path}[/bold cyan]"
            )
        else:
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
        detail = result.clipboard_failure_detail or "pbcopy failed"
        console.print(f"[dim]Clipboard unavailable ({detail})[/dim]")


def _pool_full_failure(outcome: PoolFull) -> ClinkrExit[SlotCheckoutResult]:
    if outcome.assigned:
        details = "\n".join(
            f"  {record.slot_name} -> {record.branch}" for record in outcome.assigned
        )
        message = (
            f"Pool is full. Currently assigned:\n{details}\n"
            f"Free a slot before checking out a new branch."
        )
    else:
        message = (
            "Pool is full (no slots available). "
            "Run `slot init` or `slot resize` before checking out a new branch."
        )
    return ClinkrExit.failure(error_type="pool_full", message=message)


@dataclass(frozen=True)
class _ExecutedCheckout:
    slot_name: str
    branch_name: str
    worktree_path: Path
    already_assigned: bool


def _execute_plan(
    plan: ReuseAssignment | BranchInMainWorktree | AssignToSlot,
    *,
    ctx: SlotsCliContext,
    branch_name: str,
) -> _ExecutedCheckout:
    if isinstance(plan, ReuseAssignment):
        return _ExecutedCheckout(
            slot_name=plan.record.slot_name,
            branch_name=branch_name,
            worktree_path=plan.record.path,
            already_assigned=True,
        )
    if isinstance(plan, BranchInMainWorktree):
        return _ExecutedCheckout(
            slot_name="",
            branch_name=branch_name,
            worktree_path=plan.main_path,
            already_assigned=True,
        )
    ctx.git.checkout_branch(plan.record.path, branch_name)
    return _ExecutedCheckout(
        slot_name=plan.record.slot_name,
        branch_name=branch_name,
        worktree_path=plan.record.path,
        already_assigned=False,
    )


def _build_result(
    ctx: SlotsCliContext,
    executed: _ExecutedCheckout,
    *,
    created_branch: bool,
    current_wt_note: str | None,
    no_clipboard: bool,
    write_cd_directive: bool,
) -> SlotCheckoutResult:
    worktree_path = str(executed.worktree_path)
    write_cd_directive_if_active(worktree_path, enabled=write_cd_directive)
    cd_command = f"cd {worktree_path}"
    clipboard_copied = False
    clipboard_failure_reason: str | None = None
    clipboard_failure_detail: str | None = None
    if not no_clipboard:
        outcome = ctx.clipboard.copy(cd_command)
        if isinstance(outcome, ClipboardCopySuccess):
            clipboard_copied = True
        else:
            clipboard_failure_reason = outcome.reason
            clipboard_failure_detail = outcome.detail
    return SlotCheckoutResult(
        slot_name=executed.slot_name,
        branch_name=executed.branch_name,
        worktree_path=worktree_path,
        cd_command=cd_command,
        already_assigned=executed.already_assigned,
        created_branch=created_branch,
        current_wt_note=current_wt_note,
        clipboard_copied=clipboard_copied,
        clipboard_skipped=no_clipboard,
        clipboard_failure_reason=clipboard_failure_reason,
        clipboard_failure_detail=clipboard_failure_detail,
    )


@clinkr_operation(
    name="checkout",
    help=(
        "Check out a branch into an available pool slot worktree "
        "(like `git checkout [-b] [<base>]`); requires a clean detached managed slot."
    ),
    aliases=("co",),
    human_renderer=render_slot_checkout,
)
def run_checkout_slot(
    ctx: click.Context, request: SlotCheckoutRequest
) -> ClinkrExit[SlotCheckoutResult]:
    inputs_provided = sum((request.branch_name is not None, request.current))
    Ensure.true(
        inputs_provided <= 1,
        error_type="mutually_exclusive_args",
        message="Pass exactly one of BRANCH_NAME or --current.",
    )
    Ensure.true(
        inputs_provided > 0,
        error_type="missing_arg",
        message="Pass BRANCH_NAME or --current to identify the branch.",
    )
    Ensure.true(
        not (request.current and request.new_branch),
        error_type="mutually_exclusive_args",
        message="-b/--new cannot be combined with --current.",
    )
    Ensure.true(
        not (request.base is not None and not request.new_branch),
        error_type="base_without_new",
        message="BASE is only valid with -b/--new.",
    )

    slots_ctx_result = load_slots_context(ctx)
    if isinstance(slots_ctx_result, NoRepoSentinel):
        Ensure.fail(error_type="not_in_repo", message=slots_ctx_result.message)
    slots_ctx = slots_ctx_result

    ensure_slots_metadata_dir(slots_ctx.repo, slots_ctx.storage)

    write_cd_directive = not is_machine_mode(ctx)

    if request.current:
        return _run_current_checkout(
            slots_ctx,
            no_clipboard=request.no_clipboard,
            write_cd_directive=write_cd_directive,
        )

    assert request.branch_name is not None  # validated above
    branch_name = request.branch_name
    branch_exists = slots_ctx.git.branch_exists(branch_name)
    created_branch = False

    if request.new_branch:
        Ensure.true(
            not branch_exists,
            error_type="branch_exists",
            message=(
                f"Branch '{branch_name}' already exists. Drop -b to check out the existing branch."
            ),
        )
        Ensure.true(
            request.base is None or slots_ctx.git.branch_exists(request.base),
            error_type="base_missing",
            message=f"Base branch '{request.base}' does not exist.",
        )
        start_point = request.base if request.base is not None else "HEAD"
        slots_ctx.git.create_branch(branch_name, start_point, force=False)
        created_branch = True
    else:
        Ensure.true(
            branch_exists,
            error_type="branch_missing",
            message=(
                f"Branch '{branch_name}' does not exist. Pass -b/--new to create it from HEAD."
            ),
        )

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    plan = plan_checkout(inventory, slots_ctx.git, branch_name)
    if isinstance(plan, PoolFull):
        return _pool_full_failure(plan)

    executed = _execute_plan(plan, ctx=slots_ctx, branch_name=branch_name)
    return ClinkrExit.ok(
        _build_result(
            slots_ctx,
            executed,
            created_branch=created_branch,
            current_wt_note=None,
            no_clipboard=request.no_clipboard,
            write_cd_directive=write_cd_directive,
        )
    )


def _run_current_checkout(
    slots_ctx: SlotsCliContext, *, no_clipboard: bool, write_cd_directive: bool
) -> ClinkrExit[SlotCheckoutResult]:
    try:
        outcome = plan_current_checkout(
            slots_ctx.git,
            cwd=slots_ctx.repo.root,
            main_repo_root=slots_ctx.repo.main_repo_root,
        )
    except SlotAllocationError as exc:
        return ClinkrExit.failure(error_type="slot_allocation_error", message=str(exc))
    if isinstance(outcome, DetachedHeadError):
        return ClinkrExit.failure(
            error_type="detached_head",
            message=(
                f"HEAD at {outcome.cwd} is detached. Check out a branch "
                f"before running `slot checkout --current`."
            ),
        )
    if isinstance(outcome, DirtyCurrentWorktreeError):
        return ClinkrExit.failure(
            error_type="dirty_worktree",
            message=(
                f"Current worktree at {outcome.cwd} has uncommitted changes. "
                f"Commit or stash before running `slot checkout --current`."
            ),
        )
    assert isinstance(outcome, CurrentCheckoutPlan)
    if isinstance(outcome.plan, PoolFull):
        return _pool_full_failure(outcome.plan)

    executed = _execute_plan(outcome.plan, ctx=slots_ctx, branch_name=outcome.branch_name)
    return ClinkrExit.ok(
        _build_result(
            slots_ctx,
            executed,
            created_branch=False,
            current_wt_note=outcome.current_wt_note,
            no_clipboard=no_clipboard,
            write_cd_directive=write_cd_directive,
        )
    )
