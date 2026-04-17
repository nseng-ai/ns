from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_reviewer.cli.main import build_cli
from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.gateways.local_diff import real as local_diff_real
from twerk_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from twerk_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution import real as review_execution_real
from twerk_reviewer.gateways.review_execution.fake import FakeReviewExecutionGateway
from twerk_reviewer.models import LocalDiff, ReviewExecutionResponse, ReviewFinding


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _review_path() -> Path:
    return Path("standards/dignified-python.md")


def _review_source(*, include_default_model: bool = True) -> str:
    default_model_section = ""
    if include_default_model:
        default_model_section = "\n## Default Model\n\ngpt-5-mini\n"
    return (
        "# Dignified Python\n\n"
        "## Description\n\n"
        "Review Python diffs for violations of the team style guide.\n\n"
        "## Instructions\n\n"
        "Flag concrete issues in the supplied diff.\n"
        f"{default_model_section}"
    )


def _context(*, findings: tuple[ReviewFinding, ...] = ()) -> ReviewerCliContext:
    return ReviewerCliContext(
        review_definition=FakeReviewDefinitionGateway(
            sources_by_path={_review_path(): _review_source()}
        ),
        local_diff=FakeLocalDiffGateway(
            default_result=LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            )
        ),
        review_execution=FakeReviewExecutionGateway(
            default_response=ReviewExecutionResponse(findings=findings)
        ),
    )


def test_reviewer_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Markdown-driven reviewer operations." in result.output
    assert "--version" in result.output
    assert "review-local" in result.output
    assert "json" in result.output


def test_reviewer_version_option(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


def test_review_local_human_output(cli_group: ClinkrGroup) -> None:
    finding = ReviewFinding(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() or structured logging instead.",
    )
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "review-local",
            str(_review_path()),
            "--model",
            "gpt-5-mini",
            "--executor-command",
            "fake-reviewer",
        ],
        obj=_context(findings=(finding,)),
    )

    assert result.exit_code == 0
    assert "Reviewer: Dignified Python" in result.output
    assert "Model: gpt-5-mini" in result.output
    assert "Base ref: master" in result.output
    assert "[warning] app.py:1 Avoid print in library code" in result.output


def test_review_local_json_output(cli_group: ClinkrGroup) -> None:
    finding = ReviewFinding(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() or structured logging instead.",
    )
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["json", "review-local"],
        input=json.dumps(
            {
                "review_path": str(_review_path()),
                "executor_command": "fake-reviewer",
                "model": "gpt-5-mini",
            }
        ),
        obj=_context(findings=(finding,)),
    )

    assert result.exit_code == 0
    output = json.loads(result.output)
    assert output["success"] is True
    assert output["count"] == 1
    assert output["findings"][0]["summary"] == "Avoid print in library code"


def test_review_local_uses_default_model_from_definition(cli_group: ClinkrGroup) -> None:
    execution_gateway = FakeReviewExecutionGateway()
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "review-local",
            str(_review_path()),
            "--executor-command",
            "fake-reviewer",
        ],
        obj=ReviewerCliContext(
            review_definition=FakeReviewDefinitionGateway(
                sources_by_path={_review_path(): _review_source(include_default_model=True)}
            ),
            local_diff=FakeLocalDiffGateway(),
            review_execution=execution_gateway,
        ),
    )

    assert result.exit_code == 0
    assert "Model: gpt-5-mini" in result.output
    assert execution_gateway.executed_requests[0].model == "gpt-5-mini"


def test_review_local_requires_typed_context(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "review-local",
            str(_review_path()),
            "--model",
            "gpt-5-mini",
            "--executor-command",
            "fake-reviewer",
        ],
        obj={"wrong": "shape"},
    )

    assert result.exit_code != 0
    assert "ReviewerCliContext missing from click context" in str(result.exception)


def test_review_local_falls_back_to_real_gateways(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    review_path = tmp_path / "dignified-python.md"
    review_path.write_text(_review_source(), encoding="utf-8")

    def fake_git_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse", "--show-toplevel"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=str(tmp_path), stderr="")
        if cmd[:3] == ["git", "diff", "--no-ext-diff"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout="diff --git a/app.py b/app.py\n+print('hello')\n",
                stderr="",
            )
        raise AssertionError(f"unexpected git command: {cmd!r}")

    def fake_executor_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == ["fake-reviewer"]
        payload = json.loads(str(kwargs["input"]))
        assert payload["model"] == "gpt-5-mini"
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout=json.dumps(
                {
                    "findings": [
                        {
                            "path": "app.py",
                            "line": 1,
                            "severity": "warning",
                            "summary": "Avoid print in library code",
                            "details": "Use click.echo() instead.",
                        }
                    ]
                }
            ),
            stderr="",
        )

    monkeypatch.setattr(local_diff_real, "_run_git", fake_git_run)
    monkeypatch.setattr(review_execution_real.subprocess, "run", fake_executor_run)

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "review-local",
            str(review_path),
            "--base-ref",
            "master",
            "--model",
            "gpt-5-mini",
            "--executor-command",
            "fake-reviewer",
        ],
    )

    assert result.exit_code == 0, result.output
    assert "Avoid print in library code" in result.output
