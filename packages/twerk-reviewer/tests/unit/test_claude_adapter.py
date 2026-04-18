from __future__ import annotations

import json

import pytest

from twerk_reviewer.harness.claude.adapter import (
    CLAUDE_CODE_ADAPTER,
    CLAUDE_CODE_NAME,
    FINDINGS_JSON_SCHEMA,
)
from twerk_reviewer.models import (
    FindingsReview,
    ProseReview,
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewFormat,
    ReviewUsage,
)


def _request(
    *,
    model: str = "sonnet",
    prompt: str = "review this diff",
    system_prompt: str = "You are a code reviewer.",
    review_format: ReviewFormat = "findings",
) -> ReviewExecutionRequest:
    return ReviewExecutionRequest(
        adapter_name=CLAUDE_CODE_NAME,
        model=model,
        prompt=prompt,
        system_prompt=system_prompt,
        review_format=review_format,
        review_name="Dignified Python",
        review_description="Review Python diffs.",
        review_instructions="Flag concrete issues in the diff.",
        base_ref="master",
        diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
    )


_DEFAULT_USAGE_PAYLOAD: dict[str, object] = {
    "input_tokens": 100,
    "output_tokens": 50,
    "cache_creation_input_tokens": 10,
    "cache_read_input_tokens": 5,
}


def _stream_lines(
    *,
    model: str = "sonnet",
    structured_output: object | None = None,
    result_text: str = "Findings produced.",
    include_result: bool = True,
    include_structured_output: bool = True,
    include_usage: bool = True,
    include_total_cost: bool = True,
) -> str:
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
    return "\n".join(json.dumps(event) for event in events) + "\n"


def test_claude_code_build_argv_findings_mode() -> None:
    argv = CLAUDE_CODE_ADAPTER.build_argv(
        _request(system_prompt="SYSTEM PROMPT CONTENTS", review_format="findings")
    )

    assert argv[0] == "claude"
    assert "-p" in argv
    assert argv[argv.index("--output-format") + 1] == "stream-json"
    assert "--verbose" in argv
    assert "--bare" in argv
    assert argv[argv.index("--model") + 1] == "sonnet"
    assert argv[argv.index("--system-prompt") + 1] == "SYSTEM PROMPT CONTENTS"
    assert "--append-system-prompt" not in argv
    tools_value = argv[argv.index("--tools") + 1]
    assert tools_value == "Bash,Read"
    assert "Edit" not in tools_value
    assert "Write" not in tools_value
    schema_text = argv[argv.index("--json-schema") + 1]
    assert json.loads(schema_text) == FINDINGS_JSON_SCHEMA


def test_claude_code_build_argv_text_mode_omits_json_schema() -> None:
    argv = CLAUDE_CODE_ADAPTER.build_argv(_request(review_format="text"))

    assert "--json-schema" not in argv
    assert "--system-prompt" in argv
    tools_value = argv[argv.index("--tools") + 1]
    assert "Bash" in tools_value
    assert "Read" in tools_value
    assert "Edit" not in tools_value


@pytest.mark.parametrize("review_format", ["findings", "text"])
def test_claude_code_build_argv_terminates_options_before_prompt(
    review_format: ReviewFormat,
) -> None:
    """Regression: `--tools` is variadic. Without a `--` separator the
    variadic consumes the prompt positional and claude exits with
    'Input must be provided either through stdin or as a prompt argument'.
    """
    argv = CLAUDE_CODE_ADAPTER.build_argv(
        _request(prompt="PROMPT_BODY", review_format=review_format)
    )

    assert argv[-2] == "--"
    assert argv[-1] == "PROMPT_BODY"


@pytest.mark.parametrize("review_format", ["findings", "text"])
def test_claude_code_build_argv_no_positional_follows_tools_flag(
    review_format: ReviewFormat,
) -> None:
    """Regression: the token right after `--tools <value>` must be another
    flag (starts with `-`), or the variadic parser will keep consuming.
    """
    argv = CLAUDE_CODE_ADAPTER.build_argv(
        _request(prompt="PROMPT_BODY", review_format=review_format)
    )

    tools_index = argv.index("--tools")
    # tools_index + 1 is the value; tools_index + 2 must be a flag or `--`.
    next_token = argv[tools_index + 2]
    assert next_token.startswith("-"), (
        f"Token after --tools <value> must start with `-` to terminate the "
        f"variadic. Got {next_token!r}."
    )


@pytest.mark.parametrize(
    "model",
    ["sonnet", "opus", "haiku", "claude-sonnet-4-6", "claude-opus-4-7"],
)
def test_claude_code_supports_known_models(model: str) -> None:
    assert CLAUDE_CODE_ADAPTER.supports_model(model) is True


@pytest.mark.parametrize("model", ["gpt-5-mini", "gemini-pro", "llama-3"])
def test_claude_code_rejects_foreign_models(model: str) -> None:
    assert CLAUDE_CODE_ADAPTER.supports_model(model) is False


def test_claude_code_parse_stdout_parses_structured_findings() -> None:
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

    result = CLAUDE_CODE_ADAPTER.parse_stdout(
        _request(), _stream_lines(structured_output=structured)
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, FindingsReview)
    assert len(result.payload.findings) == 1
    assert result.payload.findings[0].path == "app.py"
    assert result.payload.findings[0].summary == "Avoid print in library code"


def test_claude_code_parse_stdout_handles_empty_findings() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(
        _request(), _stream_lines(structured_output={"findings": []})
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, FindingsReview)
    assert result.payload.findings == ()


def test_claude_code_parse_stdout_returns_prose_for_text_format() -> None:
    prose = "### Findings\n\n- app.py line 1: prefer click.echo over print."
    result = CLAUDE_CODE_ADAPTER.parse_stdout(
        _request(review_format="text"),
        _stream_lines(result_text=prose, include_structured_output=False),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, ProseReview)
    assert result.payload.prose == prose


def test_claude_code_parse_stdout_text_format_ignores_structured_output() -> None:
    """Text mode should take the plain `result` string, not any structured_output."""
    result = CLAUDE_CODE_ADAPTER.parse_stdout(
        _request(review_format="text"),
        _stream_lines(
            result_text="plain markdown body",
            structured_output={"findings": []},
        ),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, ProseReview)
    assert result.payload.prose == "plain markdown body"


def test_claude_code_parse_stdout_fails_on_empty_output() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(_request(), "   ")

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_empty_output"


def test_claude_code_parse_stdout_fails_on_non_json_line() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(_request(), "not json at all\n")

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_json"


def test_claude_code_parse_stdout_fails_on_missing_result_event() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(_request(), _stream_lines(include_result=False))

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_missing_result_event"


def test_claude_code_parse_stdout_fails_when_structured_output_missing_in_findings_mode() -> None:
    prose = "I thought about it and here is a prose answer."
    stdout = _stream_lines(result_text=prose, include_structured_output=False)

    result = CLAUDE_CODE_ADAPTER.parse_stdout(_request(), stdout)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_non_json_result"
    assert "Model response:" in result.message
    assert "I thought about it and here is a prose answer." in result.message


def test_claude_code_parse_stdout_truncates_long_prose_in_error() -> None:
    prose = "ALPHA-" + "x" * 2000
    stdout = _stream_lines(result_text=prose, include_structured_output=False)

    result = CLAUDE_CODE_ADAPTER.parse_stdout(_request(), stdout)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_non_json_result"
    assert "ALPHA-" in result.message
    assert "…" in result.message
    assert prose not in result.message


def test_claude_code_parse_stdout_fails_on_missing_findings_key() -> None:
    stdout = _stream_lines(structured_output={"something_else": []})

    result = CLAUDE_CODE_ADAPTER.parse_stdout(_request(), stdout)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_findings"


def test_claude_code_parse_stdout_fails_on_malformed_finding() -> None:
    stdout = _stream_lines(structured_output={"findings": [{"path": "app.py"}]})

    result = CLAUDE_CODE_ADAPTER.parse_stdout(_request(), stdout)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "claude_code_invalid_findings"


def test_claude_code_parse_stdout_extracts_usage_in_findings_mode() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(
        _request(), _stream_lines(structured_output={"findings": []})
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.usage, ReviewUsage)
    assert result.usage.input_tokens == 100
    assert result.usage.output_tokens == 50
    assert result.usage.cache_creation_input_tokens == 10
    assert result.usage.cache_read_input_tokens == 5
    assert result.usage.total_cost_usd == pytest.approx(0.0123)
    assert result.usage.duration_ms == 1234
    assert result.usage.num_turns == 1
    assert result.usage.total_input_tokens == 115


def test_claude_code_parse_stdout_extracts_usage_in_text_mode() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(
        _request(review_format="text"),
        _stream_lines(result_text="prose body", include_structured_output=False),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.usage, ReviewUsage)
    assert result.usage.output_tokens == 50


def test_claude_code_parse_stdout_usage_is_none_when_missing() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(
        _request(),
        _stream_lines(
            structured_output={"findings": []},
            include_usage=False,
            include_total_cost=False,
        ),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert result.usage is None


def test_claude_code_parse_stdout_usage_is_none_when_total_cost_missing() -> None:
    result = CLAUDE_CODE_ADAPTER.parse_stdout(
        _request(),
        _stream_lines(structured_output={"findings": []}, include_total_cost=False),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert result.usage is None


def test_findings_schema_matches_review_finding_contract() -> None:
    """Guardrail: the JSON schema must mirror the ReviewFinding dataclass."""
    required = FINDINGS_JSON_SCHEMA["properties"]["findings"]["items"]["required"]
    assert set(required) == {"path", "line", "severity", "summary", "details"}
    severity_enum = FINDINGS_JSON_SCHEMA["properties"]["findings"]["items"]["properties"][
        "severity"
    ]["enum"]
    assert set(severity_enum) == {"info", "warning", "error"}


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
