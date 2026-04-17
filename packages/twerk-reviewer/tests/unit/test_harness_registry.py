from __future__ import annotations

import json

import pytest

from twerk_reviewer.harness_registry import (
    CLAUDE_CODE_ADAPTER,
    CLAUDE_CODE_NAME,
    HARNESS_ADAPTERS,
    resolve_adapter,
)
from twerk_reviewer.models import ReviewerFailure, ReviewExecutionResponse


def _stream_lines(
    *,
    model: str = "sonnet",
    inner_findings: dict[str, object] | None = None,
    result_override: str | None = None,
    include_result: bool = True,
) -> str:
    if inner_findings is None:
        inner_findings = {"findings": []}
    result_text = result_override if result_override is not None else json.dumps(inner_findings)
    events: list[dict[str, object]] = [
        {"type": "system", "subtype": "init", "model": model},
        {
            "type": "assistant",
            "message": {"role": "assistant", "content": [{"type": "text", "text": result_text}]},
        },
    ]
    if include_result:
        events.append(
            {"type": "result", "result": result_text, "num_turns": 1, "duration_ms": 1234}
        )
    return "\n".join(json.dumps(event) for event in events) + "\n"


def test_claude_code_adapter_is_registered() -> None:
    assert HARNESS_ADAPTERS[CLAUDE_CODE_NAME] is CLAUDE_CODE_ADAPTER
    assert CLAUDE_CODE_ADAPTER.binary == "claude"


def test_resolve_adapter_returns_registered_adapter() -> None:
    assert resolve_adapter("claude-code") is CLAUDE_CODE_ADAPTER


def test_resolve_adapter_returns_failure_for_unknown_name() -> None:
    result = resolve_adapter("banana")
    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_unknown"
    assert "claude-code" in result.message


def test_harness_registry_is_read_only() -> None:
    with pytest.raises(TypeError):
        HARNESS_ADAPTERS["new"] = CLAUDE_CODE_ADAPTER  # type: ignore[index]


def test_claude_code_build_argv_shape() -> None:
    argv = CLAUDE_CODE_ADAPTER.build_argv("sonnet", "review this diff")

    assert argv[0] == "claude"
    assert "-p" in argv
    assert argv[argv.index("--output-format") + 1] == "stream-json"
    assert "--verbose" in argv
    assert "--bare" in argv
    assert argv[argv.index("--model") + 1] == "sonnet"
    assert argv[-1] == "review this diff"


@pytest.mark.parametrize(
    "model",
    ["sonnet", "opus", "haiku", "claude-sonnet-4-6", "claude-opus-4-7"],
)
def test_claude_code_supports_known_models(model: str) -> None:
    assert CLAUDE_CODE_ADAPTER.supports_model(model) is True


@pytest.mark.parametrize("model", ["gpt-5-mini", "gemini-pro", "llama-3"])
def test_claude_code_rejects_foreign_models(model: str) -> None:
    assert CLAUDE_CODE_ADAPTER.supports_model(model) is False


def test_claude_code_parse_stdout_parses_findings() -> None:
    inner = {
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

    result = CLAUDE_CODE_ADAPTER.parse_stdout(_stream_lines(inner_findings=inner))

    assert isinstance(result, ReviewExecutionResponse)
    assert len(result.findings) == 1
    assert result.findings[0].path == "app.py"
    assert result.findings[0].summary == "Avoid print in library code"


def test_claude_code_parse_stdout_handles_empty_findings() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(_stream_lines(inner_findings={"findings": []}))

    assert isinstance(result, ReviewExecutionResponse)
    assert result.findings == ()


def test_claude_code_parse_stdout_fails_on_empty_output() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout("   ")

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_empty_output"


def test_claude_code_parse_stdout_fails_on_non_json_line() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout("not json at all\n")

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_json"


def test_claude_code_parse_stdout_fails_on_missing_result_event() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(_stream_lines(include_result=False))

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_missing_result_event"


def test_claude_code_parse_stdout_fails_when_result_is_not_json() -> None:
    prose = "I thought about it and here is a prose answer."
    stdout = _stream_lines(result_override=prose)

    result = CLAUDE_CODE_ADAPTER.parse_stdout(stdout)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_non_json_result"
    assert "Model response:" in result.message
    assert "I thought about it and here is a prose answer." in result.message


def test_claude_code_parse_stdout_truncates_long_prose() -> None:
    prose = "ALPHA-" + "x" * 2000
    stdout = _stream_lines(result_override=prose)

    result = CLAUDE_CODE_ADAPTER.parse_stdout(stdout)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_non_json_result"
    assert "ALPHA-" in result.message
    assert "…" in result.message
    # The full 2006-char prose should not appear verbatim.
    assert prose not in result.message


def test_claude_code_parse_stdout_fails_on_missing_findings_key() -> None:
    stdout = _stream_lines(inner_findings={"something_else": []})

    result = CLAUDE_CODE_ADAPTER.parse_stdout(stdout)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_findings"


def test_claude_code_parse_stdout_fails_on_malformed_finding() -> None:
    inner = {"findings": [{"path": "app.py"}]}
    stdout = _stream_lines(inner_findings=inner)

    result = CLAUDE_CODE_ADAPTER.parse_stdout(stdout)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_findings"


def test_describe_event_system_init_includes_model() -> None:
    line = json.dumps({"type": "system", "subtype": "init", "model": "sonnet"})

    assert CLAUDE_CODE_ADAPTER.describe_event(line) == "session started (model=sonnet)"


def test_describe_event_assistant_counts_chars() -> None:
    line = json.dumps(
        {
            "type": "assistant",
            "message": {"content": [{"type": "text", "text": "hello world"}]},
        }
    )

    assert CLAUDE_CODE_ADAPTER.describe_event(line) == "assistant turn received (11 chars)"


def test_describe_event_result_shows_turns_and_duration() -> None:
    line = json.dumps({"type": "result", "result": "{}", "num_turns": 2, "duration_ms": 3500})

    assert CLAUDE_CODE_ADAPTER.describe_event(line) == "result received (2 turns, 3.5s)"


def test_describe_event_unknown_type_returns_none() -> None:
    line = json.dumps({"type": "stream_event", "event": {"type": "message_delta"}})

    assert CLAUDE_CODE_ADAPTER.describe_event(line) is None


def test_describe_event_handles_unparseable_line() -> None:
    assert CLAUDE_CODE_ADAPTER.describe_event("not json at all") is None


def test_describe_event_handles_blank_line() -> None:
    assert CLAUDE_CODE_ADAPTER.describe_event("   \n") is None
