"""Unit tests for ``classify_obj_state``."""

from __future__ import annotations

from twerk_objectives.freshness import classify_obj_state


def test_deleted_branch_is_fresh() -> None:
    state = classify_obj_state(
        alive=False,
        snapshot_iso="2026-04-26T07:00:00+00:00",
        branch_commit_pids=("p1",),
        absorbed_pids=frozenset(),
        branch_max_author_iso="2026-04-26T08:00:00+00:00",
    )
    assert state == "fresh"


def test_all_pids_absorbed_is_fresh() -> None:
    state = classify_obj_state(
        alive=True,
        snapshot_iso=None,
        branch_commit_pids=("p1", "p2"),
        absorbed_pids=frozenset({"p1", "p2", "p3"}),
        branch_max_author_iso=None,
    )
    assert state == "fresh"


def test_one_novel_pid_is_stale() -> None:
    state = classify_obj_state(
        alive=True,
        snapshot_iso=None,
        branch_commit_pids=("p1", "p_novel"),
        absorbed_pids=frozenset({"p1"}),
        branch_max_author_iso=None,
    )
    assert state == "stale"


def test_null_pid_forces_stale() -> None:
    state = classify_obj_state(
        alive=True,
        snapshot_iso=None,
        branch_commit_pids=("p1", None),
        absorbed_pids=frozenset({"p1"}),
        branch_max_author_iso=None,
    )
    assert state == "stale"


def test_empty_branch_commit_pids_is_fresh() -> None:
    state = classify_obj_state(
        alive=True,
        snapshot_iso=None,
        branch_commit_pids=(),
        absorbed_pids=frozenset(),
        branch_max_author_iso=None,
    )
    assert state == "fresh"


def test_date_fallback_stale_when_branch_newer() -> None:
    state = classify_obj_state(
        alive=True,
        snapshot_iso="2026-04-26T07:00:00+00:00",
        branch_commit_pids=None,
        absorbed_pids=None,
        branch_max_author_iso="2026-04-26T08:00:00+00:00",
    )
    assert state == "stale"


def test_date_fallback_fresh_when_snapshot_at_or_after_branch() -> None:
    state = classify_obj_state(
        alive=True,
        snapshot_iso="2026-04-26T08:00:00+00:00",
        branch_commit_pids=None,
        absorbed_pids=None,
        branch_max_author_iso="2026-04-26T08:00:00+00:00",
    )
    assert state == "fresh"


def test_date_fallback_fresh_when_isos_missing() -> None:
    state = classify_obj_state(
        alive=True,
        snapshot_iso=None,
        branch_commit_pids=None,
        absorbed_pids=None,
        branch_max_author_iso=None,
    )
    assert state == "fresh"


def test_partial_pid_signal_falls_back_to_dates() -> None:
    state = classify_obj_state(
        alive=True,
        snapshot_iso="2026-04-26T08:00:00+00:00",
        branch_commit_pids=("p1",),
        absorbed_pids=None,
        branch_max_author_iso="2026-04-26T07:00:00+00:00",
    )
    assert state == "fresh"
