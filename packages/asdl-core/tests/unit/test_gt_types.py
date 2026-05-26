from __future__ import annotations

import pytest

from asdl_core.gt.types import GtBranchGraph, GtTrackedBranch, StackInfo


def test_stack_info_rejects_empty_current() -> None:
    with pytest.raises(ValueError, match="StackInfo.current must name"):
        StackInfo(
            trunk="main",
            current="",
            ancestors=(),
            children=(),
            warnings=(),
        )


def test_gt_tracked_branch_rejects_empty_name() -> None:
    with pytest.raises(ValueError, match="GtTrackedBranch.name must name"):
        GtTrackedBranch(
            name="",
            parent=None,
            children=(),
            validation_result=None,
        )


def test_gt_branch_graph_rejects_empty_trunk() -> None:
    with pytest.raises(ValueError, match="GtBranchGraph.trunk must name"):
        GtBranchGraph(trunk="", branches=(), warnings=())


def test_gt_branch_graph_rejects_duplicate_branch_names() -> None:
    with pytest.raises(ValueError, match="duplicate branch names"):
        GtBranchGraph(
            trunk="main",
            branches=(
                GtTrackedBranch(
                    name="main",
                    parent=None,
                    children=(),
                    validation_result="TRUNK",
                ),
                GtTrackedBranch(
                    name="main",
                    parent=None,
                    children=(),
                    validation_result="TRUNK",
                ),
            ),
            warnings=(),
        )


def test_gt_branch_graph_accepts_trunk_only_graph() -> None:
    graph = GtBranchGraph(
        trunk="main",
        branches=(
            GtTrackedBranch(
                name="main",
                parent=None,
                children=(),
                validation_result="TRUNK",
            ),
        ),
        warnings=(),
    )

    assert graph.trunk == "main"
