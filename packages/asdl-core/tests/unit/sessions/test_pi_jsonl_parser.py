"""Tests for Pi JSONL session parsing."""

from __future__ import annotations

import json
from pathlib import Path

from asdl_core.sessions.adapters.pi_jsonl import parse_pi_jsonl_session
from asdl_core.sessions.types import SessionSourceRef


def test_parse_pi_jsonl_extracts_harness_neutral_tool_facts(tmp_path: Path) -> None:
    path = tmp_path / "session.jsonl"
    path.write_text(
        "\n".join(
            (
                json.dumps(
                    {
                        "type": "session",
                        "id": "s1",
                        "timestamp": "2026-01-01T00:00:00Z",
                        "cwd": "/repo",
                    }
                ),
                json.dumps(
                    {
                        "type": "model_change",
                        "timestamp": "2026-01-01T00:00:01Z",
                        "provider": "anthropic",
                        "model": "claude-sonnet",
                    }
                ),
                json.dumps(
                    {
                        "type": "message",
                        "timestamp": "2026-01-01T00:00:02Z",
                        "message": {
                            "role": "user",
                            "content": [{"type": "text", "text": "SECRET_PROMPT"}],
                        },
                    }
                ),
                json.dumps(
                    {
                        "type": "message",
                        "timestamp": "2026-01-01T00:00:03Z",
                        "message": {
                            "role": "assistant",
                            "content": [
                                {
                                    "type": "toolCall",
                                    "id": "c1",
                                    "name": "read",
                                    "arguments": {"path": "app.py", "limit": 20},
                                }
                            ],
                            "usage": {"input": 10, "output": 5, "totalTokens": 15},
                        },
                    }
                ),
                json.dumps(
                    {
                        "type": "message",
                        "timestamp": "2026-01-01T00:00:04Z",
                        "message": {
                            "role": "toolResult",
                            "toolCallId": "c1",
                            "toolName": "read",
                            "isError": False,
                            "content": [{"type": "text", "text": "SECRET_OUTPUT\nline2"}],
                        },
                    }
                ),
                json.dumps(
                    {
                        "type": "message",
                        "timestamp": "2026-01-01T00:00:05Z",
                        "message": {
                            "role": "bashExecution",
                            "command": "just",
                            "exitCode": 0,
                            "cancelled": False,
                            "truncated": False,
                            "output": "OK\n",
                        },
                    }
                ),
            )
        ),
        encoding="utf-8",
    )

    session = parse_pi_jsonl_session(path, repo_root=Path("/repo"))

    assert session.source_info.harness == "pi"
    assert session.source_info.adapter_name == "pi_jsonl"
    assert session.session_id == "s1"
    assert session.started_at_iso == "2026-01-01T00:00:00Z"
    assert session.ended_at_iso == "2026-01-01T00:00:05Z"
    assert session.association.cwd == Path("/repo")
    assert session.association.confidence == "repo_cwd"
    assert session.message_counts.user == 1
    assert session.message_counts.assistant == 1
    assert session.message_counts.tool_result == 1
    assert session.message_counts.command_execution == 1
    assert session.model_events[0].provider == "anthropic"
    assert session.model_events[0].model == "claude-sonnet"
    assert session.tool_calls[0].tool_name == "read"
    assert session.tool_calls[0].argument_keys == ("limit", "path")
    assert session.tool_calls[0].path == "app.py"
    assert session.tool_results[0].text_length == len("SECRET_OUTPUT\nline2")
    assert session.tool_results[0].line_count == 2
    assert session.command_executions[0].command == "just"
    assert session.command_executions[0].exit_code == 0
    assert session.command_executions[0].output_length == len("OK\n")
    assert session.usage_events[0].total_tokens == 15
    assert session.warnings == ()
    assert "SECRET_PROMPT" not in repr(session)
    assert "SECRET_OUTPUT" not in repr(session)


def test_parse_pi_jsonl_warns_and_continues_after_malformed_line(tmp_path: Path) -> None:
    path = tmp_path / "session.jsonl"
    path.write_text(
        '{"type":"session","id":"s1"}\n{not json}\n{"type":"message","message":{"role":"user"}}\n',
        encoding="utf-8",
    )

    session = parse_pi_jsonl_session(path)

    assert session.message_counts.user == 1
    assert [warning.code for warning in session.warnings] == ["malformed_json"]
    assert session.warnings[0].source_ref == SessionSourceRef(path=path, line_number=2)


def test_parse_pi_jsonl_warns_when_session_header_is_missing(tmp_path: Path) -> None:
    path = tmp_path / "session.jsonl"
    path.write_text(
        json.dumps({"type": "message", "message": {"role": "assistant"}}),
        encoding="utf-8",
    )

    session = parse_pi_jsonl_session(path, repo_root=Path("/repo"))

    assert session.session_id is None
    assert session.association.confidence == "query_repo_root"
    assert [warning.code for warning in session.warnings] == ["missing_session_header"]


def test_parse_pi_jsonl_warns_for_unknown_and_partial_records(tmp_path: Path) -> None:
    path = tmp_path / "session.jsonl"
    path.write_text(
        "\n".join(
            (
                json.dumps({"type": "session", "id": "s1"}),
                json.dumps({"type": "mystery", "timestamp": "2026-01-01T00:00:01Z"}),
                json.dumps({"type": "message", "message": {"role": "assistant", "content": []}}),
                json.dumps({"type": "message"}),
                json.dumps(
                    {
                        "type": "message",
                        "message": {
                            "role": "assistant",
                            "content": [{"type": "toolCall", "id": "c1"}],
                        },
                    }
                ),
            )
        ),
        encoding="utf-8",
    )

    session = parse_pi_jsonl_session(path)

    assert session.message_counts.assistant == 2
    assert session.message_counts.other == 1
    assert [warning.code for warning in session.warnings] == [
        "unknown_record_type",
        "partial_record",
        "partial_tool_call",
    ]
