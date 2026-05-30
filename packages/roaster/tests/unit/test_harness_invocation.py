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
    FindingsReview,
    LocalDiff,
    ProseReview,
    ReviewDefinition,
    ReviewerFailure,
    ReviewExecutionResponse,
    ReviewFormat,
    ReviewUsage,
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


def _request(
    *,
    harness_name: str = "claude-code",
    model: str = "sonnet",
    review_format: ReviewFormat = "findings",
    review_definition: ReviewDefinition | None = None,
    local_diff: LocalDiff | None = None,
) -> HarnessReviewRequest:
    return HarnessReviewRequest(
        harness_name=harness_name,
        model=model,
        review_definition=review_definition
        or ReviewDefinition(
            name="Dignified Python",
            description="Review Python diffs.",
            instructions="Flag concrete issues in the diff.",
            default_model="sonnet",
        ),
        local_diff=local_diff
        or LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        ),
        review_format=review_format,
    )


def _stream_lines(
    *,
    model: str = "sonnet",
    structured_output: object | None = None,
    result_text: str = "Findings produced.",
    include_result: bool = True,
    include_structured_output: bool = True,
    include_usage: bool = True,
    include_total_cost: bool = True,
) -> list[str]:
    events: list[dict[str, object]] = [
        {"type": "system", "subtype": "init", "model": model},
        {
            "type": "assistant",
            "message": {"role": "assistant", "content": [{"type": "text", "text": result_text}]},
        },
    ]
    if include_result:
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
        events.append(result_event)
    return [json.dumps(event) + "\n" for event in events]


def _run_with_process(
    monkeypatch: pytest.MonkeyPatch,
    *,
    request: HarnessReviewRequest | None = None,
    stdout_lines: Iterable[str] | None = None,
    stderr_text: str = "",
    returncode: int = 0,
    progress_messages: list[str] | None = None,
) -> tuple[ReviewExecutionResponse | ReviewerFailure, dict[str, Any], _FakePopen]:
    captured: dict[str, Any] = {}
    fake_process: dict[str, _FakePopen] = {}

    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        captured["cmd"] = cmd
        captured["kwargs"] = kwargs
        process = _FakePopen(
            stdout_lines=stdout_lines or _stream_lines(),
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

    result = runtime.run_review(request or _request())
    return result, captured, fake_process["value"]


def test_known_harness_list_contains_claude_code() -> None:
    runtime = HarnessRuntime(binary_locator=lambda _binary: "/usr/local/bin/claude")

    detections = runtime.list_harnesses()

    assert len(detections) == 1
    detection = detections[0]
    assert detection.name == "claude-code"
    assert detection.binary == "claude"
    assert detection.path == "/usr/local/bin/claude"
    assert detection.available is True


def test_list_harnesses_reports_unavailable_binary() -> None:
    detections = HarnessRuntime(binary_locator=lambda _binary: None).list_harnesses()

    assert len(detections) == 1
    detection = detections[0]
    assert detection.name == "claude-code"
    assert detection.binary == "claude"
    assert detection.path is None
    assert detection.available is False


def test_findings_mode_builds_claude_argv(monkeypatch: pytest.MonkeyPatch) -> None:
    result, captured, process = _run_with_process(monkeypatch)

    assert isinstance(result, ReviewExecutionResponse)
    cmd = captured["cmd"]
    assert cmd[0] == "claude"
    assert "-p" in cmd
    assert cmd[cmd.index("--output-format") + 1] == "stream-json"
    assert "--verbose" in cmd
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
    required = schema["properties"]["findings"]["items"]["required"]
    assert set(required) == {"path", "line", "severity", "summary", "details"}
    severity_enum = schema["properties"]["findings"]["items"]["properties"]["severity"]["enum"]
    assert set(severity_enum) == {"info", "warning", "error"}
    assert captured["kwargs"]["stdin"] is subprocess.PIPE
    assert "Reviewer name: Dignified Python" in process.stdin.buffer
    assert process.stdin.closed


def test_text_mode_omits_json_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    result, captured, process = _run_with_process(
        monkeypatch,
        request=_request(review_format="text"),
        stdout_lines=_stream_lines(result_text="markdown body", include_structured_output=False),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, ProseReview)
    assert result.payload.prose == "markdown body"
    cmd = captured["cmd"]
    assert "--json-schema" not in cmd
    system_prompt = cmd[cmd.index("--system-prompt") + 1]
    assert "markdown review" in system_prompt
    assert "Do not emit JSON" in system_prompt
    assert "Reviewer name: Dignified Python" in process.stdin.buffer


@pytest.mark.parametrize("review_format", ["findings", "text"])
def test_prompt_is_written_to_stdin_not_argv(
    monkeypatch: pytest.MonkeyPatch,
    review_format: ReviewFormat,
) -> None:
    large_diff = "x" * (200 * 1024)
    request = _request(
        review_format=review_format,
        local_diff=LocalDiff(base_ref="main", diff_text=large_diff),
    )
    stdout_lines = _stream_lines()
    if review_format == "text":
        stdout_lines = _stream_lines(result_text="markdown body", include_structured_output=False)

    result, captured, process = _run_with_process(
        monkeypatch,
        request=request,
        stdout_lines=stdout_lines,
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert all(large_diff not in arg for arg in captured["cmd"])
    assert large_diff in process.stdin.buffer


@pytest.mark.parametrize("review_format", ["findings", "text"])
def test_tools_flag_is_followed_by_another_flag(
    monkeypatch: pytest.MonkeyPatch,
    review_format: ReviewFormat,
) -> None:
    stdout_lines = _stream_lines()
    if review_format == "text":
        stdout_lines = _stream_lines(result_text="markdown body", include_structured_output=False)

    _result, captured, _process = _run_with_process(
        monkeypatch,
        request=_request(review_format=review_format),
        stdout_lines=stdout_lines,
    )

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

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "model_not_supported_by_harness"


def test_unknown_harness_returns_failure() -> None:
    runtime = HarnessRuntime(binary_locator=lambda _binary: "/usr/local/bin/claude")

    result = runtime.run_review(_request(harness_name="banana"))

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "harness_unknown"
    assert "claude-code" in result.message


def test_missing_binary_returns_failure() -> None:
    runtime = HarnessRuntime(binary_locator=lambda _binary: None)

    result = runtime.run_review(_request())

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "harness_binary_missing"


def test_invocation_os_error_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_popen(cmd: list[str], **kwargs: object) -> _FakePopen:
        raise OSError("permission denied")

    monkeypatch.setattr(harness_invocation.subprocess, "Popen", fake_popen)
    runtime = HarnessRuntime(binary_locator=lambda _binary: "/usr/local/bin/claude")

    result = runtime.run_review(_request())

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "harness_invocation_failed"
    assert "permission denied" in result.message


def test_non_zero_exit_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stderr_text="model unavailable\n",
        returncode=1,
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "harness_execution_failed"
    assert "model unavailable" in result.message


def test_progress_events_emit_session_assistant_and_result_messages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    progress_messages: list[str] = []

    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_stream_lines(result_text="hello world"),
        progress_messages=progress_messages,
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert "session started (model=sonnet)" in progress_messages
    assert "assistant turn received (11 chars)" in progress_messages
    assert "result received (1 turn, 1.2s)" in progress_messages


def test_parse_stdout_parses_structured_findings(monkeypatch: pytest.MonkeyPatch) -> None:
    structured = {
        "findings": [
            {
                "path": "app.py",
                "line": 12,
                "severity": "warning",
                "summary": "Avoid print in library code",
                "details": "Use click.echo() instead.",
            }
        ]
    }

    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_stream_lines(structured_output=structured),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, FindingsReview)
    assert len(result.payload.findings) == 1
    assert result.payload.findings[0].path == "app.py"
    assert result.payload.findings[0].summary == "Avoid print in library code"
    assert isinstance(result.usage, ReviewUsage)
    assert result.usage.input_tokens == 100
    assert result.usage.output_tokens == 50
    assert result.usage.cache_creation_input_tokens == 10
    assert result.usage.cache_read_input_tokens == 5
    assert result.usage.total_cost_usd == pytest.approx(0.0123)
    assert result.usage.duration_ms == 1234
    assert result.usage.num_turns == 1
    assert result.usage.total_input_tokens == 115


def test_parse_stdout_handles_empty_findings(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_stream_lines(structured_output={"findings": []}),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, FindingsReview)
    assert result.payload.findings == ()


def test_parse_stdout_returns_prose_for_text_format(monkeypatch: pytest.MonkeyPatch) -> None:
    prose = "### Findings\n\n- app.py line 1: prefer click.echo over print."

    result, _captured, _process = _run_with_process(
        monkeypatch,
        request=_request(review_format="text"),
        stdout_lines=_stream_lines(result_text=prose, include_structured_output=False),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, ProseReview)
    assert result.payload.prose == prose
    assert isinstance(result.usage, ReviewUsage)
    assert result.usage.output_tokens == 50


def test_parse_stdout_text_format_ignores_structured_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        request=_request(review_format="text"),
        stdout_lines=_stream_lines(
            result_text="plain markdown body",
            structured_output={"findings": []},
        ),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, ProseReview)
    assert result.payload.prose == "plain markdown body"


def test_parse_stdout_fails_on_empty_output(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(monkeypatch, stdout_lines=["   \n"])

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "claude_code_empty_output"


def test_parse_stdout_fails_on_non_json_line(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(monkeypatch, stdout_lines=["not json at all\n"])

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "claude_code_invalid_json"


def test_parse_stdout_fails_on_missing_result_event(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_stream_lines(include_result=False),
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "claude_code_missing_result_event"


def test_parse_stdout_fails_when_structured_output_missing_in_findings_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prose = "I thought about it and here is a prose answer."

    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_stream_lines(result_text=prose, include_structured_output=False),
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "claude_code_non_json_result"
    assert "Model response:" in result.message
    assert prose in result.message


def test_parse_stdout_truncates_long_prose_in_error(monkeypatch: pytest.MonkeyPatch) -> None:
    prose = "ALPHA-" + "x" * 2000

    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_stream_lines(result_text=prose, include_structured_output=False),
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "claude_code_non_json_result"
    assert "ALPHA-" in result.message
    assert "…" in result.message
    assert prose not in result.message


def test_parse_stdout_fails_on_missing_findings_key(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_stream_lines(structured_output={"something_else": []}),
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "claude_code_invalid_findings"


def test_parse_stdout_fails_on_malformed_finding(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_stream_lines(structured_output={"findings": [{"path": "app.py"}]}),
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "claude_code_invalid_findings"


def test_parse_stdout_usage_is_none_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    result, _captured, _process = _run_with_process(
        monkeypatch,
        stdout_lines=_stream_lines(
            structured_output={"findings": []},
            include_usage=False,
            include_total_cost=False,
        ),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert result.usage is None


def test_prompt_assembly_includes_review_context_without_output_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = _request(
        review_definition=ReviewDefinition(
            name="Security Review",
            description="Review auth-sensitive diffs.",
            instructions="Flag auth regressions.",
            default_model="sonnet",
        ),
        local_diff=LocalDiff(
            base_ref="main",
            diff_text="diff --git a/auth.py b/auth.py\n+allow_all = True\n",
        ),
    )

    result, _captured, process = _run_with_process(monkeypatch, request=request)

    assert isinstance(result, ReviewExecutionResponse)
    stdin = process.stdin.buffer
    assert "Reviewer name: Security Review" in stdin
    assert "Reviewer description: Review auth-sensitive diffs." in stdin
    assert "Flag auth regressions." in stdin
    assert "Base ref: main" in stdin
    assert "+allow_all = True" in stdin
    assert "StructuredOutput" not in stdin
    assert "JSON" not in stdin
