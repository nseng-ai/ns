from __future__ import annotations

from dataclasses import dataclass, field

from asdl_core.gt.types import BranchMetadataGraphRow
from asdl_tools.exec.gt_linearize_stack_plan import (
    PlanningProblem,
    build_linearize_stack_plan,
)


@dataclass(frozen=True)
class _FakeLinearizePlannerFacts:
    branches: tuple[str, ...]
    rows: dict[str, BranchMetadataGraphRow]
    trunk: str = "main"
    commits_by_range: dict[tuple[str | None, str], tuple[str, ...]] = field(default_factory=dict)
    paths_by_range: dict[tuple[str | None, str], tuple[str, ...]] = field(default_factory=dict)
    patch_ids_by_range: dict[tuple[str | None, str], tuple[str, ...]] = field(default_factory=dict)
    conflict_branches: tuple[str, ...] = ()

    def local_branches(self) -> tuple[str, ...]:
        return self.branches

    def branch_rows(self) -> dict[str, BranchMetadataGraphRow] | PlanningProblem:
        return self.rows

    def trunk_branch(self) -> str | PlanningProblem:
        return self.trunk

    def commits(self, parent: str | None, branch: str) -> tuple[str, ...] | PlanningProblem:
        return self.commits_by_range.get((parent, branch), ("commit",))

    def patch_ids(self, parent: str | None, branch: str) -> tuple[str, ...] | PlanningProblem:
        return self.patch_ids_by_range.get((parent, branch), (branch,))

    def changed_paths(self, parent: str | None, branch: str) -> tuple[str, ...] | PlanningProblem:
        return self.paths_by_range.get((parent, branch), (f"{branch}.py",))

    def merge_tree_has_conflicts(
        self,
        *,
        trunk_branch: str,
        parent: str | None,
        branch: str,
    ) -> bool | PlanningProblem:
        del trunk_branch, parent
        return branch in self.conflict_branches


def _row(name: str, parent: str | None, children: tuple[str, ...] = ()) -> BranchMetadataGraphRow:
    return BranchMetadataGraphRow(
        name=name,
        parent=parent,
        children=children,
        validation_result=None,
    )


def test_descendants_only_default_excludes_target_from_actions() -> None:
    facts = _FakeLinearizePlannerFacts(
        branches=("target", "child"),
        rows={
            "target": _row("target", "main", ("child",)),
            "child": _row("child", "target"),
        },
    )

    result = build_linearize_stack_plan(
        facts=facts,
        target_branch="target",
        include_target=False,
        max_descendants=50,
    )

    assert result.success is True
    assert [action.branch_name for action in result.actions] == ["child"]
    assert result.scope == "descendants_only"


def test_conflict_free_independent_descendant_moves_to_trunk() -> None:
    facts = _FakeLinearizePlannerFacts(
        branches=("target", "child"),
        rows={
            "target": _row("target", "main", ("child",)),
            "child": _row("child", "target"),
        },
        paths_by_range={
            ("main", "target"): ("target.py",),
            ("target", "child"): ("child.py",),
        },
    )

    result = build_linearize_stack_plan(
        facts=facts,
        target_branch="target",
        include_target=False,
        max_descendants=50,
    )

    assert result.actions[0].action == "move_to_trunk"
    assert result.actions[0].proposed_parent == "main"


def test_dependency_signal_prevents_high_confidence_trunk_move() -> None:
    facts = _FakeLinearizePlannerFacts(
        branches=("target", "child"),
        rows={
            "target": _row("target", "main", ("child",)),
            "child": _row("child", "target"),
        },
        paths_by_range={
            ("main", "target"): ("shared.py",),
            ("target", "child"): ("shared.py",),
        },
    )

    result = build_linearize_stack_plan(
        facts=facts,
        target_branch="target",
        include_target=False,
        max_descendants=50,
    )

    assert result.actions[0].action == "keep"
    assert result.actions[0].proposed_parent == "target"
    assert "overlap" in result.actions[0].evidence[0]


def test_patch_subsumed_duplicate_is_drop_and_close_candidate() -> None:
    facts = _FakeLinearizePlannerFacts(
        branches=("target", "first", "duplicate"),
        rows={
            "target": _row("target", "main", ("first", "duplicate")),
            "first": _row("first", "target"),
            "duplicate": _row("duplicate", "target"),
        },
        paths_by_range={
            ("target", "first"): ("feature.py",),
            ("target", "duplicate"): ("feature.py",),
        },
        patch_ids_by_range={
            ("target", "first"): ("patch-1",),
            ("target", "duplicate"): ("patch-1",),
        },
    )

    result = build_linearize_stack_plan(
        facts=facts,
        target_branch="target",
        include_target=False,
        max_descendants=50,
    )

    duplicate_action = next(
        action for action in result.actions if action.branch_name == "duplicate"
    )
    assert duplicate_action.action == "drop_duplicate"
    assert result.close_candidates[0].branch_name == "duplicate"


def test_bundled_fork_is_manual_consolidation_not_drop() -> None:
    facts = _FakeLinearizePlannerFacts(
        branches=("target", "first", "fork"),
        rows={
            "target": _row("target", "main", ("first", "fork")),
            "first": _row("first", "target"),
            "fork": _row("fork", "target"),
        },
        patch_ids_by_range={
            ("target", "first"): ("patch-1",),
            ("target", "fork"): ("patch-1", "patch-2"),
        },
    )

    result = build_linearize_stack_plan(
        facts=facts,
        target_branch="target",
        include_target=False,
        max_descendants=50,
    )

    fork_action = next(action for action in result.actions if action.branch_name == "fork")
    assert fork_action.action == "manual_consolidation"
    assert not result.close_candidates


def test_unknown_target_branch_returns_negative_shape() -> None:
    facts = _FakeLinearizePlannerFacts(branches=("other",), rows={"other": _row("other", "main")})

    result = build_linearize_stack_plan(
        facts=facts,
        target_branch="target",
        include_target=False,
        max_descendants=50,
    )

    assert result.success is False
    assert result.error is not None
    assert result.error.code == "unknown_target_branch"
