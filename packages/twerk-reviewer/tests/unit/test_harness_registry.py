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
    assert argv[argv.index("--output-format") + 1] == "json"
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
    outer = json.dumps({"result": json.dumps(inner)})

    result = CLAUDE_CODE_ADAPTER.parse_stdout(outer)

    assert isinstance(result, ReviewExecutionResponse)
    assert len(result.findings) == 1
    assert result.findings[0].path == "app.py"
    assert result.findings[0].summary == "Avoid print in library code"


def test_claude_code_parse_stdout_handles_empty_findings() -> None:
    outer = json.dumps({"result": json.dumps({"findings": []})})

    result = CLAUDE_CODE_ADAPTER.parse_stdout(outer)

    assert isinstance(result, ReviewExecutionResponse)
    assert result.findings == ()


def test_claude_code_parse_stdout_fails_on_empty_output() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout("   ")

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_empty_output"


def test_claude_code_parse_stdout_fails_on_non_json_outer() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout("not json at all")

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_json"


def test_claude_code_parse_stdout_fails_on_missing_result_field() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(json.dumps({"nope": "value"}))

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_response"


def test_claude_code_parse_stdout_fails_when_result_is_not_json() -> None:
    outer = json.dumps({"result": "I thought about it and here is prose."})

    result = CLAUDE_CODE_ADAPTER.parse_stdout(outer)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_non_json_result"


def test_claude_code_parse_stdout_fails_on_missing_findings_key() -> None:
    outer = json.dumps({"result": json.dumps({"something_else": []})})

    result = CLAUDE_CODE_ADAPTER.parse_stdout(outer)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_findings"


def test_claude_code_parse_stdout_fails_on_malformed_finding() -> None:
    inner = {"findings": [{"path": "app.py"}]}
    outer = json.dumps({"result": json.dumps(inner)})

    result = CLAUDE_CODE_ADAPTER.parse_stdout(outer)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_findings"
