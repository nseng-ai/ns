from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable
from io import StringIO
from typing import Any

import pytest

from asdl_core.clinkr.non_ideal_state import error_type_for
from roaster.harness import invocation as harness_invocation
from roaster.harness.invocation import HarnessReviewRequest, HarnessRuntime
from roaster.models import (
    DiffReviewTarget,
    FindingsReview,
    LocalDiff,
    ReviewDefinition,
    ReviewExecutionResponse,
    ReviewFinding,
    RoasterFailure,
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


_DEFAULT_USAGE_PAYLOAD: dict[str, object] = {
    "input_tokens": 100,
    "output_tokens": 50,
    "cache_creation_input_tokens": 10,
    "cache_read_input_tokens": 5,
}


def _request(*, model: str = "sonnet") -> HarnessReviewRequest:
    return HarnessReviewRequest(
        model=model,
        review_definition=ReviewDefinition(
            name="Dignified Python",
            description="Review Python diffs.",
            instructions="Flag concrete issues in the diff.",
            default_model="sonnet",
        ),
        target=DiffReviewTarget(
            local_diff=LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
                changed_paths=("app.py",),
            ),
        ),
    )


def _assert_no_json_refs(value: object) -> None:
    if isinstance(value, dict):
        assert "$defs" not in value
        assert "$ref" not in value
        for item in value.values():
            _assert_no_json_refs(item)
    elif isinstance(value, list):
        for item in value:
            _assert_no_json_refs(item)


def _json_result(
    *,
    structured_output: object | None = None,
    result_text: str = "Findings produced.",
    include_structured_output: bool = True,
    include_usage: bool = True,
    include_total_cost: bool = True,
) -> list[str]:
    result_event: dict[str, object] = {
        "type": "result",
        "result": result_text,
        "num_turns": 1,
        "duration_ms": 1234,
    }
    if include_total_cost:
        result_event["total_cost_usd"] = 0.0123
    if include_usage:
        result_event["usage"] = dict(_DEFAULT_USAGE_PAYLOAD)
    if include_structured_output:
        if structured_output is None:
            structured_output = {"findings": []}
        result_event["structured_output"] = structured_output
    return [json.dumps(result_event) + "\n"]


def _run_with_process(
    monkeypatch: pytest.MonkeyPatch,
    *,
    request: HarnessReviewRequest | None = None,
    stdout_lines: Iterable[str] | None = None,
    stderr_text: str = "",
    returncode: int = 0,
    progress_messages: list[str] | None = None,
) -> tuple[ReviewExecutionResponse | RoasterFailure, dict[str, Any], _FakePopen]:
    captured: dict[str, Any] = {}
    fake_process: dict[str, _FakePopen] = {}
    effective_request = request or _request()
    effective_stdout_lines = stdout_lines or _json_result()

    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        captured["cmd"] = cmd
        captured["kwargs"] = kwargs
        process = _FakePopen(
            stdout_lines=effective_stdout_lines,
            stderr_text=stderr_text,
            returncode=returncode,
        )
        fake_process["value"] = process
        return process

    monkeypatch.setattr(harness_invocation.subprocess, "Popen", fake_popen)
    writer = (
        progress_messages.append
        if progress_messages is not None
        else harness_invocation.silent_progress
    )
    runtime = HarnessRuntime(
        progress_writer=writer,
        binary_locator=lambda binary: "/usr/local/bin/claude" if binary == "claude" else None,
    )

    result = runtime.run_review(effective_request)
    return result, captured, fake_process["value"]


def test_findings_mode_builds_claude_argv(monkeypatch: pytest.MonkeyPatch) -> None:
    result, captured, process = _run_with_process(monkeypatch)

    assert isinstance(result, ReviewExecutionResponse)
    cmd = captured["cmd"]
    assert cmd[0] == "claude"
    assert "-p" in cmd
    assert cmd[cmd.index("--output-format") + 1] == "json"
    assert "--verbose" not in cmd
    assert "--bare" in cmd
    assert cmd[cmd.index("--model") + 1] == "sonnet"
    system_prompt = cmd[cmd.index("--system-prompt") + 1]
    assert "StructuredOutput" in system_prompt
    assert "--append-system-prompt" not in cmd
    tools_value = cmd[cmd.index("--tools") + 1]
    assert tools_value == "Bash,Read"
    assert "Edit" not in tools_value
    assert "Write" not in tools_value
    schema_text = cmd[cmd.index("--json-schema") + 1]
    schema = json.loads(schema_text)
    _assert_no_json_refs(schema)
    finding_schema = schema["properties"]["findings"]["items"]
    required = finding_schema["required"]
    assert set(required) == {"path", "line", "severity", "summary", "details"}
    assert "location" not in finding_schema["properties"]
    assert captured["kwargs"]["stdin"] is subprocess.PIPE
    assert "Reviewer name: Dignified Python" in process.stdin.buffer
    assert "Unified diff:" in process.stdin.buffer
    assert process.stdin.closed


def test_prompt_fences_are_collision_safe_for_nested_diff_fences(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    diff = "diff --git a/app.py b/app.py\n+```python\n+print('hello')\n+```\n"
    request = HarnessReviewRequest(
        model="sonnet",
        review_definition=ReviewDefinition(
            name="Dignified Python",
            description="Review Python diffs.",
            instructions="Flag concrete issues in the diff.",
            default_model="sonnet",
        ),
        target=DiffReviewTarget(
            local_diff=LocalDiff(base_ref="main", diff_text=diff, changed_paths=("app.py",)),
        ),
    )

    result, _captured, process = _run_with_process(monkeypatch, request=request)

    assert isinstance(result, ReviewExecutionResponse)
    assert "````diff\ndiff --git" in process.stdin.buffer


def test_prompt_is_written_to_stdin_not_argv(monkeypatch: pytest.MonkeyPatch) -> None:
    large_diff = "x" * (200 * 1024)
    request = HarnessReviewRequest(
        model="sonnet",
        review_definition=_request().review_definition,
        target=DiffReviewTarget(local_diff=LocalDiff(base_ref="main", diff_text=large_diff)),
    )

    result, captured, process = _run_with_process(monkeypatch, request=request)

    assert isinstance(result, ReviewExecutionResponse)
    assert all(large_diff not in arg for arg in captured["cmd"])
    assert large_diff in process.stdin.buffer


def test_tools_flag_is_followed_by_another_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    _result, captured, _process = _run_with_process(monkeypatch)

    cmd = captured["cmd"]
    tools_index = cmd.index("--tools")
    next_token = cmd[tools_index + 2]
    assert next_token.startswith("-"), (
        f"Token after --tools <value> must start with `-` to terminate the variadic. "
        f"Got {next_token!r}."
    )


@pytest.mark.parametrize(
    "model",
    ["sonnet", "opus", "haiku", "claude-sonnet-4-6", "claude-opus-4-7"],
)
def test_supported_models_execute(monkeypatch: pytest.MonkeyPatch, model: str) -> None:
    result, _captured, _process = _run_with_process(monkeypatch, request=_request(model=model))

    assert isinstance(result, ReviewExecutionResponse)


@pytest.mark.parametrize("model", ["gpt-5-mini", "gemini-pro", "llama-3"])
def test_unsupported_model_returns_failure(model: str) -> None:
    runtime = HarnessRuntime(binary_locator=lambda _binary: "/usr/local/bin/claude")

    result = runtime.run_review(_request(model=model))

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "model_not_supported_by_harness"


def test_missing_binary_returns_failure() -> None:
    runtime = HarnessRuntime(binary_locator=lambda _binary: None)

    result = runtime.run_review(_request())

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "harness_binary_missing"


def test_invocation_os_error_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        raise OSError("permission denied")

    monkeypatch.setattr(harness_invocation.subprocess, "Popen", fake_popen)
    runtime = HarnessRuntime(binary_locator=lambda _binary: "/usr/local/bin/claude")

    result = runtime.run_review(_request())

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "harness_invocation_failed"
    assert "permission denied" in result.message


def test_non_zero_exit_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stderr_text="nope",
        returncode=2,
    )

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "harness_execution_failed"
    assert result.message == "nope"


def test_parses_structured_findings_and_usage(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_json_result(
            structured_output={
                "findings": [
                    {
                        "path": "app.py",
                        "line": 1,
                        "severity": "warning",
                        "summary": "Avoid print",
                        "details": "Use click.echo().",
                    }
                ]
            }
        ),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, FindingsReview)
    finding = result.payload.findings[0]
    assert finding == ReviewFinding.diff_line(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print",
        details="Use click.echo().",
    )
    assert result.usage is not None
    assert result.usage.total_input_tokens == 115


def test_invalid_json_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(monkeypatch, stdout_lines=["not json"])

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "claude_code_invalid_json"


def test_missing_structured_output_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_json_result(include_structured_output=False, result_text="plain text"),
    )

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "claude_code_invalid_response"
    assert "plain text" in result.message


def test_invalid_findings_schema_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_json_result(structured_output={"findings": [{"path": "app.py"}]}),
    )

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "claude_code_invalid_findings"
