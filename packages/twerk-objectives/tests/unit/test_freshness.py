"""Unit tests for ``classify_obj_state`` and ``classify_branch_snapshot``."""

from __future__ import annotations

from pathlib import Path

from brmem.fake import FakeBranchMemoryGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import CommitSummary, GitCommandFailure
from twerk_core.gt.testing import FakeGtGateway
from twerk_core.gt.types import StackInfo
from twerk_objectives.freshness import (
    classify_branch_snapshot,
    classify_obj_state,
    classify_timestamp_state,
)


def test_deleted_branch_is_fresh() -> None:
    state = classify_obj_state(
        alive=False,
        branch_commit_pids=("p1",),
        absorbed_pids=frozenset(),
    )
    assert state == "fresh"


def test_all_pids_absorbed_is_fresh() -> None:
    state = classify_obj_state(
        alive=True,
        branch_commit_pids=("p1", "p2"),
        absorbed_pids=frozenset({"p1", "p2", "p3"}),
    )
    assert state == "fresh"


def test_one_novel_pid_is_stale() -> None:
    state = classify_obj_state(
        alive=True,
        branch_commit_pids=("p1", "p_novel"),
        absorbed_pids=frozenset({"p1"}),
    )
    assert state == "stale"


def test_null_pid_is_ignored() -> None:
    state = classify_obj_state(
        alive=True,
        branch_commit_pids=("p1", None),
        absorbed_pids=frozenset({"p1"}),
    )
    assert state == "fresh"


def test_empty_branch_commit_pids_is_fresh() -> None:
    state = classify_obj_state(
        alive=True,
        branch_commit_pids=(),
        absorbed_pids=frozenset(),
    )
    assert state == "fresh"


def test_unavailable_patch_ids_are_stale() -> None:
    state = classify_obj_state(
        alive=True,
        branch_commit_pids=None,
        absorbed_pids=None,
    )
    assert state == "stale"


def test_timestamp_state_stale_when_branch_newer() -> None:
    state = classify_timestamp_state(
        alive=True,
        snapshot_iso="2026-04-26T08:00:00+00:00",
        branch_head_iso="2026-04-26T09:00:00+00:00",
    )
    assert state == "stale"


def test_timestamp_state_fresh_when_snapshot_at_or_after_branch() -> None:
    state = classify_timestamp_state(
        alive=True,
        snapshot_iso="2026-04-26T08:00:00+00:00",
        branch_head_iso="2026-04-26T08:00:00+00:00",
    )
    assert state == "fresh"


def test_timestamp_state_fresh_when_isos_missing() -> None:
    state = classify_timestamp_state(
        alive=True,
        snapshot_iso=None,
        branch_head_iso=None,
    )
    assert state == "fresh"


# ---------------------------------------------------------------------------
# classify_branch_snapshot — slug-keyed wrapper
# ---------------------------------------------------------------------------


def _make_gt(*, ancestors: tuple[str, ...] = ()) -> FakeGtGateway:
    cwd = Path.cwd()
    return FakeGtGateway(
        trunk="master",
        stack_by_cwd={
            cwd: StackInfo(
                trunk="master",
                current="feat/widget",
                ancestors=ancestors,
                children=(),
                warnings=(),
            )
        },
    )


def test_classify_branch_snapshot_alive_with_unavailable_inputs_is_stale() -> None:
    gateway = FakeBranchMemoryGateway()
    git = FakeGitGateway(
        commits_by_range={
            "master..feat/widget": (
                CommitSummary(
                    sha="bbb222",
                    author_iso="2026-04-26T08:00:00+00:00",
                    subject="Wire widget",
                ),
            ),
        },
        patch_ids_failure=GitCommandFailure(message="boom", returncode=1),
    )
    gt = _make_gt()

    state = classify_branch_snapshot(
        gateway,
        git,
        gt,
        "feat/widget",
        "widget",
        cwd=Path.cwd(),
        trunk="master",
        alive=True,
    )

    assert state == "stale"


def test_classify_branch_snapshot_alive_with_unabsorbed_pid_is_stale() -> None:
    gateway = FakeBranchMemoryGateway()
    git = FakeGitGateway(
        commits_by_range={
            "master..feat/widget": (
                CommitSummary(
                    sha="bbb222",
                    author_iso="2026-04-26T08:00:00+00:00",
                    subject="Wire widget",
                ),
            ),
        },
        patch_ids_by_range={
            "master..feat/widget": (("bbb222", "pid-novel"),),
        },
    )
    gt = _make_gt(ancestors=("master",))

    state = classify_branch_snapshot(
        gateway,
        git,
        gt,
        "feat/widget",
        "widget",
        cwd=Path.cwd(),
        trunk="master",
        alive=True,
    )

    assert state == "stale"


def test_classify_branch_snapshot_marker_absorbs_branch_pid() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(
        "objectives",
        "widget/.absorbed.jsonl",
        "feat/widget",
        (
            '{"schema":1,"sha":"aaa111","patch_id":"pid-1",'
            '"author_iso":"2026-04-26T08:00:00+00:00","subject":"Wire widget"}\n'
        ),
    )
    git = FakeGitGateway(
        commits_by_range={
            "master..feat/widget": (
                CommitSummary(
                    sha="aaa111",
                    author_iso="2026-04-26T08:00:00+00:00",
                    subject="Wire widget",
                ),
            ),
        },
        patch_ids_by_range={"master..feat/widget": (("aaa111", "pid-1"),)},
    )
    gt = _make_gt(ancestors=("master",))

    state = classify_branch_snapshot(
        gateway,
        git,
        gt,
        "feat/widget",
        "widget",
        cwd=Path.cwd(),
        trunk="master",
        alive=True,
    )

    assert state == "fresh"


def test_classify_branch_snapshot_dead_branch_is_fresh() -> None:
    """The wrapper does not upgrade dead branches to "deleted"; that is the caller's job."""
    gateway = FakeBranchMemoryGateway()
    git = FakeGitGateway()
    gt = _make_gt()

    state = classify_branch_snapshot(
        gateway,
        git,
        gt,
        "feat/widget",
        "widget",
        cwd=Path.cwd(),
        trunk="master",
        alive=False,
    )

    assert state == "fresh"
