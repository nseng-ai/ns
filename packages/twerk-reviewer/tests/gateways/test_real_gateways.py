from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable
from io import StringIO
from pathlib import Path
from typing import Any

import pytest

from twerk_reviewer.gateways.local_diff import real as local_diff_real
from twerk_reviewer.gateways.local_diff.real import RealLocalDiffGateway
from twerk_reviewer.gateways.review_definition.real import RealReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution import real as review_execution_real
from twerk_reviewer.gateways.review_execution.real import RealReviewExecutionGateway
from twerk_reviewer.harness_adapter import HarnessAdapter
from twerk_reviewer.models import (
    FindingsReview,
    ProseReview,
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewFormat,
)


def _sample_request(
    *,
    model: str = "sonnet",
    adapter_name: str = "claude-code",
    review_format: ReviewFormat = "findings",
    system_prompt: str = "SYSTEM PROMPT",
) -> ReviewExecutionRequest:
    return ReviewExecutionRequest(
        adapter_name=adapter_name,
        model=model,
        prompt="review this diff",
        system_prompt=system_prompt,
        review_format=review_format,
        review_name="Dignified Python",
        review_description="Review Python diffs for style violations.",
        review_instructions="Flag concrete issues in the diff.",
        base_ref="master",
        diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
    )


class _CapturingStdin:
    """Stand-in for ``Popen.stdin`` that records writes and survives close."""

    def __init__(self) -> None:
        self.buffer = ""
        self.closed = False

    def write(self, data: str) -> int:
        self.buffer += data
        return len(data)

    def close(self) -> None:
        self.closed = True


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
        self.stdin = _CapturingStdin()
        self.returncode = returncode

    def wait(self) -> int:
        return self.returncode


def _stream_json_lines(
    *,
    model: str = "sonnet",
    structured_output: object | None = None,
    result_text: str = "Findings produced.",
    include_structured_output: bool = True,
) -> list[str]:
    result_event: dict[str, object] = {
        "type": "result",
        "result": result_text,
        "num_turns": 1,
        "duration_ms": 1234,
    }
    if include_structured_output:
        if structured_output is None:
            structured_output = {"findings": []}
        result_event["structured_output"] = structured_output
    events = [
        {"type": "system", "subtype": "init", "model": model},
        {
            "type": "assistant",
            "message": {"role": "assistant", "content": [{"type": "text", "text": result_text}]},
        },
        result_event,
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


def test_real_review_execution_gateway_runs_claude_code_findings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structured = {
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
    stdout_lines = _stream_json_lines(structured_output=structured)
    progress_messages: list[str] = []
    captured: dict[str, Any] = {}
    fake_process: dict[str, _FakePopen] = {}

    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        captured["cmd"] = cmd
        captured["kwargs"] = kwargs
        assert cmd[0] == "claude"
        assert "--model" in cmd
        assert "review this diff" not in cmd
        process = _FakePopen(stdout_lines=stdout_lines)
        fake_process["value"] = process
        return process

    monkeypatch.setattr(review_execution_real.subprocess, "Popen", fake_popen)

    gateway = RealReviewExecutionGateway(progress_writer=progress_messages.append)
    result = gateway.run_review(_sample_request(system_prompt="OUR SYSTEM PROMPT"))

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, FindingsReview)
    assert result.payload.findings[0].path == "app.py"
    assert any("session started" in msg for msg in progress_messages)
    assert any("result received" in msg for msg in progress_messages)

    cmd = captured["cmd"]
    assert "--system-prompt" in cmd
    assert cmd[cmd.index("--system-prompt") + 1] == "OUR SYSTEM PROMPT"
    assert "--append-system-prompt" not in cmd
    assert "--json-schema" in cmd
    assert captured["kwargs"]["stdin"] is subprocess.PIPE
    assert fake_process["value"].stdin.buffer == "review this diff"
    assert fake_process["value"].stdin.closed


def test_real_review_execution_gateway_text_format_returns_prose(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prose = "### Review\n\n- app.py:1 — prefer click.echo"
    stdout_lines = _stream_json_lines(result_text=prose, include_structured_output=False)
    captured: dict[str, Any] = {}
    fake_process: dict[str, _FakePopen] = {}

    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        captured["cmd"] = cmd
        captured["kwargs"] = kwargs
        process = _FakePopen(stdout_lines=stdout_lines)
        fake_process["value"] = process
        return process

    monkeypatch.setattr(review_execution_real.subprocess, "Popen", fake_popen)

    gateway = RealReviewExecutionGateway()
    result = gateway.run_review(_sample_request(review_format="text"))

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, ProseReview)
    assert result.payload.prose == prose
    assert "--json-schema" not in captured["cmd"]
    assert "review this diff" not in captured["cmd"]
    assert captured["kwargs"]["stdin"] is subprocess.PIPE
    assert fake_process["value"].stdin.buffer == "review this diff"


def test_real_review_execution_gateway_handles_large_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: a 200KB prompt would have exceeded ARG_MAX on macOS when
    inlined into argv. With the prompt on stdin, it must round-trip cleanly
    even when the OS pipe buffer (~64KB) cannot absorb it in a single write.
    """
    large_prompt = "x" * (200 * 1024)
    stdout_lines = _stream_json_lines()
    fake_process: dict[str, _FakePopen] = {}

    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        assert large_prompt not in cmd
        process = _FakePopen(stdout_lines=stdout_lines)
        fake_process["value"] = process
        return process

    monkeypatch.setattr(review_execution_real.subprocess, "Popen", fake_popen)

    request = _sample_request()
    request_with_large_prompt = ReviewExecutionRequest(
        adapter_name=request.adapter_name,
        model=request.model,
        prompt=large_prompt,
        system_prompt=request.system_prompt,
        review_format=request.review_format,
        review_name=request.review_name,
        review_description=request.review_description,
        review_instructions=request.review_instructions,
        base_ref=request.base_ref,
        diff_text=request.diff_text,
    )
    result = RealReviewExecutionGateway().run_review(request_with_large_prompt)

    assert isinstance(result, ReviewExecutionResponse)
    assert fake_process["value"].stdin.buffer == large_prompt
    assert fake_process["value"].stdin.closed


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
    captured_requests: list[ReviewExecutionRequest] = []

    def fake_build_argv(request: ReviewExecutionRequest) -> list[str]:
        captured_requests.append(request)
        return ["echo", "ok"]

    def fake_parse(
        request: ReviewExecutionRequest, stdout: str
    ) -> ReviewExecutionResponse | ReviewerFailure:
        return ReviewExecutionResponse(payload=FindingsReview(findings=()))

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
    assert len(captured_requests) == 1
    assert captured_requests[0].model == "anything"
    assert captured_requests[0].prompt == "review this diff"
