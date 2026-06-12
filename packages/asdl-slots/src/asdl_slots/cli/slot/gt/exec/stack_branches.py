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
    StackInfo,
    StackWalkDiagnostic,
    UntrackedBranch,
    render_stack_walk_warning,
)
from asdl_slots.cli.slot.gt.context import load_slot_gt_context
from asdl_slots.cli.slot.gt.stack_walk import collect_stack_branches
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


class SlotGtStackBranchesResult(ClinkrModel):
    branches: tuple[str, ...]
    trunk: str
    current: str
    scope: Literal["full", "downstack"]
    warnings: tuple[str, ...]


def render_stack_branches(result: SlotGtStackBranchesResult) -> None:
    click.echo(json.dumps({"branches": list(result.branches)}, separators=(",", ":")))
    for warning in result.warnings:
        click.echo(warning, err=True)


def _marker_diagnostics(stack: StackInfo) -> tuple[StackWalkDiagnostic, ...]:
    return tuple(
        diagnostic for diagnostic in stack.diagnostics if diagnostic.scope == "trunk_marker"
    )


def _first_full_scope_fork(stack: StackInfo) -> StackWalkDiagnostic | None:
    for diagnostic in stack.diagnostics:
        if diagnostic.scope == "descendant" and diagnostic.kind == "fork":
            return diagnostic
    return None


def _is_load_children_diagnostic(diagnostic: StackWalkDiagnostic) -> bool:
    return diagnostic.scope == "load" and diagnostic.kind in {
        "children_not_text",
        "children_invalid_json",
        "children_not_list",
        "children_non_string",
    }


def _is_relevant_full_scope_load_diagnostic(
    diagnostic: StackWalkDiagnostic, stack: StackInfo
) -> bool:
    if not _is_load_children_diagnostic(diagnostic):
        return False
    return diagnostic.branch in {stack.current, *stack.descendants}


def _inconsistent_full_scope_diagnostics(
    stack: StackInfo,
) -> tuple[StackWalkDiagnostic, ...]:
    return tuple(
        diagnostic
        for diagnostic in stack.diagnostics
        if (
            diagnostic.scope in {"ancestor", "descendant"}
            and diagnostic.kind in {"cycle", "missing_row"}
        )
        or _is_relevant_full_scope_load_diagnostic(diagnostic, stack)
    )


def _inconsistent_downstack_diagnostics(
    stack: StackInfo,
) -> tuple[StackWalkDiagnostic, ...]:
    return tuple(
        diagnostic
        for diagnostic in stack.diagnostics
        if diagnostic.scope == "ancestor" and diagnostic.kind in {"cycle", "missing_row"}
    )


def _downstack_warnings(stack: StackInfo) -> tuple[str, ...]:
    return tuple(
        render_stack_walk_warning(diagnostic)
        for diagnostic in stack.diagnostics
        if diagnostic.scope == "descendant" and diagnostic.kind in {"fork", "cycle", "missing_row"}
    )


def _render_joined_diagnostics(diagnostics: tuple[StackWalkDiagnostic, ...]) -> str:
    return "; ".join(render_stack_walk_warning(diagnostic) for diagnostic in diagnostics)


def _fail_inconsistent(diagnostics: tuple[StackWalkDiagnostic, ...]) -> None:
    Ensure.fail(
        error_type="stack_metadata_inconsistent",
        message=_render_joined_diagnostics(diagnostics),
    )


def _fail_forked_stack(diagnostic: StackWalkDiagnostic) -> None:
    children = ", ".join(diagnostic.children)
    Ensure.fail(
        error_type="forked_stack",
        message=(
            f"Graphite stack forks at '{diagnostic.branch}' with children: {children}. "
            "Check out the intended tip and rerun, or pass `--downstack`."
        ),
    )


def _validate_stack_diagnostics(stack: StackInfo, *, downstack: bool) -> tuple[str, ...]:
    marker_diagnostics = _marker_diagnostics(stack)
    if marker_diagnostics:
        _fail_inconsistent(marker_diagnostics)

    if stack.current == stack.trunk:
        return ()

    if downstack:
        inconsistent = _inconsistent_downstack_diagnostics(stack)
        if inconsistent:
            _fail_inconsistent(inconsistent)
        return _downstack_warnings(stack)

    fork = _first_full_scope_fork(stack)
    if fork is not None:
        _fail_forked_stack(fork)

    inconsistent = _inconsistent_full_scope_diagnostics(stack)
    if inconsistent:
        _fail_inconsistent(inconsistent)
    return ()


def _result_for_stack(
    stack: StackInfo,
    *,
    downstack: bool,
    branches: tuple[str, ...],
    warnings: tuple[str, ...],
) -> SlotGtStackBranchesResult:
    return SlotGtStackBranchesResult(
        branches=branches,
        trunk=stack.trunk,
        current=stack.current,
        scope="downstack" if downstack else "full",
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

    warnings = _validate_stack_diagnostics(stack, downstack=request.downstack)

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
