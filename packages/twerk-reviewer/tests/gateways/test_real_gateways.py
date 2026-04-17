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
from twerk_reviewer.harness_adapter import HarnessAdapter
from twerk_reviewer.models import ReviewerFailure, ReviewExecutionRequest, ReviewExecutionResponse


def _sample_request(
    *,
    model: str = "sonnet",
    adapter_name: str = "claude-code",
) -> ReviewExecutionRequest:
    return ReviewExecutionRequest(
        adapter_name=adapter_name,
        model=model,
        prompt="review this diff",
        review_name="Dignified Python",
        review_description="Review Python diffs for style violations.",
        review_instructions="Flag concrete issues in the diff.",
        base_ref="master",
        diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
    )


def test_real_review_definition_gateway_reads_file(tmp_path: Path) -> None:
    path = tmp_path / "dignified-python.md"
    path.write_text("# Dignified Python", encoding="utf-8")

    assert RealReviewDefinitionGateway().load_source(path) == "# Dignified Python"


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


def test_real_review_execution_gateway_runs_claude_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inner = {
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
    outer = json.dumps({"result": json.dumps(inner)})

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd[0] == "claude"
        assert "--model" in cmd
        assert cmd[-1] == "review this diff"
        return subprocess.CompletedProcess(cmd, 0, stdout=outer, stderr="")

    monkeypatch.setattr(review_execution_real.subprocess, "run", fake_run)

    result = RealReviewExecutionGateway().run_review(_sample_request())

    assert isinstance(result, ReviewExecutionResponse)
    assert result.findings[0].path == "app.py"


def test_real_review_execution_gateway_rejects_unknown_harness() -> None:
    gateway = RealReviewExecutionGateway()

    result = gateway.run_review(_sample_request(adapter_name="banana"))

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_unknown"


def test_real_review_execution_gateway_rejects_unsupported_model() -> None:
    result = RealReviewExecutionGateway().run_review(_sample_request(model="gpt-5-mini"))

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "model_not_supported_by_harness"


def test_real_review_execution_gateway_reports_missing_binary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError("claude: no such file")

    monkeypatch.setattr(review_execution_real.subprocess, "run", fake_run)

    result = RealReviewExecutionGateway().run_review(_sample_request())

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_binary_missing"


def test_real_review_execution_gateway_reports_non_zero_exit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="model unavailable")

    monkeypatch.setattr(review_execution_real.subprocess, "run", fake_run)

    result = RealReviewExecutionGateway().run_review(_sample_request())

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_execution_failed"
    assert "model unavailable" in result.message


def test_real_review_execution_gateway_uses_injected_registry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_args: list[tuple[str, str]] = []

    def fake_build_argv(model: str, prompt: str) -> list[str]:
        captured_args.append((model, prompt))
        return ["echo", "ok"]

    def fake_parse(stdout: str) -> ReviewExecutionResponse | ReviewerFailure:
        return ReviewExecutionResponse(findings=())

    adapter = HarnessAdapter(
        name="noop",
        binary="echo",
        build_argv=fake_build_argv,
        parse_stdout=fake_parse,
        supports_model=lambda _: True,
    )

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(review_execution_real.subprocess, "run", fake_run)

    gateway = RealReviewExecutionGateway(adapters={"noop": adapter})
    result = gateway.run_review(_sample_request(adapter_name="noop", model="anything"))

    assert isinstance(result, ReviewExecutionResponse)
    assert captured_args == [("anything", "review this diff")]
