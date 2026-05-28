from __future__ import annotations

from collections.abc import Iterable

from asdl_core.git.testing import FakeGitGateway
from asdl_core.gt.types import GtBranchGraph, GtTrackedBranch
from asdl_objectives.gt_stack_scope import local_objective_stack_graph


def test_local_objective_stack_graph_includes_trunk_when_not_local() -> None:
    graph = _graph(_branch("main", None, children=("feat/a",)), _branch("feat/a", "main"))
    git = _CountingGitGateway(branches=("feat/a",))

    scoped = local_objective_stack_graph(git, graph)

    assert _branch_names(scoped) == ("main", "feat/a")
    assert git.list_local_branches_count == 1


def test_local_objective_stack_graph_includes_local_direct_child() -> None:
    graph = _graph(_branch("main", None, children=("feat/a",)), _branch("feat/a", "main"))
    git = FakeGitGateway(branches=("main", "feat/a"))

    scoped = local_objective_stack_graph(git, graph)

    assert _branch_names(scoped) == ("main", "feat/a")
    assert scoped.branches[0].children == ("feat/a",)


def test_local_objective_stack_graph_skips_nonlocal_stale_child_without_warning() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/local", "feat/stale")),
        _branch("feat/local", "main"),
        _branch("feat/stale", "main"),
    )
    git = FakeGitGateway(branches=("main", "feat/local"))

    scoped = local_objective_stack_graph(git, graph)

    assert _branch_names(scoped) == ("main", "feat/local")
    assert scoped.branches[0].children == ("feat/local",)
    assert scoped.warnings == ()


def test_local_objective_stack_graph_warns_for_local_branch_behind_missing_parent() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/base",)),
        _branch("feat/base", "main", children=("feat/child",)),
        _branch("feat/child", "feat/base"),
    )
    git = FakeGitGateway(branches=("main", "feat/child"))

    scoped = local_objective_stack_graph(git, graph)

    assert _branch_names(scoped) == ("main",)
    assert scoped.branches[0].children == ()
    assert scoped.warnings == (
        "Graphite branch 'feat/child' has unavailable local parent 'feat/base'; skipping.",
    )


def test_local_objective_stack_graph_filters_children_to_included_branches() -> None:
    graph = _graph(
        _branch("main", None, children=("feat/a", "feat/stale")),
        _branch("feat/a", "main", children=("feat/b", "feat/stale-grandchild")),
        _branch("feat/b", "feat/a"),
        _branch("feat/stale", "main"),
        _branch("feat/stale-grandchild", "feat/a"),
    )
    git = FakeGitGateway(branches=("main", "feat/a", "feat/b"))

    scoped = local_objective_stack_graph(git, graph)

    assert _branch_names(scoped) == ("main", "feat/a", "feat/b")
    assert _find_branch(scoped, "main").children == ("feat/a",)
    assert _find_branch(scoped, "feat/a").children == ("feat/b",)


def test_local_objective_stack_graph_preserves_and_deduplicates_warnings() -> None:
    graph = GtBranchGraph(
        trunk="main",
        branches=(
            _branch("main", None, children=("feat/base",)),
            _branch("feat/base", "main", children=("feat/child",)),
            _branch("feat/child", "feat/base"),
        ),
        warnings=("metadata warning", "metadata warning"),
    )
    git = FakeGitGateway(branches=("main", "feat/child"))

    scoped = local_objective_stack_graph(git, graph)

    assert scoped.warnings == (
        "metadata warning",
        "Graphite branch 'feat/child' has unavailable local parent 'feat/base'; skipping.",
    )


def _branch(
    name: str,
    parent: str | None,
    *,
    children: tuple[str, ...] = (),
) -> GtTrackedBranch:
    return GtTrackedBranch(
        name=name,
        parent=parent,
        children=children,
        validation_result=None,
    )


def _graph(*branches: GtTrackedBranch) -> GtBranchGraph:
    return GtBranchGraph(trunk="main", branches=branches, warnings=())


def _branch_names(graph: GtBranchGraph) -> tuple[str, ...]:
    return tuple(branch.name for branch in graph.branches)


def _find_branch(graph: GtBranchGraph, name: str) -> GtTrackedBranch:
    matches = [branch for branch in graph.branches if branch.name == name]
    assert len(matches) == 1
    return matches[0]


class _CountingGitGateway(FakeGitGateway):
    def __init__(self, *, branches: Iterable[str]) -> None:
        super().__init__(branches=branches)
        self.list_local_branches_count = 0

    def list_local_branches(self) -> tuple[str, ...]:
        self.list_local_branches_count += 1
        return super().list_local_branches()
