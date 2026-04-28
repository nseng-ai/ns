"""Unit tests for ``absorbed_patch_ids_for_branch``."""

from __future__ import annotations

from pathlib import Path

from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import GitCommandFailure
from twerk_core.gt.testing import FakeGtGateway
from twerk_core.gt.types import GtCommandFailure, StackInfo
from twerk_objectives.exec.absorbed import (
    AbsorbedSetUnavailable,
    absorbed_patch_ids_for_branch,
)

CWD = Path("/repo")


def _stack(*ancestors: str, current: str = "feat/current") -> StackInfo:
    return StackInfo(
        trunk="master",
        current=current,
        ancestors=ancestors,
        children=(),
        warnings=(),
    )


def test_single_ancestor_union() -> None:
    git = FakeGitGateway(
        patch_ids_by_range={"master..feat/parent": (("sha1", "pid1"), ("sha2", "pid2"))},
    )
    gt = FakeGtGateway(
        trunk="master",
        stack_by_cwd={CWD: _stack("master", "feat/parent")},
    )

    result = absorbed_patch_ids_for_branch(git, gt, CWD, "feat/current", trunk="master")

    assert result == frozenset({"pid1", "pid2"})


def test_multi_ancestor_union() -> None:
    git = FakeGitGateway(
        patch_ids_by_range={
            "master..feat/a": (("sha-a", "pid-a"),),
            "master..feat/b": (("sha-a", "pid-a"), ("sha-b", "pid-b")),
        },
    )
    gt = FakeGtGateway(
        trunk="master",
        stack_by_cwd={CWD: _stack("master", "feat/a", "feat/b")},
    )

    result = absorbed_patch_ids_for_branch(git, gt, CWD, "feat/current", trunk="master")

    assert result == frozenset({"pid-a", "pid-b"})


def test_trunk_row_at_ancestors_zero_is_filtered() -> None:
    """Regression guard for the ``RealGtGateway`` invariant ``ancestors[0] == trunk``.

    If absorbed accidentally tried ``master..master``, the FakeGitGateway
    would return ``()`` and the test would still pass — so we actively
    seed a value for that range and assert it's *not* in the result.
    """
    git = FakeGitGateway(
        patch_ids_by_range={
            "master..master": (("sha-trunk", "pid-trunk-leak"),),
            "master..feat/parent": (("sha-p", "pid-p"),),
        },
    )
    gt = FakeGtGateway(
        trunk="master",
        stack_by_cwd={CWD: _stack("master", "feat/parent")},
    )

    result = absorbed_patch_ids_for_branch(git, gt, CWD, "feat/current", trunk="master")

    assert result == frozenset({"pid-p"})
    assert "pid-trunk-leak" not in result


def test_branch_self_filtered_from_ancestors() -> None:
    git = FakeGitGateway(
        patch_ids_by_range={
            "master..feat/self": (("sha-self", "pid-self-leak"),),
            "master..feat/parent": (("sha-p", "pid-p"),),
        },
    )
    gt = FakeGtGateway(
        trunk="master",
        stack_by_cwd={CWD: _stack("master", "feat/self", "feat/parent")},
    )

    result = absorbed_patch_ids_for_branch(git, gt, CWD, "feat/self", trunk="master")

    assert result == frozenset({"pid-p"})
    assert "pid-self-leak" not in result


def test_empty_ancestors_returns_empty_frozenset() -> None:
    git = FakeGitGateway()
    gt = FakeGtGateway(
        trunk="master",
        stack_by_cwd={CWD: _stack(current="master")},
    )

    result = absorbed_patch_ids_for_branch(git, gt, CWD, "master", trunk="master")

    assert result == frozenset()


def test_gt_stack_failure_returns_unavailable() -> None:
    git = FakeGitGateway()
    gt = FakeGtGateway(
        trunk="master",
        stack_by_cwd={CWD: GtCommandFailure(message="not a gt repo", returncode=1)},
    )

    result = absorbed_patch_ids_for_branch(git, gt, CWD, "feat/current", trunk="master")

    assert isinstance(result, AbsorbedSetUnavailable)
    assert "not a gt repo" in result.reason


def test_git_failure_on_any_ancestor_returns_unavailable() -> None:
    git = FakeGitGateway(
        patch_ids_failure=GitCommandFailure(message="git patch-id failed", returncode=128),
    )
    gt = FakeGtGateway(
        trunk="master",
        stack_by_cwd={CWD: _stack("master", "feat/parent")},
    )

    result = absorbed_patch_ids_for_branch(git, gt, CWD, "feat/current", trunk="master")

    assert isinstance(result, AbsorbedSetUnavailable)
    assert "git patch-id failed" in result.reason


def test_null_pids_dropped_from_absorbed_set() -> None:
    git = FakeGitGateway(
        patch_ids_by_range={
            "master..feat/parent": (("sha-real", "pid-real"), ("sha-merge", None)),
        },
    )
    gt = FakeGtGateway(
        trunk="master",
        stack_by_cwd={CWD: _stack("master", "feat/parent")},
    )

    result = absorbed_patch_ids_for_branch(git, gt, CWD, "feat/current", trunk="master")

    assert result == frozenset({"pid-real"})
