from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable
from io import StringIO
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


class _FakePopen:
    def __init__(
        self,
        *,
        stdout_lines: Iterable[str],
        stderr_text: str = "",
        returncode: int = 0,
    ) -> None:
        self.stdout = iter(list(stdout_lines))
        self.stderr = StringIO(stderr_text)
        self.returncode = returncode

    def wait(self) -> int:
        return self.returncode


def _stream_json_lines(
    *,
    model: str = "sonnet",
    inner_findings: dict[str, object] | None = None,
    result_override: str | None = None,
) -> list[str]:
    if inner_findings is None:
        inner_findings = {"findings": []}
    result_text = result_override if result_override is not None else json.dumps(inner_findings)
    events = [
        {"type": "system", "subtype": "init", "model": model},
        {
            "type": "assistant",
            "message": {"role": "assistant", "content": [{"type": "text", "text": result_text}]},
        },
        {"type": "result", "result": result_text, "num_turns": 1, "duration_ms": 1234},
    ]
    return [json.dumps(event) + "\n" for event in events]


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
    stdout_lines = _stream_json_lines(inner_findings=inner)
    progress_messages: list[str] = []

    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        assert cmd[0] == "claude"
        assert "--model" in cmd
        assert cmd[-1] == "review this diff"
        return _FakePopen(stdout_lines=stdout_lines)

    monkeypatch.setattr(review_execution_real.subprocess, "Popen", fake_popen)

    gateway = RealReviewExecutionGateway(progress_writer=progress_messages.append)
    result = gateway.run_review(_sample_request())

    assert isinstance(result, ReviewExecutionResponse)
    assert result.findings[0].path == "app.py"
    assert any("session started" in msg for msg in progress_messages)
    assert any("result received" in msg for msg in progress_messages)


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
    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        raise FileNotFoundError("claude: no such file")

    monkeypatch.setattr(review_execution_real.subprocess, "Popen", fake_popen)

    result = RealReviewExecutionGateway().run_review(_sample_request())

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_binary_missing"


def test_real_review_execution_gateway_reports_non_zero_exit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        return _FakePopen(stdout_lines=[], stderr_text="model unavailable\n", returncode=1)

    monkeypatch.setattr(review_execution_real.subprocess, "Popen", fake_popen)

    result = RealReviewExecutionGateway().run_review(_sample_request())

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_execution_failed"
    assert "model unavailable" in result.message


def test_real_review_execution_gateway_surfaces_missing_result_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    truncated_stream = [
        json.dumps({"type": "system", "subtype": "init", "model": "sonnet"}) + "\n",
        json.dumps({"type": "assistant", "message": {"content": [{"text": "hi"}]}}) + "\n",
    ]

    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        return _FakePopen(stdout_lines=truncated_stream)

    monkeypatch.setattr(review_execution_real.subprocess, "Popen", fake_popen)

    result = RealReviewExecutionGateway().run_review(_sample_request())

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_missing_result_event"


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

    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        return _FakePopen(stdout_lines=[])

    monkeypatch.setattr(review_execution_real.subprocess, "Popen", fake_popen)

    gateway = RealReviewExecutionGateway(adapters={"noop": adapter})
    result = gateway.run_review(_sample_request(adapter_name="noop", model="anything"))

    assert isinstance(result, ReviewExecutionResponse)
    assert captured_args == [("anything", "review this diff")]
