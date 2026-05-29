"""Local branch scoping for Graphite Objective stack projections."""

from __future__ import annotations

from asdl_core.git.git_gateway import GitGateway
from asdl_core.gt.types import GtBranchGraph, GtTrackedBranch


def local_objective_stack_graph(git: GitGateway, graph: GtBranchGraph) -> GtBranchGraph:
    """Return the locally available, trunk-connected portion of a Graphite graph."""

    branch_by_name = {branch.name: branch for branch in graph.branches}
    local_branches = set(git.list_local_branches())
    eligible = {graph.trunk}
    warnings = list(graph.warnings)

    for branch in graph.branches:
        if branch.name == graph.trunk:
            continue
        if branch.name in local_branches:
            eligible.add(branch.name)

    included = _connected_local_branches(graph, eligible)
    for branch_name in sorted(eligible.difference(included)):
        branch = branch_by_name[branch_name]
        warnings.append(
            f"Graphite branch {branch.name!r} has unavailable local parent "
            f"{branch.parent!r}; skipping."
        )

    return GtBranchGraph(
        trunk=graph.trunk,
        branches=tuple(
            _filter_branch_children(branch, included)
            for branch in graph.branches
            if branch.name in included
        ),
        warnings=_dedupe_warnings(warnings),
    )


def _connected_local_branches(graph: GtBranchGraph, eligible: set[str]) -> frozenset[str]:
    included = {graph.trunk}
    unresolved = set(eligible)
    unresolved.discard(graph.trunk)

    made_progress = True
    while made_progress:
        made_progress = False
        for branch in graph.branches:
            if branch.name not in unresolved:
                continue
            if branch.parent not in included:
                continue
            included.add(branch.name)
            unresolved.remove(branch.name)
            made_progress = True

    return frozenset(included)


def _filter_branch_children(branch: GtTrackedBranch, included: frozenset[str]) -> GtTrackedBranch:
    return GtTrackedBranch(
        name=branch.name,
        parent=branch.parent,
        children=tuple(child for child in branch.children if child in included),
        validation_result=branch.validation_result,
        needs_restack=branch.needs_restack,
    )


def _dedupe_warnings(warnings: list[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    deduped: list[str] = []
    for warning in warnings:
        if warning in seen:
            continue
        seen.add(warning)
        deduped.append(warning)
    return tuple(deduped)
