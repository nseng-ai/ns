from __future__ import annotations

from pathlib import Path

from twerk_slots.cli.slot.gt.testing import FakeGtGateway
from twerk_slots.cli.slot.gt.types import GtCommandFailure, NoParent, UntrackedBranch


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
