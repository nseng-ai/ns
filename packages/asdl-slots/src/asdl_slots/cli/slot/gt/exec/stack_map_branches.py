from __future__ import annotations

import json
from typing import Annotated, Literal

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead, LocalBranchTip
from asdl_core.git.types import GitCommandFailure as GitFailure
from asdl_core.gt.metadata_reader import read_branch_graph_from_metadata_db
from asdl_core.gt.types import (
    BranchMetadataGraph,
    BranchMetadataGraphRow,
    GtCommandFailure,
    StackInfo,
    UntrackedBranch,
)
from asdl_slots.cli.slot.gt.context import load_slot_gt_context
from asdl_slots.inventory import SlotRecord, build_slot_inventory
from asdl_slots.repo_context import NoRepoSentinel

GRAPHITE_METADATA_DB_NAME = ".graphite_metadata.db"


class SlotGtStackMapBranchesRequest(ClinkrModel):
    recent_limit: Annotated[
        int,
        click.Option(
            ["--recent-limit"],
            type=click.IntRange(min=0),
            default=40,
            help="Number of recent local branch tips to include as stack-map seeds.",
        ),
    ] = 40


class SlotGtStackMapBranch(ClinkrModel):
    name: str
    parent: str | None
    children: tuple[str, ...]
    validation_result: str | None
    needs_restack: bool


class SlotGtStackMapBranchEdge(ClinkrModel):
    parent: str
    child: str


class SlotGtStackMapSlot(ClinkrModel):
    slot_name: str
    branch: str
    worktree_path: str
    status: Literal["assigned"]


class SlotGtStackMapBranchesResult(ClinkrModel):
    current: str
    trunk: str
    scope: Literal["stack-map"]
    recent_limit: int
    branches: tuple[SlotGtStackMapBranch, ...]
    edges: tuple[SlotGtStackMapBranchEdge, ...]
    slots: tuple[SlotGtStackMapSlot, ...]
    warnings: tuple[str, ...]


def render_stack_map_branches(result: SlotGtStackMapBranchesResult) -> None:
    click.echo(
        json.dumps(
            {"branches": [branch.name for branch in result.branches]},
            separators=(",", ":"),
        )
    )
    for warning in result.warnings:
        click.echo(warning, err=True)


@clinkr_operation(
    name="stack-map-branches",
    help="Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
    human_renderer=render_stack_map_branches,
)
def run_stack_map_branches(
    ctx: click.Context,
    request: SlotGtStackMapBranchesRequest,
) -> ClinkrExit[SlotGtStackMapBranchesResult]:
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

    git_common_dir = slots_ctx.git.get_git_common_dir(slots_ctx.repo.root)
    if git_common_dir is None:
        Ensure.fail(
            error_type="git_common_dir_missing",
            message="Could not resolve Git common dir for Graphite metadata.",
        )

    graph_result = read_branch_graph_from_metadata_db(git_common_dir / GRAPHITE_METADATA_DB_NAME)
    if isinstance(graph_result, GtCommandFailure):
        Ensure.fail(error_type="gt_metadata_read_failed", message=graph_result.message)

    graph_by_name = graph_result.rows_by_name()
    if stack.trunk not in graph_by_name:
        Ensure.fail(
            error_type="stack_metadata_inconsistent",
            message=f"Graphite trunk branch {stack.trunk} is missing from metadata graph.",
        )

    inventory = build_slot_inventory(slots_ctx.git)
    slot_rows = _assigned_slot_rows(inventory.records)
    recent_branches = _recent_branch_names(
        slots_ctx.git.list_local_branch_tips(),
        request.recent_limit,
    )
    local_branch_names = frozenset(slots_ctx.git.list_local_branches())
    selected, selection_warnings = _select_visible_branches(
        graph_by_name=graph_by_name,
        stack=stack,
        slot_rows=slot_rows,
        recent_branches=recent_branches,
        local_branches=local_branch_names,
    )
    warnings = _dedupe_warnings(
        (*graph_result.render_warnings(), *stack.render_warnings(), *selection_warnings)
    )

    return ClinkrExit.ok(
        SlotGtStackMapBranchesResult(
            current=stack.current,
            trunk=stack.trunk,
            scope="stack-map",
            recent_limit=request.recent_limit,
            branches=_branch_results(graph_result, selected),
            edges=_edge_results(graph_by_name, selected),
            slots=slot_rows,
            warnings=warnings,
        )
    )


def _assigned_slot_rows(records: tuple[SlotRecord, ...]) -> tuple[SlotGtStackMapSlot, ...]:
    return tuple(
        SlotGtStackMapSlot(
            slot_name=record.slot_name,
            branch=record.branch,
            worktree_path=str(record.path),
            status="assigned",
        )
        for record in records
        if record.branch is not None
    )


def _recent_branch_names(
    branch_tips: tuple[LocalBranchTip, ...],
    recent_limit: int,
) -> tuple[str, ...]:
    tips = sorted(
        branch_tips,
        key=lambda tip: (tip.head_iso is not None, tip.head_iso or ""),
        reverse=True,
    )
    return tuple(tip.name for tip in tips[:recent_limit])


def _select_visible_branches(
    *,
    graph_by_name: dict[str, BranchMetadataGraphRow],
    stack: StackInfo,
    slot_rows: tuple[SlotGtStackMapSlot, ...],
    recent_branches: tuple[str, ...],
    local_branches: frozenset[str],
) -> tuple[set[str], tuple[str, ...]]:
    selected = {
        stack.trunk,
        stack.current,
        *stack.ancestors,
        *stack.children,
        *stack.descendants,
    }
    warnings: list[str] = []
    for slot in slot_rows:
        if slot.branch in graph_by_name:
            selected.add(slot.branch)
        else:
            warnings.append(
                f"assigned slot branch {slot.branch} is missing from Graphite metadata; skipped"
            )
    for branch in recent_branches:
        if branch in graph_by_name:
            selected.add(branch)

    for branch in tuple(selected):
        if branch not in graph_by_name:
            continue
        _add_ancestors(branch, selected, graph_by_name, warnings)
        _add_descendants(branch, selected, graph_by_name, warnings)
    visible = selected.intersection(graph_by_name) & local_branches
    return visible, tuple(warnings)


def _add_ancestors(
    branch: str,
    selected: set[str],
    graph_by_name: dict[str, BranchMetadataGraphRow],
    warnings: list[str],
) -> None:
    visited: set[str] = set()
    cursor: str | None = branch
    while cursor is not None:
        if cursor in visited:
            warnings.append(
                "cycle detected in Graphite parent metadata at "
                f"{cursor}; ancestor selection stopped"
            )
            return
        visited.add(cursor)
        row = graph_by_name.get(cursor)
        if row is None:
            warnings.append(
                f"parent branch {cursor} is missing from Graphite metadata; "
                "ancestor selection stopped"
            )
            return
        selected.add(cursor)
        cursor = row.parent


def _add_descendants(
    branch: str,
    selected: set[str],
    graph_by_name: dict[str, BranchMetadataGraphRow],
    warnings: list[str],
) -> None:
    pending = list(graph_by_name[branch].children)
    visited = {branch}
    while pending:
        child = pending.pop()
        if child in visited:
            warnings.append(
                "cycle detected in Graphite children metadata at "
                f"{child}; descendant selection stopped"
            )
            continue
        visited.add(child)
        row = graph_by_name.get(child)
        if row is None:
            warnings.append(
                f"child branch {child} is missing from Graphite metadata; "
                "descendant selection stopped"
            )
            continue
        selected.add(child)
        pending.extend(row.children)


def _branch_results(
    graph: BranchMetadataGraph,
    selected: set[str],
) -> tuple[SlotGtStackMapBranch, ...]:
    return tuple(
        SlotGtStackMapBranch(
            name=row.name,
            parent=row.parent,
            children=tuple(child for child in row.children if child in selected),
            validation_result=row.validation_result,
            needs_restack=row.needs_restack,
        )
        for row in graph.rows
        if row.name in selected
    )


def _edge_results(
    graph_by_name: dict[str, BranchMetadataGraphRow],
    selected: set[str],
) -> tuple[SlotGtStackMapBranchEdge, ...]:
    edges: list[SlotGtStackMapBranchEdge] = []
    for branch in sorted(selected):
        row = graph_by_name[branch]
        if row.parent is None or row.parent not in selected:
            continue
        edges.append(SlotGtStackMapBranchEdge(parent=row.parent, child=row.name))
    return tuple(edges)


def _dedupe_warnings(warnings: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    deduped: list[str] = []
    for warning in warnings:
        if warning in seen:
            continue
        seen.add(warning)
        deduped.append(warning)
    return tuple(deduped)
