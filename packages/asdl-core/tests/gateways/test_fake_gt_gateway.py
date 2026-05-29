from __future__ import annotations

from pathlib import Path

from asdl_core.gt.testing import FakeGtGateway
from asdl_core.gt.types import (
    GtBranchGraph,
    GtCommandFailure,
    GtTrackedBranch,
    NoParent,
    StackInfo,
    UntrackedBranch,
)


def test_fake_gt_gateway_parent_by_cwd() -> None:
    cwd = Path("/repo")
    gateway = FakeGtGateway(parent_by_cwd={cwd: "main"})

    assert gateway.parent_of(cwd) == "main"
    assert gateway.parent_calls == (cwd,)


def test_fake_gt_gateway_parent_by_branch() -> None:
    cwd = Path("/wt/slot-01")
    gateway = FakeGtGateway(
        branch_by_cwd={cwd: "feat/child"},
        parent_by_branch={"feat/child": "feat/base"},
    )

    assert gateway.parent_of(cwd) == "feat/base"


def test_fake_gt_gateway_parent_defaults_to_no_parent() -> None:
    assert FakeGtGateway().parent_of(Path("/repo")) == NoParent()


def test_fake_gt_gateway_children_by_branch() -> None:
    cwd = Path("/repo")
    gateway = FakeGtGateway(
        branch_by_cwd={cwd: "feat/base"},
        children_by_branch={"feat/base": ("feat/child",)},
    )

    assert gateway.children_of(cwd) == ("feat/child",)
    assert gateway.children_calls == (cwd,)


def test_fake_gt_gateway_restacks_and_syncs_track_calls() -> None:
    cwd = Path("/wt/slot-02")
    gateway = FakeGtGateway()

    assert gateway.restack_upstack(cwd, "feat/child") is None
    assert gateway.sync(cwd, restack=False) is None

    assert gateway.restack_calls == ((cwd, "feat/child"),)
    assert gateway.sync_calls == ((cwd, False),)


def test_fake_gt_gateway_configured_failures() -> None:
    restack_failure = GtCommandFailure(message="conflict", returncode=1)
    sync_failure = GtCommandFailure(message="sync failed", returncode=2)
    gateway = FakeGtGateway(
        parent_by_cwd={Path("/repo"): UntrackedBranch(message="untracked")},
        restack_failure_by_branch={"feat/child": restack_failure},
        sync_failure=sync_failure,
    )

    assert gateway.parent_of(Path("/repo")) == UntrackedBranch(message="untracked")
    assert gateway.restack_upstack(Path("/wt"), "feat/child") == restack_failure
    assert gateway.sync(Path("/wt"), restack=True) == sync_failure


def test_fake_gt_gateway_stack_default_is_trunk_centered() -> None:
    gateway = FakeGtGateway(trunk="main")

    result = gateway.stack(Path("/repo"))

    assert result == StackInfo(
        trunk="main",
        current="main",
        ancestors=(),
        children=(),
        warnings=(),
    )
    assert gateway.stack_calls == (Path("/repo"),)


def test_fake_gt_gateway_stack_default_uses_current_branch_mapping() -> None:
    cwd = Path("/repo")
    gateway = FakeGtGateway(
        trunk="main",
        branch_by_cwd={cwd: "feat/current"},
    )

    result = gateway.stack(cwd)

    assert isinstance(result, StackInfo)
    assert result.current == "feat/current"


def test_fake_gt_gateway_stack_by_cwd_overrides() -> None:
    cwd = Path("/wt/slot-01")
    snapshot = StackInfo(
        trunk="master",
        current="feat/child",
        ancestors=("master", "feat/base"),
        children=(),
        warnings=(),
    )
    gateway = FakeGtGateway(stack_by_cwd={cwd: snapshot})

    assert gateway.stack(cwd) == snapshot


def test_fake_gt_gateway_stack_failure_passthrough() -> None:
    cwd = Path("/repo")
    failure = GtCommandFailure(message="gt: not found", returncode=127)
    gateway = FakeGtGateway(stack_by_cwd={cwd: failure})

    assert gateway.stack(cwd) == failure


def test_fake_gt_gateway_stack_untracked_passthrough() -> None:
    cwd = Path("/repo")
    untracked = UntrackedBranch(message="not tracked")
    gateway = FakeGtGateway(stack_by_cwd={cwd: untracked})

    assert gateway.stack(cwd) == untracked


def test_fake_gt_gateway_stack_plumbs_descendants() -> None:
    cwd = Path("/wt/slot-01")
    snapshot = StackInfo(
        trunk="master",
        current="feat/middle",
        ancestors=("master", "feat/base"),
        children=("feat/child",),
        warnings=(),
        descendants=("feat/child", "feat/grandchild"),
    )
    gateway = FakeGtGateway(stack_by_cwd={cwd: snapshot})

    result = gateway.stack(cwd)

    assert isinstance(result, StackInfo)
    assert result.descendants == ("feat/child", "feat/grandchild")


def test_fake_gt_gateway_branch_graph_default_is_trunk_only_and_call_tracked() -> None:
    cwd = Path("/repo")
    gateway = FakeGtGateway(trunk="main")

    result = gateway.branch_graph(cwd)

    assert result == GtBranchGraph(
        trunk="main",
        branches=(
            GtTrackedBranch(
                name="main",
                parent=None,
                children=(),
                validation_result=None,
            ),
        ),
        warnings=(),
    )
    assert gateway.branch_graph_calls == (cwd,)


def test_fake_gt_gateway_branch_graph_by_cwd_overrides_default() -> None:
    cwd = Path("/wt/slot-01")
    graph = GtBranchGraph(
        trunk="master",
        branches=(
            GtTrackedBranch(
                name="master",
                parent=None,
                children=("feat/base",),
                validation_result="TRUNK",
            ),
            GtTrackedBranch(
                name="feat/base",
                parent="master",
                children=(),
                validation_result=None,
            ),
        ),
        warnings=(),
    )
    gateway = FakeGtGateway(trunk="main", branch_graph_by_cwd={cwd: graph})

    assert gateway.branch_graph(cwd) == graph


def test_fake_gt_gateway_branch_graph_failure_passthrough() -> None:
    cwd = Path("/repo")
    failure = GtCommandFailure(message="metadata missing", returncode=None)
    gateway = FakeGtGateway(branch_graph=failure)

    assert gateway.branch_graph(cwd) == failure


def test_fake_gt_gateway_branch_graph_can_represent_forked_graph() -> None:
    graph = GtBranchGraph(
        trunk="main",
        branches=(
            GtTrackedBranch(
                name="main",
                parent=None,
                children=("feat/a", "feat/b"),
                validation_result="TRUNK",
            ),
            GtTrackedBranch(
                name="feat/a",
                parent="main",
                children=("feat/a2",),
                validation_result=None,
            ),
            GtTrackedBranch(
                name="feat/a2",
                parent="feat/a",
                children=(),
                validation_result=None,
            ),
            GtTrackedBranch(
                name="feat/b",
                parent="main",
                children=(),
                validation_result=None,
            ),
        ),
        warnings=(),
    )
    gateway = FakeGtGateway(branch_graph=graph)

    assert gateway.branch_graph(Path("/repo")) == graph
