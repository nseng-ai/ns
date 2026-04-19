from __future__ import annotations

import json

import pytest

from twerk_reviewer.harness.codex.adapter import CODEX_ADAPTER, CODEX_NAME
from twerk_reviewer.harness.findings_schema import FINDINGS_JSON_SCHEMA_PATH
from twerk_reviewer.models import (
    FindingsReview,
    ProseReview,
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewFormat,
)


def _request(
    *,
    model: str = "gpt-5-mini",
    prompt: str = "review this diff",
    system_prompt: str = "You are a code reviewer.",
    review_format: ReviewFormat = "findings",
) -> ReviewExecutionRequest:
    return ReviewExecutionRequest(
        adapter_name=CODEX_NAME,
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


def _jsonl(events: list[dict[str, object]]) -> str:
    return "\n".join(json.dumps(event) for event in events) + "\n"


def _codex_events(*, final_text: str) -> str:
    return _jsonl(
        [
            {"type": "thread.started", "thread_id": "thread_123"},
            {"type": "turn.started"},
            {
                "type": "item.completed",
                "item": {
                    "id": "item_1",
                    "type": "agent_message",
                    "text": final_text,
                },
            },
            {"type": "turn.completed"},
        ]
    )


def test_codex_build_argv_findings_mode() -> None:
    argv = CODEX_ADAPTER.build_argv(
        _request(system_prompt="SYSTEM PROMPT CONTENTS", review_format="findings")
    )

    assert argv[:2] == ["codex", "exec"]
    assert "--json" in argv
    assert argv[argv.index("--sandbox") + 1] == "read-only"
    assert argv[argv.index("-c") + 1] == 'approval_policy="never"'
    assert "--model" in argv
    assert argv[argv.index("--model") + 1] == "gpt-5-mini"
    assert "--output-schema" in argv
    assert argv[argv.index("--output-schema") + 1] == str(FINDINGS_JSON_SCHEMA_PATH)
    assert "--" in argv
    assert argv[-1] == "review this diff"


def test_codex_build_argv_threads_system_prompt_through_developer_instructions() -> None:
    argv = CODEX_ADAPTER.build_argv(_request(system_prompt="SYSTEM PROMPT CONTENTS"))

    config_values = [argv[index + 1] for index, token in enumerate(argv[:-1]) if token == "-c"]
    assert 'approval_policy="never"' in config_values
    assert 'developer_instructions="SYSTEM PROMPT CONTENTS"' in config_values


def test_codex_build_argv_text_mode_omits_output_schema() -> None:
    argv = CODEX_ADAPTER.build_argv(_request(review_format="text"))

    assert "--output-schema" not in argv


@pytest.mark.parametrize("model", ["gpt-5-mini", "gpt-5.2-codex", "o3", "codex-mini-latest"])
def test_codex_supports_known_models(model: str) -> None:
    assert CODEX_ADAPTER.supports_model(model) is True


@pytest.mark.parametrize("model", ["sonnet", "gemini-pro", "llama-3"])
def test_codex_rejects_foreign_models(model: str) -> None:
    assert CODEX_ADAPTER.supports_model(model) is False


def test_codex_parse_stdout_parses_structured_findings() -> None:
    final_text = json.dumps(
        {
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
    )

    result = CODEX_ADAPTER.parse_stdout(_request(), _codex_events(final_text=final_text))

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, FindingsReview)
    assert len(result.payload.findings) == 1
    assert result.payload.findings[0].path == "app.py"


def test_codex_parse_stdout_returns_prose_for_text_format() -> None:
    prose = "### Findings\n\n- app.py line 1: prefer click.echo over print."

    result = CODEX_ADAPTER.parse_stdout(
        _request(review_format="text"),
        _codex_events(final_text=prose),
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, ProseReview)
    assert result.payload.prose == prose


def test_codex_parse_stdout_fails_on_empty_output() -> None:
    result = CODEX_ADAPTER.parse_stdout(_request(), "   ")

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "review_execution_invalid_response"


def test_codex_parse_stdout_fails_on_non_json_line() -> None:
    result = CODEX_ADAPTER.parse_stdout(_request(), "not json at all\n")

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "review_execution_invalid_json"


def test_codex_parse_stdout_fails_on_missing_agent_message() -> None:
    stdout = _jsonl(
        [
            {"type": "thread.started", "thread_id": "thread_123"},
            {"type": "turn.started"},
            {"type": "turn.completed"},
        ]
    )

    result = CODEX_ADAPTER.parse_stdout(_request(), stdout)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "review_execution_invalid_response"


def test_codex_parse_stdout_fails_when_findings_message_is_not_json() -> None:
    result = CODEX_ADAPTER.parse_stdout(_request(), _codex_events(final_text="plain markdown"))

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "review_execution_invalid_json"
