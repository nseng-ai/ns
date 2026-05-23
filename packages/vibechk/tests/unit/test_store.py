from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from vibechk.errors import VibechkError
from vibechk.models import GitProvenance, Metrics, RunBundle
from vibechk.store import (
    create_run_dir,
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


def _bundle(run_id: str, *, metrics: Metrics) -> RunBundle:
    timestamp = datetime(2026, 5, 23, 12, 0, tzinfo=UTC)
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
