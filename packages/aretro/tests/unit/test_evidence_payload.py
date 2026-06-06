from __future__ import annotations

import hashlib
import json
from pathlib import Path

from aretro.exec.collect_evidence import (
    CollectEvidenceRequest,
    CollectEvidenceResult,
    RepoContextDto,
    _result_from_query_result,
)
from aretro.exec.evidence_payload import (
    build_evidence_payload_data,
    command_subject_for_payload,
)
from asdl_core.sessions.types import (
    ParsedSession,
    SessionAssociation,
    SessionCommandExecution,
    SessionMessageCounts,
    SessionModelEvent,
    SessionQueryResult,
    SessionSourceInfo,
    SessionSourceRef,
    SessionToolCall,
    SessionToolResult,
    SessionUsage,
    SessionWarning,
)


def test_build_evidence_payload_data_includes_sanitized_event_arrays() -> None:
    source_info = _source_info()
    session = _detail_session(source_info=source_info)
    compact_result = _compact_result(session)

    payload_data = build_evidence_payload_data(
        compact_result=compact_result,
        sessions=(session,),
    )

    detail = payload_data.sessions[0]
    assert payload_data.schema_version == 1
    assert detail.session_index == 0
    assert detail.session_id == "s1"
    assert detail.summary["session_id"] == "s1"
    assert detail.model_events[0].provider == "anthropic"
    assert detail.tool_calls[0].tool_name == "read"
    assert detail.tool_calls[0].path == "packages/foo.py"
    assert detail.tool_results[0].is_error is True
    assert detail.command_executions[0].command_subject == "just test"
    assert detail.usage_events[0].total_tokens == 15
    assert detail.warnings[0].code == "note"


def test_detail_payload_omits_raw_error_messages() -> None:
    source_info = _source_info()
    session = _detail_session(source_info=source_info, error_message="SECRET_RAW_ERROR_TEXT")
    compact_result = _compact_result(session)

    payload_data = build_evidence_payload_data(
        compact_result=compact_result,
        sessions=(session,),
    )

    serialized = json.dumps(payload_data.model_dump(mode="json"))
    assert "SECRET_RAW_ERROR_TEXT" not in serialized
    assert payload_data.sessions[0].tool_results[0].has_error_message is True


def test_command_subject_for_payload_bounds_long_commands_with_hash_metadata() -> None:
    command = "echo " + ("secret-token " * 80)

    subject, metadata = command_subject_for_payload(command)

    assert command not in subject
    assert command not in json.dumps({"subject": subject, "metadata": metadata})
    assert metadata == {
        "truncated": True,
        "original_length": len(command),
        "sha256_prefix": hashlib.sha256(command.encode("utf-8")).hexdigest()[:16],
    }


def test_evidence_items_include_supporting_event_pointers_from_source_refs() -> None:
    source_info = _source_info()
    session = _detail_session(source_info=source_info)
    compact_result = _compact_result(session)

    payload_data = build_evidence_payload_data(
        compact_result=compact_result,
        sessions=(session,),
    )

    failed_tool_items = tuple(
        item for item in payload_data.evidence_items if item.item["kind"] == "failed_tool_result"
    )
    assert len(failed_tool_items) == 1
    assert failed_tool_items[0].supporting_event_pointers == ("/data/sessions/0/tool_results/0",)


def test_evidence_items_allow_empty_supporting_event_pointers_when_no_source_ref_match() -> None:
    source_info = _source_info()
    session = _detail_session(source_info=source_info, include_event_source_refs=False)
    compact_result = _compact_result(session)

    payload_data = build_evidence_payload_data(
        compact_result=compact_result,
        sessions=(session,),
    )

    assert all(item.supporting_event_pointers == () for item in payload_data.evidence_items)


def _compact_result(session: ParsedSession) -> CollectEvidenceResult:
    return _result_from_query_result(
        request=CollectEvidenceRequest(),
        repo=RepoContextDto(
            repo_root="/repo",
            cwd="/repo",
            branch="feature/retro",
            branch_source="explicit",
        ),
        query_result=SessionQueryResult(
            source_info=session.source_info,
            sessions=(session,),
            warnings=(),
        ),
    )


def _source_info() -> SessionSourceInfo:
    return SessionSourceInfo(harness="fake", adapter_name="fake", record_format="memory")


def _detail_session(
    *,
    source_info: SessionSourceInfo,
    error_message: str = "error details",
    include_event_source_refs: bool = True,
) -> ParsedSession:
    source_path = Path("/tmp/sessions/s1.jsonl")
    include_refs = include_event_source_refs
    model_ref = _source_ref(source_path, 1, include_event_source_refs=include_refs)
    tool_call_ref = _source_ref(source_path, 2, include_event_source_refs=include_refs)
    tool_result_ref = _source_ref(source_path, 3, include_event_source_refs=include_refs)
    command_ref = _source_ref(source_path, 4, include_event_source_refs=include_refs)
    usage_ref = _source_ref(source_path, 5, include_event_source_refs=include_refs)
    warning_ref = _source_ref(source_path, 6, include_event_source_refs=include_refs)
    return ParsedSession(
        source_info=source_info,
        source_ref=SessionSourceRef(path=source_path),
        session_id="s1",
        started_at_iso="2026-01-01T00:00:00Z",
        ended_at_iso="2026-01-01T00:01:00Z",
        association=SessionAssociation(
            repo_root=Path("/repo"),
            cwd=Path("/repo"),
            branch=None,
            confidence="repo_cwd",
            evidence=("query.repo_root",),
        ),
        message_counts=SessionMessageCounts(user=1, assistant=1, tool_result=1),
        model_events=(
            SessionModelEvent(provider="anthropic", model="sonnet", source_ref=model_ref),
        ),
        tool_calls=(
            SessionToolCall(
                call_id="read-1",
                tool_name="read",
                argument_keys=("path",),
                source_ref=tool_call_ref,
                path="packages/foo.py",
            ),
        ),
        tool_results=(
            SessionToolResult(
                tool_call_id="read-1",
                tool_name="read",
                is_error=True,
                error_message=error_message,
                text_length=42,
                line_count=2,
                truncated=False,
                source_ref=tool_result_ref,
            ),
        ),
        command_executions=(
            SessionCommandExecution(
                command="just test",
                exit_code=0,
                cancelled=False,
                truncated=False,
                output_length=500,
                line_count=10,
                source_ref=command_ref,
            ),
        ),
        usage_events=(
            SessionUsage(input_tokens=10, output_tokens=5, total_tokens=15, source_ref=usage_ref),
        ),
        warnings=(SessionWarning(code="note", message="non-fatal", source_ref=warning_ref),),
    )


def _source_ref(
    source_path: Path,
    line_number: int,
    *,
    include_event_source_refs: bool,
) -> SessionSourceRef | None:
    if include_event_source_refs:
        return SessionSourceRef(path=source_path, line_number=line_number)
    return None
