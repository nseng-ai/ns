from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from asdl_core.clinkr.context import is_machine_mode
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead
from asdl_core.git.types import GitCommandFailure as GitFailure
from asdl_core.gt.types import GtCommandFailure, UntrackedBranch
from asdl_slots.cli.slot.gt.context import load_slot_gt_context
from asdl_slots.cli.slot.gt.navigation import (
    GtNavigationTarget,
    build_navigation_result,
    find_worktree_for_branch,
    render_gt_navigation,
)
from asdl_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGtUpRequest:
    no_clipboard: Annotated[
        bool,
        click.Option(["--no-clipboard"], is_flag=True, default=False),
    ] = False


@clinkr_operation(
    name="up",
    help="Print the worktree for the immediate upstack Graphite branch.",
    human_renderer=render_gt_navigation,
)
def run_gt_up(ctx: click.Context, request: SlotGtUpRequest) -> ClinkrExit[GtNavigationTarget]:
    gt_ctx = load_slot_gt_context(ctx)
    if isinstance(gt_ctx, NoRepoSentinel):
        Ensure.fail(error_type="not_in_repo", message=gt_ctx.message)

    slots_ctx = gt_ctx.slots
    current_branch = slots_ctx.git.get_current_branch(slots_ctx.repo.root)
    if isinstance(current_branch, GitFailure):
        Ensure.fail(
            error_type="git_current_branch_failed",
            message=current_branch.message,
        )
    if isinstance(current_branch, DetachedHead):
        Ensure.fail(
            error_type="detached_head",
            message=f"HEAD at {slots_ctx.repo.root} is detached. Check out a branch first.",
        )
    current = current_branch

    children = gt_ctx.gt.children_of(slots_ctx.repo.root)
    if isinstance(children, UntrackedBranch):
        Ensure.fail(
            error_type="untracked_branch",
            message=f"Current branch '{current}' is not tracked by Graphite. {children.message}",
        )
    if isinstance(children, GtCommandFailure):
        Ensure.fail(error_type="gt_children_failed", message=children.message)
    if isinstance(children, tuple) and len(children) == 0:
        raise ClinkrExit.negative(message=f"No upstack branch for '{current}'.")
    if isinstance(children, tuple) and len(children) > 1:
        candidates = ", ".join(children)
        raise ClinkrExit.negative(
            message=(
                f"Multiple upstack branches for '{current}': {candidates}. "
                "Run `slot checkout <branch>` for the branch you want."
            )
        )

    (child,) = children

    target = find_worktree_for_branch(slots_ctx, child)
    if target is None:
        raise ClinkrExit.negative(
            message=(
                f"Upstack branch '{child}' is not checked out in any worktree. "
                f"Run `slot checkout {child}`."
            )
        )
    return ClinkrExit.ok(
        build_navigation_result(
            slots_ctx,
            target,
            request.no_clipboard,
            write_cd_directive=not is_machine_mode(ctx),
        )
    )
