from __future__ import annotations

import json
from pathlib import Path

import pytest

from asdl_objectives.exec.runner_subagent_usage import (
    summarize_runner_subagent_session_file,
    summarize_runner_subagent_usage,
)


def test_summarizes_multiple_assistant_usage_messages_runner_subagent(tmp_path: Path) -> None:
    session_file = tmp_path / "slice.jsonl"
    _write_jsonl(
        session_file,
        _assistant_record(
            input_tokens=100,
            output_tokens=20,
            cache_read_tokens=10,
            cache_write_tokens=5,
            total_tokens=135,
            cost_input=0.010,
            cost_output=0.020,
            cost_cache_read=0.003,
            cost_cache_write=0.004,
            cost_total=0.037,
        ),
        _assistant_record(
            input_tokens=200,
            output_tokens=30,
            cache_read_tokens=0,
            cache_write_tokens=7,
            total_tokens=237,
            cost_input=0.020,
            cost_output=0.030,
            cost_cache_read=0.000,
            cost_cache_write=0.007,
            cost_total=0.057,
        ),
    )

    summary = summarize_runner_subagent_session_file(session_file)

    assert summary.status == "ok"
    assert summary.assistant_response_count == 2
    assert summary.tokens.input_tokens == 300
    assert summary.tokens.output_tokens == 50
    assert summary.tokens.cache_read_tokens == 10
    assert summary.tokens.cache_write_tokens == 12
    assert summary.tokens.total_tokens == 372
    assert summary.cost.input_usd == pytest.approx(0.030)
    assert summary.cost.output_usd == pytest.approx(0.050)
    assert summary.cost.cache_read_usd == pytest.approx(0.003)
    assert summary.cost.cache_write_usd == pytest.approx(0.011)
    assert summary.cost.total_usd == pytest.approx(0.094)
    assert summary.peak_observed_total_tokens == 237
    assert summary.peak_observed_prompt_tokens == 207
    assert summary.configured_context_window_tokens is None
    assert [(model.provider, model.api, model.model) for model in summary.models] == [
        ("openai-codex", "responses", "gpt-5.5")
    ]


def test_ignores_non_assistant_and_no_usage_messages_runner_subagent(tmp_path: Path) -> None:
    session_file = tmp_path / "slice.jsonl"
    _write_jsonl(
        session_file,
        {
            "message": {
                "role": "user",
                "usage": _usage(input_tokens=999, total_tokens=999),
            }
        },
        {
            "message": {
                "role": "tool",
                "usage": _usage(input_tokens=888, total_tokens=888),
            }
        },
        {"message": {"role": "assistant", "content": "no usage"}},
        _assistant_record(input_tokens=11, output_tokens=7, total_tokens=18),
    )

    summary = summarize_runner_subagent_session_file(session_file)

    assert summary.status == "ok"
    assert summary.assistant_response_count == 1
    assert summary.tokens.input_tokens == 11
    assert summary.tokens.output_tokens == 7
    assert summary.tokens.total_tokens == 18


def test_deduplicates_models_preserving_first_seen_order_runner_subagent(tmp_path: Path) -> None:
    session_file = tmp_path / "slice.jsonl"
    _write_jsonl(
        session_file,
        _assistant_record(provider="openai", api="responses", model="gpt-5.5"),
        _assistant_record(provider="openai", api="responses", model="gpt-5.5"),
        _assistant_record(provider="anthropic", api="messages", model="claude-sonnet"),
    )

    summary = summarize_runner_subagent_session_file(session_file)

    assert [(model.provider, model.api, model.model) for model in summary.models] == [
        ("openai", "responses", "gpt-5.5"),
        ("anthropic", "messages", "claude-sonnet"),
    ]


def test_missing_file_returns_missing_summary_runner_subagent(tmp_path: Path) -> None:
    summary = summarize_runner_subagent_session_file(tmp_path / "missing.jsonl")

    assert summary.status == "missing"
    assert summary.assistant_response_count == 0
    assert summary.tokens.total_tokens == 0
    assert summary.cost.total_usd == 0.0


def test_directory_returns_not_file_summary_runner_subagent(tmp_path: Path) -> None:
    summary = summarize_runner_subagent_session_file(tmp_path)

    assert summary.status == "not_file"
    assert summary.assistant_response_count == 0
    assert summary.tokens.total_tokens == 0


def test_invalid_json_reports_line_number_runner_subagent(tmp_path: Path) -> None:
    session_file = tmp_path / "broken.jsonl"
    session_file.write_text(
        json.dumps(_assistant_record(input_tokens=100, total_tokens=100)) + "\n\n" + "{not json}\n",
        encoding="utf-8",
    )

    summary = summarize_runner_subagent_session_file(session_file)

    assert summary.status == "invalid_json"
    assert summary.error_line == 3
    assert summary.error is not None
    assert "invalid JSON" in summary.error
    assert summary.assistant_response_count == 0
    assert summary.tokens.total_tokens == 0
    assert summary.cost.total_usd == 0.0


def test_no_usage_returns_no_usage_summary_runner_subagent(tmp_path: Path) -> None:
    session_file = tmp_path / "no-usage.jsonl"
    _write_jsonl(
        session_file,
        {"message": {"role": "user", "content": "hello"}},
        {"message": {"role": "assistant", "content": "hello"}},
        {"event": "unknown"},
    )

    summary = summarize_runner_subagent_session_file(session_file)

    assert summary.status == "no_usage"
    assert summary.assistant_response_count == 0
    assert summary.tokens.total_tokens == 0
    assert summary.peak_observed_total_tokens is None
    assert summary.peak_observed_prompt_tokens is None


def test_aggregate_combines_only_ok_runner_subagent_sessions(tmp_path: Path) -> None:
    ok_file = tmp_path / "ok.jsonl"
    no_usage_file = tmp_path / "no-usage.jsonl"
    missing_file = tmp_path / "missing.jsonl"
    _write_jsonl(
        ok_file,
        _assistant_record(input_tokens=40, output_tokens=5, cache_read_tokens=9, total_tokens=54),
    )
    _write_jsonl(no_usage_file, {"message": {"role": "assistant", "content": "no usage"}})

    result = summarize_runner_subagent_usage((ok_file, no_usage_file, missing_file))

    assert [session.status for session in result.sessions] == ["ok", "no_usage", "missing"]
    assert result.aggregate.session_count == 3
    assert result.aggregate.ok_session_count == 1
    assert result.aggregate.usage_response_count == 1
    assert result.aggregate.tokens.input_tokens == 40
    assert result.aggregate.tokens.output_tokens == 5
    assert result.aggregate.tokens.cache_read_tokens == 9
    assert result.aggregate.tokens.total_tokens == 54
    assert result.aggregate.peak_observed_total_tokens == 54
    assert result.aggregate.peak_observed_prompt_tokens == 49


def _write_jsonl(path: Path, *records: object) -> None:
    path.write_text(
        "".join(f"{json.dumps(record)}\n" for record in records),
        encoding="utf-8",
    )


def _assistant_record(
    *,
    provider: str = "openai-codex",
    api: str = "responses",
    model: str = "gpt-5.5",
    input_tokens: int = 1,
    output_tokens: int = 1,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    total_tokens: int = 2,
    cost_input: float = 0.001,
    cost_output: float = 0.002,
    cost_cache_read: float = 0.0,
    cost_cache_write: float = 0.0,
    cost_total: float = 0.003,
) -> dict[str, object]:
    return {
        "message": {
            "role": "assistant",
            "provider": provider,
            "api": api,
            "model": model,
            "usage": _usage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_tokens=cache_read_tokens,
                cache_write_tokens=cache_write_tokens,
                total_tokens=total_tokens,
                cost_input=cost_input,
                cost_output=cost_output,
                cost_cache_read=cost_cache_read,
                cost_cache_write=cost_cache_write,
                cost_total=cost_total,
            ),
        }
    }


def _usage(
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    total_tokens: int = 0,
    cost_input: float = 0.0,
    cost_output: float = 0.0,
    cost_cache_read: float = 0.0,
    cost_cache_write: float = 0.0,
    cost_total: float = 0.0,
) -> dict[str, object]:
    return {
        "input": input_tokens,
        "output": output_tokens,
        "cacheRead": cache_read_tokens,
        "cacheWrite": cache_write_tokens,
        "totalTokens": total_tokens,
        "cost": {
            "input": cost_input,
            "output": cost_output,
            "cacheRead": cost_cache_read,
            "cacheWrite": cost_cache_write,
            "total": cost_total,
        },
    }
