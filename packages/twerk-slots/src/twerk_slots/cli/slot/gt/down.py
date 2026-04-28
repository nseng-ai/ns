from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead
from twerk_core.git.types import GitCommandFailure as GitFailure
from twerk_core.gt.types import GtCommandFailure, NoParent, UntrackedBranch
from twerk_slots.cli.slot.gt.context import SlotGtContext, load_slot_gt_context
from twerk_slots.cli.slot.gt.navigation import (
    GtNavigationTarget,
    build_navigation_result,
    find_worktree_for_branch,
    render_gt_navigation,
)
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGtDownRequest:
    no_clipboard: Annotated[
        bool,
        click.Option(["--no-clipboard"], is_flag=True, default=False),
    ] = False


@clinkr_operation(
    name="down",
    help="Print the worktree for the immediate downstack Graphite branch.",
    human_renderer=render_gt_navigation,
)
def run_gt_down(ctx: click.Context, request: SlotGtDownRequest) -> ClinkrExit[GtNavigationTarget]:
    match load_slot_gt_context(ctx):
        case NoRepoSentinel(message=message):
            return ClinkrExit.failure(error_type="not_in_repo", message=message)
        case SlotGtContext() as gt_ctx:
            pass

    slots_ctx = gt_ctx.slots
    match slots_ctx.git.get_current_branch(slots_ctx.repo.root):
        case GitFailure(message=message):
            return ClinkrExit.failure(
                error_type="git_current_branch_failed",
                message=message,
            )
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message=f"HEAD at {slots_ctx.repo.root} is detached. Check out a branch first.",
            )
        case str() as current:
            pass

    match gt_ctx.gt.parent_of(slots_ctx.repo.root):
        case UntrackedBranch(message=message):
            return ClinkrExit.failure(
                error_type="untracked_branch",
                message=f"Current branch '{current}' is not tracked by Graphite. {message}",
            )
        case GtCommandFailure(message=message):
            return ClinkrExit.failure(error_type="gt_parent_failed", message=message)
        case NoParent():
            return ClinkrExit.negative(message=f"No downstack branch for '{current}'.")
        case str() as parent:
            pass

    target = find_worktree_for_branch(slots_ctx, parent)
    if target is None:
        return ClinkrExit.negative(
            message=(
                f"Downstack branch '{parent}' is not checked out in any worktree. "
                f"Run `slot checkout {parent}`."
            )
        )
    return ClinkrExit.ok(build_navigation_result(slots_ctx, target, request.no_clipboard))
