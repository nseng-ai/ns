from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click

from twerk_core import get_console
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.clipboard import ClipboardCopyFailure, ClipboardCopySuccess
from twerk_slots.naming import extract_slot_number


@dataclass(frozen=True)
class WorktreeTarget:
    slot_name: str | None
    branch_name: str
    worktree_path: Path


@dataclass(frozen=True)
class GtNavigationTarget(JsonSerializable):
    slot_name: str | None
    branch_name: str
    worktree_path: str
    cd_command: str
    clipboard_copied: bool
    clipboard_skipped: bool
    clipboard_failure_reason: str | None
    clipboard_failure_detail: str | None


def find_worktree_for_branch(slots_ctx: SlotsCliContext, branch: str) -> WorktreeTarget | None:
    for worktree in slots_ctx.git.list_worktrees():
        if worktree.branch != branch:
            continue
        slot_name = worktree.path.name if extract_slot_number(worktree.path.name) else None
        return WorktreeTarget(
            slot_name=slot_name,
            branch_name=branch,
            worktree_path=worktree.path,
        )
    return None


def build_navigation_result(
    slots_ctx: SlotsCliContext,
    target: WorktreeTarget,
    no_clipboard: bool,
) -> GtNavigationTarget:
    cd_command = f"cd {target.worktree_path}"
    clipboard_copied = False
    clipboard_failure_reason: str | None = None
    clipboard_failure_detail: str | None = None
    if not no_clipboard:
        match slots_ctx.clipboard.copy(cd_command):
            case ClipboardCopySuccess():
                clipboard_copied = True
            case ClipboardCopyFailure(reason=reason, detail=detail):
                clipboard_failure_reason = reason
                clipboard_failure_detail = detail
    return GtNavigationTarget(
        slot_name=target.slot_name,
        branch_name=target.branch_name,
        worktree_path=str(target.worktree_path),
        cd_command=cd_command,
        clipboard_copied=clipboard_copied,
        clipboard_skipped=no_clipboard,
        clipboard_failure_reason=clipboard_failure_reason,
        clipboard_failure_detail=clipboard_failure_detail,
    )


def render_gt_navigation(result: GtNavigationTarget) -> None:
    console = get_console()
    if result.slot_name is None:
        console.print(
            f"[green]{result.branch_name}[/green] is checked out at "
            f"[bold cyan]{result.worktree_path}[/bold cyan]"
        )
    else:
        console.print(
            f"[bold cyan]{result.slot_name}[/bold cyan] -> [green]{result.branch_name}[/green]"
        )
    click.echo(result.cd_command)
    if result.clipboard_skipped:
        return
    if result.clipboard_copied:
        console.print("[dim]Copied cd command to clipboard.[/dim]")
        return
    detail = result.clipboard_failure_detail or "clipboard copy failed"
    console.print(f"[dim]Clipboard unavailable ({detail})[/dim]")
