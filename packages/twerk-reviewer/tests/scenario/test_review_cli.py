from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_reviewer import git_toplevel as git_toplevel_module
from twerk_reviewer.cli.main import build_cli
from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.gateways.harness_config.fake import FakeHarnessConfigGateway
from twerk_reviewer.gateways.harness_config.gateway import ReviewerConfig
from twerk_reviewer.gateways.harness_detection.fake import FakeHarnessDetectionGateway
from twerk_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from twerk_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.fake import FakeReviewExecutionGateway
from twerk_reviewer.models import LocalDiff, ReviewExecutionResponse, ReviewFinding

REPO_ROOT = Path("/repo")
REVIEWS_DIR = REPO_ROOT / "reviews"
REVIEW_KEY = "dignified-python"
REVIEW_PATH = REVIEWS_DIR / f"{REVIEW_KEY}.md"


def _sample_source(*, include_default_model: bool = True) -> str:
    default_model_section = ""
    if include_default_model:
        default_model_section = "\n## Default Model\n\nsonnet\n"
    return (
        "# Dignified Python\n\n"
        "## Description\n\n"
        "Review Python diffs for style violations.\n\n"
        "## Instructions\n\n"
        "Flag concrete issues in the diff.\n"
        f"{default_model_section}"
    )


def _context(
    *,
    findings: tuple[ReviewFinding, ...] = (),
    configured_harness: str | None = "claude-code",
    keys: dict[Path, tuple[str, ...]] | None = None,
) -> ReviewerCliContext:
    harness_config = FakeHarnessConfigGateway()
    if configured_harness is not None:
        harness_config.save(REPO_ROOT, ReviewerConfig(harness_name=configured_harness))

    return ReviewerCliContext(
        review_definition=FakeReviewDefinitionGateway(
            sources_by_path={REVIEW_PATH: _sample_source()},
            keys_by_reviews_dir=keys,
        ),
        local_diff=FakeLocalDiffGateway(
            default_result=LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            )
        ),
        review_execution=FakeReviewExecutionGateway(
            default_response=ReviewExecutionResponse(findings=findings),
        ),
        harness_detection=FakeHarnessDetectionGateway(
            paths_by_binary={"claude": "/usr/local/bin/claude"}
        ),
        harness_config=harness_config,
        cwd=Path("/anywhere"),
    )


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@pytest.fixture(autouse=True)
def _fake_git_toplevel(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse", "--show-toplevel"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{REPO_ROOT}\n", stderr="")
        raise AssertionError(f"unexpected git command: {cmd!r}")

    monkeypatch.setattr(git_toplevel_module.subprocess, "run", fake_run)


def test_reviewer_help_lists_subgroups(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Markdown-driven reviewer operations." in result.output
    assert "review" in result.output
    assert "harness" in result.output
    assert "json" in result.output
    assert "--version" in result.output


def test_reviewer_version_option(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


def test_review_run_human_output(cli_group: ClinkrGroup) -> None:
    finding = ReviewFinding(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() instead.",
    )
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet"],
        obj=_context(findings=(finding,)),
    )

    assert result.exit_code == 0, result.output
    assert "Reviewer: Dignified Python" in result.output
    assert "Model: sonnet" in result.output
    assert "Base ref: master" in result.output
    assert "[warning] app.py:1 Avoid print in library code" in result.output


def test_review_run_uses_default_model_from_definition(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    ctx = _context()

    result = runner.invoke(cli_group, ["review", "run", REVIEW_KEY], obj=ctx)

    assert result.exit_code == 0, result.output
    assert "Model: sonnet" in result.output
    assert ctx.review_execution.executed_requests[0].model == "sonnet"  # type: ignore[attr-defined]


def test_review_run_surfaces_missing_harness_config(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet"],
        obj=_context(configured_harness=None),
    )

    assert result.exit_code != 0
    assert "reviewer harness init" in result.output


def test_review_run_json_output(cli_group: ClinkrGroup) -> None:
    finding = ReviewFinding(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() instead.",
    )
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["review", "json", "run"],
        input=json.dumps({"key": REVIEW_KEY, "model": "sonnet"}),
        obj=_context(findings=(finding,)),
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["success"] is True
    assert output["count"] == 1
    assert output["findings"][0]["summary"] == "Avoid print in library code"


def test_review_list_human_output(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    ctx = _context(
        keys={REVIEWS_DIR: ("dignified-python", "python/typing")},
    )

    result = runner.invoke(cli_group, ["review", "list"], obj=ctx)

    assert result.exit_code == 0, result.output
    assert "dignified-python" in result.output
    assert "python/typing" in result.output


def test_review_list_alias_ls(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    ctx = _context(keys={REVIEWS_DIR: ("dignified-python",)})

    result = runner.invoke(cli_group, ["review", "ls"], obj=ctx)

    assert result.exit_code == 0, result.output
    assert "dignified-python" in result.output


def test_review_run_requires_typed_context(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet"],
        obj={"wrong": "shape"},
    )

    assert result.exit_code != 0
    assert "ReviewerCliContext missing from click context" in str(result.exception)
