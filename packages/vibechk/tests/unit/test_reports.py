from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from vibechk.models import GitProvenance, LoadedBundle, Metrics, RunBundle
from vibechk.reports import render_comparison_report, render_run_report


def test_render_run_report_is_stable() -> None:
    report = render_run_report(
        _loaded(
            "aaaabbbb",
            metrics=Metrics(wall_time_seconds=1.25, total_tokens=None),
            diff_patch="diff --git a/result.txt b/result.txt\n+hello\n",
            transcript="runner output\n",
        )
    )

    assert "# Vibechk Run `aaaabbbb`" in report
    assert "- Status: success" in report
    assert "- Model: null" in report
    assert "| Wall time seconds | 1.25 |" in report
    assert "| Total tokens | null |" in report
    assert "<summary>Transcript</summary>" in report
    assert "runner output" in report
    assert "+hello" in report


def test_render_comparison_report_formats_deltas_and_nulls() -> None:
    baseline = _loaded(
        "aaaabbbb",
        metrics=Metrics(wall_time_seconds=1.0, input_tokens=2, total_tokens=5, cost_usd=None),
    )
    treatment = _loaded(
        "ccccdddd",
        metrics=Metrics(wall_time_seconds=3.0, input_tokens=4, total_tokens=9, cost_usd=0.25),
    )

    report = render_comparison_report(baseline, treatment)

    assert "# Vibechk Comparison" in report
    assert "- Wall time seconds: 1 -> 3 (+2)" in report
    assert "- Cost USD: null -> 0.25 (n/a)" in report
    assert "| Input tokens | 2 | 4 | +2 |" in report
    assert "| Cost USD | null | 0.25 | n/a |" in report
    assert "| Runner | fake | fake |" in report
    assert "<summary>Plan</summary>" in report


def test_render_comparison_report_shows_plan_mismatch() -> None:
    baseline = _loaded("aaaabbbb", plan_text="# Baseline\n")
    treatment = _loaded("ccccdddd", plan_text="# Treatment\n")

    report = render_comparison_report(baseline, treatment)

    assert "Warning: baseline and treatment plans differ" in report
    assert "<summary>Baseline Plan</summary>" in report
    assert "<summary>Treatment Plan</summary>" in report


def _loaded(
    run_id: str,
    *,
    metrics: Metrics | None = None,
    plan_text: str = "# Plan\n",
    transcript: str = "",
    diff_patch: str = "",
) -> LoadedBundle:
    timestamp = datetime(2026, 5, 23, 12, 0, tzinfo=UTC)
    bundle = RunBundle(
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
        metrics=metrics or Metrics(),
        result_branch=None,
        branch_created=False,
        runner_exit_code=0,
        error=None,
    )
    return LoadedBundle(
        run_dir=Path("/tmp/store/runs") / run_id,
        bundle=bundle,
        plan_text=plan_text,
        transcript=transcript,
        diff_patch=diff_patch,
    )
