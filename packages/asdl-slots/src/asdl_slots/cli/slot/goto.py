from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from asdl_core import get_console
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.cli.slot.selectors import SelectorOk, resolve_num, resolve_wt
from asdl_slots.gateway.clipboard import ClipboardCopySuccess
from asdl_slots.inventory import build_slot_inventory
from asdl_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGotoRequest:
    num: Annotated[int | None, click.Option(["-n", "--num"], type=click.INT, default=None)] = None
    wt: Annotated[str | None, click.Option(["-w", "--wt"], type=click.STRING, default=None)] = None
    no_clipboard: Annotated[
        bool,
        click.Option(["--no-clipboard"], is_flag=True, default=False),
    ] = False


@dataclass(frozen=True)
class SlotGotoResult(JsonSerializable):
    slot_name: str
    branch_name: str
    worktree_path: str
    cd_command: str
    clipboard_copied: bool
    clipboard_skipped: bool
    clipboard_failure_reason: str | None
    clipboard_failure_detail: str | None


def render_slot_goto(result: SlotGotoResult) -> None:
    console = get_console()
    console.print(
        f"[bold cyan]{result.slot_name}[/bold cyan] -> [green]{result.branch_name}[/green]"
    )
    click.echo(result.cd_command)
    if result.clipboard_skipped:
        return
    if result.clipboard_copied:
        console.print("[dim]Copied cd command to clipboard.[/dim]")
    else:
        detail = result.clipboard_failure_detail or "pbcopy failed"
        console.print(f"[dim]Clipboard unavailable ({detail})[/dim]")


@clinkr_operation(
    name="goto",
    help="Print and copy a cd command for an assigned slot.",
    human_renderer=render_slot_goto,
)
def run_goto_slot(ctx: click.Context, request: SlotGotoRequest) -> ClinkrExit[SlotGotoResult]:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        raise ClinkrExit.failure(error_type="not_in_repo", message=slots_ctx.message)

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    if inventory.pool_size == 0:
        raise ClinkrExit.failure(
            error_type="pool_empty",
            message="No managed slots configured. Run `slot init --size N` first.",
        )

    if request.num is not None and request.wt is not None:
        raise ClinkrExit.failure(
            error_type="conflicting_slot_args",
            message="Pass exactly one of -n/--num or -w/--wt, not both.",
        )
    if request.num is not None:
        result = resolve_num(request.num, inventory.pool_size)
        if not isinstance(result, SelectorOk):
            raise ClinkrExit.failure(error_type="invalid_slot_num", message=result.message)
        slot_name = result.slot_name
    elif request.wt is not None:
        result = resolve_wt(request.wt)
        if not isinstance(result, SelectorOk):
            raise ClinkrExit.failure(error_type="invalid_slot_wt", message=result.message)
        slot_name = result.slot_name
    else:
        raise ClinkrExit.failure(
            error_type="missing_slot_arg",
            message="Pass one of -n/--num or -w/--wt to identify the slot.",
        )

    record = inventory.find_by_slot(slot_name)
    if record is None or record.branch is None:
        raise ClinkrExit.negative(
            message=f"{slot_name} is not currently assigned. Run `slot list` to see the pool.",
        )

    if not slots_ctx.storage.path_exists(record.path):
        raise ClinkrExit.failure(
            error_type="worktree_missing",
            message=(
                f"Worktree for {slot_name} is missing at {record.path}. "
                f"Run `slot free --wt {slot_name}` to clear the stale assignment."
            ),
        )

    worktree_path = str(record.path)
    cd_command = f"cd {worktree_path}"
    clipboard_copied = False
    clipboard_failure_reason: str | None = None
    clipboard_failure_detail: str | None = None
    if not request.no_clipboard:
        outcome = slots_ctx.clipboard.copy(cd_command)
        if isinstance(outcome, ClipboardCopySuccess):
            clipboard_copied = True
        else:
            clipboard_failure_reason = outcome.reason
            clipboard_failure_detail = outcome.detail

    return ClinkrExit.ok(
        SlotGotoResult(
            slot_name=slot_name,
            branch_name=record.branch,
            worktree_path=worktree_path,
            cd_command=cd_command,
            clipboard_copied=clipboard_copied,
            clipboard_skipped=request.no_clipboard,
            clipboard_failure_reason=clipboard_failure_reason,
            clipboard_failure_detail=clipboard_failure_detail,
        )
    )
