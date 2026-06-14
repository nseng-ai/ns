from __future__ import annotations

import json
from typing import Annotated, Literal

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead
from asdl_core.git.types import GitCommandFailure as GitFailure
from asdl_core.gt.types import (
    GtCommandFailure,
    StackFork,
    StackInfo,
    TrunkMarkerProblem,
    UntrackedBranch,
    WalkCycle,
    WalkRowMissing,
    render_ancestor_termination,
    render_children_corruption,
    render_descendant_termination,
    render_stack_fork,
    render_trunk_marker_problem,
)
from asdl_slots.cli.slot.gt.context import load_slot_gt_context
from asdl_slots.cli.slot.gt.stack_walk import collect_stack_branches, collect_stack_edges
from asdl_slots.repo_context import NoRepoSentinel


class SlotGtStackBranchesRequest(ClinkrModel):
    downstack: Annotated[
        bool,
        click.Option(
            ["--downstack"],
            is_flag=True,
            help="List only ancestor (downstack) branches plus the current branch.",
        ),
    ] = False


class SlotGtStackBranchEdge(ClinkrModel):
    parent: str
    child: str


class SlotGtStackBranchesResult(ClinkrModel):
    branches: tuple[str, ...]
    trunk: str
    current: str
    scope: Literal["full", "downstack"]
    edges: tuple[SlotGtStackBranchEdge, ...]
    warnings: tuple[str, ...]


def render_stack_branches(result: SlotGtStackBranchesResult) -> None:
    click.echo(json.dumps({"branches": list(result.branches)}, separators=(",", ":")))
    for warning in result.warnings:
        click.echo(warning, err=True)


def _fail_inconsistent(messages: tuple[str, ...]) -> None:
    Ensure.fail(
        error_type="stack_metadata_inconsistent",
        message="; ".join(messages),
    )


def _fail_forked_stack(fork: StackFork) -> None:
    children = ", ".join(fork.children)
    Ensure.fail(
        error_type="forked_stack",
        message=(
            f"Graphite stack forks at '{fork.branch}' with children: {children}. "
            "Check out the intended tip and rerun, or pass `--downstack`."
        ),
    )


def _validate_stack_integrity(stack: StackInfo, *, downstack: bool) -> tuple[str, ...]:
    marker = stack.trunk_marker
    if isinstance(marker, TrunkMarkerProblem):
        _fail_inconsistent(render_trunk_marker_problem(marker))

    if stack.current == stack.trunk:
        return ()

    walk = stack.descendant_walk
    ancestor_termination = stack.ancestor_termination
    descendant_termination = walk.termination

    if downstack:
        if isinstance(ancestor_termination, WalkCycle | WalkRowMissing):
            _fail_inconsistent((render_ancestor_termination(ancestor_termination),))
        warnings = tuple(render_stack_fork(fork) for fork in walk.forks)
        if isinstance(descendant_termination, WalkCycle | WalkRowMissing):
            warnings += (render_descendant_termination(descendant_termination),)
        return warnings

    if walk.forks:
        _fail_forked_stack(walk.forks[0])

    messages = tuple(
        render_children_corruption(corruption) for corruption in walk.children_corruptions
    )
    if isinstance(ancestor_termination, WalkCycle | WalkRowMissing):
        messages += (render_ancestor_termination(ancestor_termination),)
    if isinstance(descendant_termination, WalkCycle | WalkRowMissing):
        messages += (render_descendant_termination(descendant_termination),)
    if messages:
        _fail_inconsistent(messages)
    return ()


def _result_for_stack(
    stack: StackInfo,
    *,
    downstack: bool,
    branches: tuple[str, ...],
    warnings: tuple[str, ...],
) -> SlotGtStackBranchesResult:
    edges = tuple(
        SlotGtStackBranchEdge(parent=parent, child=child)
        for parent, child in collect_stack_edges(
            stack,
            current=stack.current,
            downstack_only=downstack,
        )
    )
    return SlotGtStackBranchesResult(
        branches=branches,
        trunk=stack.trunk,
        current=stack.current,
        scope="downstack" if downstack else "full",
        edges=edges,
        warnings=warnings,
    )


@clinkr_operation(
    name="stack-branches",
    help="Emit the current Graphite stack branch list for skill/agent invocation.",
    human_renderer=render_stack_branches,
)
def run_stack_branches(
    ctx: click.Context, request: SlotGtStackBranchesRequest
) -> ClinkrExit[SlotGtStackBranchesResult]:
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

    stack_result = gt_ctx.gt.stack(slots_ctx.repo.root)
    if isinstance(stack_result, UntrackedBranch):
        Ensure.fail(
            error_type="untracked_branch",
            message=f"{stack_result.message} — run `gt track` first",
        )
    if isinstance(stack_result, GtCommandFailure):
        Ensure.fail(error_type="gt_stack_read_failed", message=stack_result.message)
    stack = stack_result

    warnings = _validate_stack_integrity(stack, downstack=request.downstack)

    if stack.current == stack.trunk:
        result = _result_for_stack(
            stack,
            downstack=request.downstack,
            branches=(),
            warnings=(),
        )
        raise ClinkrExit.negative(
            result,
            message=f"On trunk '{stack.trunk}'; no stack is checked out.",
        )

    branches = collect_stack_branches(
        stack,
        current=stack.current,
        trunk=stack.trunk,
        downstack_only=request.downstack,
        include_current=True,
    )
    return ClinkrExit.ok(
        _result_for_stack(
            stack,
            downstack=request.downstack,
            branches=branches,
            warnings=warnings,
        )
    )
