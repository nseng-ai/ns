from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Annotated

import click

from asdl_core import get_console
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.construction import build_git_gateway, resolve_repo_root
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.lifecycle.claim import claim_branch
from asdl_slots.lifecycle.outcomes import SlotClaimOutcome, SlotLifecycleFailure
from asdl_slots.repo_context import NoRepoSentinel


def _complete_branch_name(ctx: click.Context, param: click.Parameter, incomplete: str) -> list[str]:
    try:
        repo_root = resolve_repo_root(Path.cwd())
        if repo_root is None:
            return []
        branches = build_git_gateway(repo_root=repo_root).list_local_branches()
    except (subprocess.CalledProcessError, OSError):
        return []
    return [branch for branch in branches if branch.startswith(incomplete)]


class SlotClaimRequest(ClinkrModel):
    branch_name: Annotated[
        str,
        click.Argument(["branch_name"], shell_complete=_complete_branch_name),
    ]


class SlotClaimResult(ClinkrModel):
    slot_name: str
    branch_name: str
    worktree_path: str
    replaced_branch_name: str | None
    source_slot_name: str | None
    source_worktree_path: str | None
    already_current: bool


def render_slot_claim(result: SlotClaimResult) -> None:
    console = get_console()
    if result.already_current:
        console.print(
            f"[bold cyan]{result.slot_name}[/bold cyan] already has "
            f"[green]{result.branch_name}[/green]"
        )
        return

    source = ""
    if result.source_slot_name is not None:
        source = f" from [bold cyan]{result.source_slot_name}[/bold cyan]"
    replaced = ""
    if result.replaced_branch_name is not None:
        replaced = f" (replaced [yellow]{result.replaced_branch_name}[/yellow])"
    console.print(
        f"Claimed [bold cyan]{result.slot_name}[/bold cyan] -> "
        f"[green]{result.branch_name}[/green]{source}{replaced}"
    )


def _claim_to_result(outcome: SlotClaimOutcome) -> SlotClaimResult:
    return SlotClaimResult(
        slot_name=outcome.slot_name,
        branch_name=outcome.branch_name,
        worktree_path=str(outcome.worktree_path),
        replaced_branch_name=outcome.replaced_branch_name,
        source_slot_name=outcome.source_slot_name,
        source_worktree_path=(
            str(outcome.source_worktree_path) if outcome.source_worktree_path is not None else None
        ),
        already_current=outcome.already_current,
    )


@clinkr_operation(
    name="claim",
    help=(
        "Move a local branch from another managed slot into the current slot worktree. "
        "From the main worktree, move its current non-trunk branch into the lowest "
        "available slot, or check out an unassigned local branch into the lowest "
        "available slot without touching main."
    ),
    human_renderer=render_slot_claim,
)
def run_claim_slot(ctx: click.Context, request: SlotClaimRequest) -> ClinkrExit[SlotClaimResult]:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        raise ClinkrExit.failure(error_type="not_in_repo", message=slots_ctx.message)

    outcome = claim_branch(slots_ctx, request.branch_name)
    if isinstance(outcome, SlotLifecycleFailure):
        return ClinkrExit.failure(error_type=outcome.error_type, message=outcome.message)
    return ClinkrExit.ok(_claim_to_result(outcome))
