from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from twerk_reviewer.gateways.local_diff import real as local_diff_real
from twerk_reviewer.gateways.local_diff.real import RealLocalDiffGateway
from twerk_reviewer.gateways.review_definition.real import RealReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution import real as review_execution_real
from twerk_reviewer.gateways.review_execution.real import RealReviewExecutionGateway
from twerk_reviewer.models import (
    ReviewExecutionInvalidJson,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
)


def test_real_review_definition_gateway_reads_file(tmp_path: Path) -> None:
    path = tmp_path / "dignified-python.md"
    path.write_text("# Dignified Python", encoding="utf-8")

    result = RealReviewDefinitionGateway().load_source(path)

    assert result == "# Dignified Python"


def test_real_local_diff_gateway_runs_git_diff(monkeypatch: pytest.MonkeyPatch) -> None:
    cwd = Path("/repo")

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert kwargs["cwd"] == cwd
        if cmd[:3] == ["git", "rev-parse", "--show-toplevel"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="/repo\n", stderr="")
        if cmd[:3] == ["git", "diff", "--no-ext-diff"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout="diff --git a/app.py b/app.py\n+print('hello')\n",
                stderr="",
            )
        raise AssertionError(f"unexpected command: {cmd!r}")

    monkeypatch.setattr(local_diff_real.subprocess, "run", fake_run)

    result = RealLocalDiffGateway(cwd=cwd).load_diff(base_ref="master")

    assert result.base_ref == "master"
    assert "diff --git a/app.py b/app.py" in result.diff_text


def test_real_review_execution_gateway_parses_success_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == ["fake-reviewer"]
        payload = json.loads(str(kwargs["input"]))
        assert payload["model"] == "gpt-5-mini"
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout=json.dumps(
                {
                    "success": True,
                    "findings": [
                        {
                            "path": "app.py",
                            "line": 1,
                            "severity": "warning",
                            "summary": "Avoid print in library code",
                            "details": "Use click.echo() instead.",
                        }
                    ],
                }
            ),
            stderr="",
        )

    monkeypatch.setattr(review_execution_real.subprocess, "run", fake_run)

    result = RealReviewExecutionGateway().run_review(
        ReviewExecutionRequest(
            executor_command="fake-reviewer",
            model="gpt-5-mini",
            prompt="review this diff",
            review_name="Dignified Python",
            review_description="Review Python diffs for style violations.",
            review_instructions="Flag concrete issues in the diff.",
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        )
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert result.findings[0].path == "app.py"


def test_real_review_execution_gateway_reports_invalid_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout="not json", stderr="")

    monkeypatch.setattr(review_execution_real.subprocess, "run", fake_run)

    result = RealReviewExecutionGateway().run_review(
        ReviewExecutionRequest(
            executor_command="fake-reviewer",
            model="gpt-5-mini",
            prompt="review this diff",
            review_name="Dignified Python",
            review_description="Review Python diffs for style violations.",
            review_instructions="Flag concrete issues in the diff.",
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        )
    )

    assert isinstance(result, ReviewExecutionInvalidJson)
    assert result.ERROR_TYPE == "review_execution_invalid_json"
