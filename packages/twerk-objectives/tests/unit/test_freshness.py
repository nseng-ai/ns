"""Unit tests for ``classify_obj_state`` and ``classify_branch_snapshot``."""

from __future__ import annotations

from brmem.fake import FakeBranchMemoryGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import CommitSummary, GitCommandFailure
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

    state = classify_branch_snapshot(
        gateway,
        git,
        "feat/widget",
        "widget",
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

    state = classify_branch_snapshot(
        gateway,
        git,
        "feat/widget",
        "widget",
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

    state = classify_branch_snapshot(
        gateway,
        git,
        "feat/widget",
        "widget",
        trunk="master",
        alive=True,
    )

    assert state == "fresh"


def test_classify_branch_snapshot_dead_branch_is_fresh() -> None:
    """The wrapper does not upgrade dead branches to "deleted"; that is the caller's job."""
    gateway = FakeBranchMemoryGateway()
    git = FakeGitGateway()

    state = classify_branch_snapshot(
        gateway,
        git,
        "feat/widget",
        "widget",
        trunk="master",
        alive=False,
    )

    assert state == "fresh"


def test_classify_branch_snapshot_ignores_timestamps_when_pids_absorbed() -> None:
    """Patch-id absorption is authoritative — a stale-looking last-touch timestamp
    must not override a marker that already covers every branch patch ID.
    """
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
                    # Author time is much newer than any plausible snapshot
                    # last-touch — under a timestamp contract this would be
                    # flagged as stale. Patch-id freshness ignores it.
                    author_iso="2099-01-01T00:00:00+00:00",
                    subject="Wire widget",
                ),
            ),
        },
        patch_ids_by_range={"master..feat/widget": (("aaa111", "pid-1"),)},
        file_last_touched_by_ref_path={
            (
                "refs/brmem/ns/objectives/feat---widget",
                "widget/body.md",
            ): "1970-01-01T00:00:00+00:00",
        },
    )

    state = classify_branch_snapshot(
        gateway,
        git,
        "feat/widget",
        "widget",
        trunk="master",
        alive=True,
    )

    assert state == "fresh"


def test_classify_branch_snapshot_malformed_marker_is_stale() -> None:
    """Malformed `.absorbed.jsonl` is treated as missing — the snapshot is stale
    when there are content patch IDs to cover.
    """
    gateway = FakeBranchMemoryGateway()
    gateway.put(
        "objectives",
        "widget/.absorbed.jsonl",
        "feat/widget",
        "this-is-not-json\n",
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

    state = classify_branch_snapshot(
        gateway,
        git,
        "feat/widget",
        "widget",
        trunk="master",
        alive=True,
    )

    assert state == "stale"
