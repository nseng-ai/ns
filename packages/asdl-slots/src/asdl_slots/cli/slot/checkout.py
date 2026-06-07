from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Annotated

import click

from asdl_core import get_console
from asdl_core.clinkr.context import is_machine_mode
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.construction import GitUnavailable, build_git_context
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.clipboard import ClipboardCopySuccess
from asdl_slots.lifecycle.checkout import checkout_branch, checkout_current
from asdl_slots.lifecycle.outcomes import SlotCheckoutOutcome, SlotLifecycleFailure
from asdl_slots.naming import extract_slot_number
from asdl_slots.repo_context import NoRepoSentinel
from asdl_slots.shell_integration import write_cd_directive_if_active


def _complete_branch_name(ctx: click.Context, param: click.Parameter, incomplete: str) -> list[str]:
    git_context = build_git_context(Path.cwd())
    if isinstance(git_context, GitUnavailable):
        return []
    try:
        branches = git_context.git.list_local_branches()
    except (subprocess.CalledProcessError, OSError):
        # Shell completion callbacks must never raise — any exception that
        # escapes here breaks the user's tab-completion in the shell. Swallow
        # `git for-each-ref` failures (CalledProcessError) and missing/unrunnable
        # git binaries (OSError) and degrade silently to "no completions".
        return []
    return [b for b in branches if b.startswith(incomplete)]


class SlotCheckoutRequest(ClinkrModel):
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


class SlotCheckoutResult(ClinkrModel):
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


def _build_result(
    ctx: SlotsCliContext,
    outcome: SlotCheckoutOutcome,
    *,
    no_clipboard: bool,
    write_cd_directive: bool,
) -> SlotCheckoutResult:
    worktree_path = str(outcome.worktree_path)
    write_cd_directive_if_active(worktree_path, enabled=write_cd_directive)
    cd_command = f"cd {worktree_path}"
    clipboard_copied = False
    clipboard_failure_reason: str | None = None
    clipboard_failure_detail: str | None = None
    if not no_clipboard:
        copy_result = ctx.clipboard.copy(cd_command)
        if isinstance(copy_result, ClipboardCopySuccess):
            clipboard_copied = True
        else:
            clipboard_failure_reason = copy_result.reason
            clipboard_failure_detail = copy_result.detail
    return SlotCheckoutResult(
        slot_name=outcome.slot_name,
        branch_name=outcome.branch_name,
        worktree_path=worktree_path,
        cd_command=cd_command,
        already_assigned=outcome.already_assigned,
        created_branch=outcome.created_branch,
        current_wt_note=outcome.current_wt_note,
        clipboard_copied=clipboard_copied,
        clipboard_skipped=no_clipboard,
        clipboard_failure_reason=clipboard_failure_reason,
        clipboard_failure_detail=clipboard_failure_detail,
    )


def _lifecycle_failure_to_exit(
    failure: SlotLifecycleFailure,
) -> ClinkrExit[SlotCheckoutResult]:
    return ClinkrExit.failure(error_type=failure.error_type, message=failure.message)


@clinkr_operation(
    name="checkout",
    help=(
        "Check out a branch into an available pool slot worktree "
        "(like `git checkout [-b] [<base>]`). Prints/copies a cd command; "
        "active shell integration can cd the parent shell. Requires a clean detached "
        "managed slot."
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

    write_cd_directive = not is_machine_mode(ctx)

    if request.current:
        checkout_outcome = checkout_current(slots_ctx)
    else:
        assert request.branch_name is not None  # validated above
        checkout_outcome = checkout_branch(
            slots_ctx,
            request.branch_name,
            new_branch=request.new_branch,
            base=request.base,
        )

    if isinstance(checkout_outcome, SlotLifecycleFailure):
        return _lifecycle_failure_to_exit(checkout_outcome)

    return ClinkrExit.ok(
        _build_result(
            slots_ctx,
            checkout_outcome,
            no_clipboard=request.no_clipboard,
            write_cd_directive=write_cd_directive,
        )
    )
