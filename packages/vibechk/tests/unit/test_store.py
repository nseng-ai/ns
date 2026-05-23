from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from vibechk.errors import VibechkError
from vibechk.models import GitProvenance, Metrics, RunBundle
from vibechk.store import (
    create_run_dir,
    list_bundles,
    read_bundle,
    resolve_run_id,
    resolve_store_root,
    write_bundle,
)


def test_resolve_store_root_precedence(tmp_path: Path) -> None:
    explicit = tmp_path / "explicit"

    assert resolve_store_root(explicit, {"VIBECHK_HOME": str(tmp_path / "env")}) == explicit
    assert resolve_store_root(None, {"VIBECHK_HOME": str(tmp_path / "env")}) == tmp_path / "env"
    assert resolve_store_root(None, {"XDG_STATE_HOME": str(tmp_path / "xdg")}) == (
        tmp_path / "xdg" / "vibechk"
    )


def test_create_run_dir_retries_collisions(tmp_path: Path) -> None:
    store = tmp_path / "store"
    existing = store / "runs" / "aaaabbbb"
    existing.mkdir(parents=True)
    ids = iter(["aaaabbbb", "ccccdddd"])

    run_id, run_dir = create_run_dir(store, lambda: next(ids))

    assert run_id == "ccccdddd"
    assert run_dir == store / "runs" / "ccccdddd"
    assert (run_dir / "artifacts").is_dir()


def test_read_bundle_round_trips_null_metrics(tmp_path: Path) -> None:
    run_dir = tmp_path / "store" / "runs" / "aaaabbbb"
    run_dir.mkdir(parents=True)
    (run_dir / "plan.md").write_text("# Plan\n", encoding="utf-8")
    (run_dir / "transcript.txt").write_text("transcript\n", encoding="utf-8")
    (run_dir / "diff.patch").write_text("", encoding="utf-8")

    write_bundle(run_dir, _bundle("aaaabbbb", metrics=Metrics()))

    loaded = read_bundle(tmp_path / "store", "aaaabbbb")

    assert loaded.bundle.metrics == Metrics()
    assert loaded.plan_text == "# Plan\n"
    payload = json.loads((run_dir / "bundle.json").read_text(encoding="utf-8"))
    assert payload["metrics"]["total_tokens"] is None
    assert payload["metrics"]["cost_usd"] is None


def test_resolve_run_id_exact_unique_missing_and_ambiguous(tmp_path: Path) -> None:
    runs = tmp_path / "store" / "runs"
    (runs / "abc11111").mkdir(parents=True)
    (runs / "abc22222").mkdir()
    (runs / "def33333").mkdir()

    assert resolve_run_id(tmp_path / "store", "abc11111") == "abc11111"
    assert resolve_run_id(tmp_path / "store", "def") == "def33333"
    with pytest.raises(VibechkError, match="No run matches prefix 'zzz'"):
        resolve_run_id(tmp_path / "store", "zzz")
    with pytest.raises(VibechkError, match="Run prefix 'abc' is ambiguous"):
        resolve_run_id(tmp_path / "store", "abc")


def test_list_bundles_returns_empty_for_missing_store_or_runs_dir(tmp_path: Path) -> None:
    missing_store = tmp_path / "missing-store"
    store_without_runs = tmp_path / "store-without-runs"
    store_without_runs.mkdir()

    assert list_bundles(missing_store) == []
    assert list_bundles(store_without_runs) == []
    assert not missing_store.exists()


def test_list_bundles_sorts_newest_first_with_run_id_tie_breaker(tmp_path: Path) -> None:
    store = tmp_path / "store"
    timestamp = datetime(2026, 5, 23, 12, 0, tzinfo=UTC)
    _write_test_bundle(
        store,
        _bundle("ccccdddd", metrics=Metrics(), started_at=timestamp + timedelta(hours=1)),
    )
    _write_test_bundle(store, _bundle("bbbbcccc", metrics=Metrics(), started_at=timestamp))
    _write_test_bundle(store, _bundle("aaaabbbb", metrics=Metrics(), started_at=timestamp))

    loaded = list_bundles(store)

    assert [item.bundle.run_id for item in loaded] == ["ccccdddd", "aaaabbbb", "bbbbcccc"]


def test_list_bundles_ignores_non_directory_children(tmp_path: Path) -> None:
    store = tmp_path / "store"
    runs = store / "runs"
    runs.mkdir(parents=True)
    (runs / "notes.txt").write_text("not a run\n", encoding="utf-8")
    _write_test_bundle(store, _bundle("aaaabbbb", metrics=Metrics()))

    loaded = list_bundles(store)

    assert [item.bundle.run_id for item in loaded] == ["aaaabbbb"]


def test_list_bundles_errors_for_missing_bundle_json(tmp_path: Path) -> None:
    run_dir = tmp_path / "store" / "runs" / "aaaabbbb"
    run_dir.mkdir(parents=True)

    with pytest.raises(VibechkError, match="is missing bundle.json"):
        list_bundles(tmp_path / "store")


def test_list_bundles_errors_for_invalid_bundle_json(tmp_path: Path) -> None:
    run_dir = tmp_path / "store" / "runs" / "aaaabbbb"
    run_dir.mkdir(parents=True)
    (run_dir / "bundle.json").write_text("{not json\n", encoding="utf-8")

    with pytest.raises(VibechkError, match="has an invalid bundle.json"):
        list_bundles(tmp_path / "store")


def _write_test_bundle(store: Path, bundle: RunBundle) -> None:
    run_dir = store / "runs" / bundle.run_id
    run_dir.mkdir(parents=True)
    write_bundle(run_dir, bundle)


def _bundle(
    run_id: str,
    *,
    metrics: Metrics,
    started_at: datetime | None = None,
) -> RunBundle:
    timestamp = started_at or datetime(2026, 5, 23, 12, 0, tzinfo=UTC)
    return RunBundle(
        schema_version=1,
        run_id=run_id,
        status="success",
        started_at=timestamp,
        finished_at=timestamp,
        runner="fake",
        runner_version=None,
        model=None,
        plan_source="/tmp/plan.md",
        workdir="/tmp/repo",
        git=GitProvenance(
            repo_root=Path("/tmp/repo"),
            starting_branch="main",
            starting_commit="abc123",
            remotes={},
        ),
        metrics=metrics,
        result_branch=None,
        branch_created=False,
        runner_exit_code=0,
        error=None,
    )
