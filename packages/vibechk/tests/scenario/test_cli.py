from __future__ import annotations

import json
import subprocess
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TextIO

from click.testing import CliRunner

from vibechk.cli import build_cli
from vibechk.deps import CliDeps
from vibechk.git import RealGitGateway
from vibechk.models import Metrics, RunnerResult
from vibechk.runners import Runner, RunnerRegistry, RunnerRequest


def test_vibechk_help() -> None:
    result = CliRunner().invoke(build_cli(), ["-h"])

    assert result.exit_code == 0
    assert "Usage: vibechk" in result.output
    assert "Run lightweight agent context evals and publish Markdown evidence." in result.output
    assert "--version" in result.output
    assert "run" in result.output
    assert "runs" in result.output
    assert "show" in result.output
    assert "diff" in result.output


def test_vibechk_version() -> None:
    result = CliRunner().invoke(build_cli(), ["--version"])

    assert result.exit_code == 0
    assert "vibechk" in result.output
    assert "version" in result.output.lower()


def test_run_show_diff_walking_skeleton(tmp_path: Path) -> None:
    baseline_repo = _init_repo(tmp_path / "baseline")
    treatment_repo = _init_repo(tmp_path / "treatment")
    plan_path = tmp_path / "plan.md"
    plan_path.write_text("# Plan\n\nWrite the result file.\n", encoding="utf-8")
    store = tmp_path / "store"
    deps = _deps(
        ids=["aaaabbbb", "ccccdddd"],
        runner=FakeRunner(
            changes_by_workdir={
                "baseline": "baseline result\n",
                "treatment": "treatment result\n",
            },
            metrics_by_workdir={
                "baseline": Metrics(wall_time_seconds=1.0, total_tokens=10, cost_usd=0.1),
                "treatment": Metrics(wall_time_seconds=2.5, total_tokens=13, cost_usd=0.15),
            },
        ),
    )
    cli = build_cli(deps=deps)
    runner = CliRunner()

    baseline_result = runner.invoke(
        cli,
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(baseline_repo),
            "--runner",
            "fake",
            "--store",
            str(store),
        ],
    )
    treatment_result = runner.invoke(
        cli,
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(treatment_repo),
            "--runner",
            "fake",
            "--store",
            str(store),
        ],
    )

    assert baseline_result.exit_code == 0, baseline_result.output
    assert treatment_result.exit_code == 0, treatment_result.output
    baseline_id = _extract_run_id(baseline_result.output)
    treatment_id = _extract_run_id(treatment_result.output)
    assert baseline_id == "aaaabbbb"
    assert treatment_id == "ccccdddd"
    assert _git(baseline_repo, "branch", "--show-current") == "main"
    assert _git(baseline_repo, "status", "--porcelain=v1") == ""
    assert _git(treatment_repo, "branch", "--show-current") == "main"
    assert _git(treatment_repo, "status", "--porcelain=v1") == ""

    show_result = runner.invoke(cli, ["show", baseline_id, "--store", str(store)])
    diff_result = runner.invoke(cli, ["diff", baseline_id, treatment_id, "--store", str(store)])

    assert show_result.exit_code == 0, show_result.output
    assert f"# Vibechk Run `{baseline_id}`" in show_result.output
    assert "- Status: success" in show_result.output
    assert "- Runner: fake" in show_result.output
    assert "| Wall time seconds | 1 |" in show_result.output
    assert "<summary>Plan</summary>" in show_result.output
    assert "## Diff" in show_result.output
    assert "+baseline result" in show_result.output

    assert diff_result.exit_code == 0, diff_result.output
    assert "# Vibechk Comparison" in diff_result.output
    assert f"Baseline: `{baseline_id}`" in diff_result.output
    assert f"Treatment: `{treatment_id}`" in diff_result.output
    assert "## Biggest Metric Deltas" in diff_result.output
    assert "| Runner | fake | fake |" in diff_result.output
    assert "## Baseline Diff" in diff_result.output
    assert "## Treatment Diff" in diff_result.output
    assert "+treatment result" in diff_result.output


def test_run_rejects_dirty_workdir(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "repo")
    plan_path = tmp_path / "plan.md"
    plan_path.write_text("# Plan\n", encoding="utf-8")
    (repo / "README.md").write_text("dirty\n", encoding="utf-8")
    deps = _deps(ids=["aaaabbbb"], runner=FakeRunner())

    result = CliRunner().invoke(
        build_cli(deps=deps),
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(repo),
            "--runner",
            "fake",
            "--store",
            str(tmp_path / "store"),
        ],
    )

    assert result.exit_code != 0
    assert "requires a clean workdir" in result.output


def test_show_resolves_unique_prefix(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "repo")
    plan_path = tmp_path / "plan.md"
    plan_path.write_text("# Plan\n", encoding="utf-8")
    deps = _deps(ids=["abc11111", "def22222"], runner=FakeRunner())
    cli = build_cli(deps=deps)
    runner = CliRunner()
    store = tmp_path / "store"

    first = runner.invoke(
        cli,
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(repo),
            "--runner",
            "fake",
            "--store",
            str(store),
        ],
    )
    second = runner.invoke(
        cli,
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(repo),
            "--runner",
            "fake",
            "--store",
            str(store),
        ],
    )

    assert first.exit_code == 0, first.output
    assert second.exit_code == 0, second.output
    show = runner.invoke(cli, ["show", "abc", "--store", str(store)])

    assert show.exit_code == 0, show.output
    assert "# Vibechk Run `abc11111`" in show.output


def test_show_rejects_ambiguous_prefix(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "repo")
    plan_path = tmp_path / "plan.md"
    plan_path.write_text("# Plan\n", encoding="utf-8")
    deps = _deps(ids=["abc11111", "abc22222"], runner=FakeRunner())
    cli = build_cli(deps=deps)
    runner = CliRunner()
    store = tmp_path / "store"

    first = runner.invoke(
        cli,
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(repo),
            "--runner",
            "fake",
            "--store",
            str(store),
        ],
    )
    second = runner.invoke(
        cli,
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(repo),
            "--runner",
            "fake",
            "--store",
            str(store),
        ],
    )

    assert first.exit_code == 0, first.output
    assert second.exit_code == 0, second.output
    show = runner.invoke(cli, ["show", "abc", "--store", str(store)])

    assert show.exit_code != 0
    assert "Run prefix 'abc' is ambiguous: abc11111, abc22222" in show.output


def test_failed_runner_persists_consumable_bundle(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path / "repo")
    plan_path = tmp_path / "plan.md"
    plan_path.write_text("# Plan\n", encoding="utf-8")
    store = tmp_path / "store"
    deps = _deps(
        ids=["deadbeef"],
        runner=FakeRunner(
            exit_code=7,
            changes_by_workdir={"repo": "failed output\n"},
        ),
    )
    cli = build_cli(deps=deps)
    runner = CliRunner()

    run_result = runner.invoke(
        cli,
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(repo),
            "--runner",
            "fake",
            "--store",
            str(store),
        ],
    )

    assert run_result.exit_code == 7, run_result.output
    assert "Run ID: deadbeef" in run_result.output
    assert (store / "runs" / "deadbeef" / "bundle.json").exists()

    show_result = runner.invoke(cli, ["show", "dead", "--store", str(store)])

    assert show_result.exit_code == 0, show_result.output
    assert "- Status: failed" in show_result.output
    assert "fake transcript for repo" in show_result.output
    assert "+failed output" in show_result.output


def test_runs_empty_store_outputs_empty_states_without_creating_store(tmp_path: Path) -> None:
    store = tmp_path / "missing-store"
    cli = build_cli()
    runner = CliRunner()

    table_result = runner.invoke(cli, ["runs", "--store", str(store)])
    json_result = runner.invoke(cli, ["runs", "--format", "json", "--store", str(store)])

    assert table_result.exit_code == 0, table_result.output
    assert table_result.output == "No vibechk runs found.\n"
    assert json_result.exit_code == 0, json_result.output
    assert json.loads(json_result.output) == []
    assert not store.exists()


def test_runs_lists_bundles_newest_first_in_table_and_json(tmp_path: Path) -> None:
    baseline_repo = _init_repo(tmp_path / "baseline")
    treatment_repo = _init_repo(tmp_path / "treatment")
    plan_path = tmp_path / "plan.md"
    plan_path.write_text("# Plan\n", encoding="utf-8")
    store = tmp_path / "store"
    deps = _deps(
        ids=["aaaabbbb", "ccccdddd"],
        runner=FakeRunner(
            changes_by_workdir={"treatment": "treatment result\n"},
            metrics_by_workdir={"treatment": Metrics(wall_time_seconds=1.2, total_tokens=10)},
        ),
    )
    cli = build_cli(deps=deps)
    runner = CliRunner()

    baseline_result = runner.invoke(
        cli,
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(baseline_repo),
            "--runner",
            "fake",
            "--store",
            str(store),
        ],
    )
    treatment_result = runner.invoke(
        cli,
        [
            "run",
            "--plan",
            str(plan_path),
            "--workdir",
            str(treatment_repo),
            "--runner",
            "fake",
            "--model",
            "model-b",
            "--store",
            str(store),
        ],
    )

    assert baseline_result.exit_code == 0, baseline_result.output
    assert treatment_result.exit_code == 0, treatment_result.output

    table_result = runner.invoke(cli, ["runs", "--store", str(store)])

    assert table_result.exit_code == 0, table_result.output
    lines = table_result.output.splitlines()
    assert lines[0].startswith("RUN ID")
    newest_cells = lines[1].split()
    oldest_cells = lines[2].split()
    assert newest_cells == [
        "ccccdddd",
        "2026-05-23T12:00:02+00:00",
        "success",
        "fake",
        "model-b",
        "vibechk/ccccdddd",
        str(treatment_repo.resolve()),
    ]
    assert oldest_cells == [
        "aaaabbbb",
        "2026-05-23T12:00:00+00:00",
        "success",
        "fake",
        "-",
        "-",
        str(baseline_repo.resolve()),
    ]

    json_result = runner.invoke(cli, ["runs", "--format", "json", "--store", str(store)])

    assert json_result.exit_code == 0, json_result.output
    entries = json.loads(json_result.output)
    assert [entry["run_id"] for entry in entries] == ["ccccdddd", "aaaabbbb"]
    assert entries[0]["started_at"] == "2026-05-23T12:00:02+00:00"
    assert entries[0]["finished_at"] == "2026-05-23T12:00:03+00:00"
    assert entries[0]["runner"] == "fake"
    assert entries[0]["runner_version"] == "fake-1"
    assert entries[0]["model"] == "model-b"
    assert entries[0]["workdir"] == str(treatment_repo.resolve())
    assert entries[0]["starting_branch"] == "main"
    assert entries[0]["result_branch"] == "vibechk/ccccdddd"
    assert entries[0]["branch_created"] is True
    assert entries[0]["runner_exit_code"] == 0
    assert entries[0]["metrics"]["wall_time_seconds"] == 1.2
    assert entries[0]["metrics"]["total_tokens"] == 10
    assert entries[0]["run_dir"] == str(store / "runs" / "ccccdddd")
    assert entries[1]["model"] is None
    assert entries[1]["result_branch"] is None
    assert entries[1]["branch_created"] is False
    assert entries[1]["metrics"]["total_tokens"] is None


class FakeRunner(Runner):
    def __init__(
        self,
        *,
        exit_code: int = 0,
        changes_by_workdir: dict[str, str] | None = None,
        metrics_by_workdir: dict[str, Metrics] | None = None,
    ) -> None:
        self._exit_code = exit_code
        self._changes_by_workdir = changes_by_workdir or {}
        self._metrics_by_workdir = metrics_by_workdir or {}

    @property
    def name(self) -> str:
        return "fake"

    def run(self, request: RunnerRequest, transcript_sink: TextIO) -> RunnerResult:
        workdir_name = request.workdir.name
        transcript_sink.write(f"fake transcript for {workdir_name}\n")
        if workdir_name in self._changes_by_workdir:
            (request.workdir / "result.txt").write_text(
                self._changes_by_workdir[workdir_name],
                encoding="utf-8",
            )
        return RunnerResult(
            exit_code=self._exit_code,
            transcript="",
            metrics=self._metrics_by_workdir.get(workdir_name, Metrics()),
            artifacts={},
            runner_version="fake-1",
        )


def _deps(*, ids: list[str], runner: FakeRunner) -> CliDeps:
    return CliDeps(
        runner_registry=RunnerRegistry([runner]),
        git_gateway_factory=RealGitGateway,
        clock=_clock(),
        id_generator=_id_generator(ids),
        default_runner_name="fake",
    )


def _id_generator(ids: list[str]) -> Callable[[], str]:
    values = iter(ids)

    def generate() -> str:
        return next(values)

    return generate


def _clock() -> Callable[[], datetime]:
    start = datetime(2026, 5, 23, 12, 0, tzinfo=UTC)
    ticks = iter(start + timedelta(seconds=index) for index in range(100))

    def now() -> datetime:
        return next(ticks)

    return now


def _init_repo(path: Path) -> Path:
    path.mkdir(parents=True)
    _git(path, "init", "-b", "main")
    _git(path, "config", "user.email", "vibechk@example.com")
    _git(path, "config", "user.name", "Vibechk Tests")
    (path / "README.md").write_text("initial\n", encoding="utf-8")
    _git(path, "add", "README.md")
    _git(path, "commit", "-m", "initial")
    return path


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _extract_run_id(output: str) -> str:
    for line in output.splitlines():
        if line.startswith("Run ID: "):
            return line.removeprefix("Run ID: ")
    raise AssertionError(f"Run ID line not found in output: {output}")
