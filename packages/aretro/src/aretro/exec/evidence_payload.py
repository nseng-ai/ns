"""Sanitized payload detail document construction for aretro evidence."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Final, Literal, TypeAlias

from asdl_core.clinkr.models import ClinkrModel
from asdl_core.sessions.types import (
    ParsedSession,
    SessionCommandExecution,
    SessionModelEvent,
    SessionSourceRef,
    SessionToolCall,
    SessionToolResult,
    SessionUsage,
    SessionWarning,
)

JsonObject: TypeAlias = dict[str, Any]
CommandMetadata: TypeAlias = dict[str, str | int | bool | None]
_SourceRefKey: TypeAlias = tuple[str | None, str | None, int | None]

MAX_COMMAND_SUBJECT_LENGTH: Final = 500
_COMMAND_SUBJECT_PREFIX_LENGTH: Final = 120
_COMMAND_HASH_PREFIX_LENGTH: Final = 16


class PayloadSourceRefDto(ClinkrModel):
    path: str | None
    uri: str | None
    line_number: int | None


class PayloadWarningDto(ClinkrModel):
    code: str
    message: str
    source_ref: PayloadSourceRefDto | None
    harness: str | None
    adapter_name: str | None


class ModelEventDetailDto(ClinkrModel):
    provider: str | None
    model: str | None
    source_ref: PayloadSourceRefDto | None


class ToolCallDetailDto(ClinkrModel):
    call_id: str | None
    tool_name: str
    argument_keys: tuple[str, ...]
    source_ref: PayloadSourceRefDto | None
    path: str | None
    command_subject: str | None
    command_metadata: CommandMetadata


class ToolResultDetailDto(ClinkrModel):
    tool_call_id: str | None
    tool_name: str | None
    is_error: bool
    has_error_message: bool
    text_length: int | None
    line_count: int | None
    truncated: bool | None
    source_ref: PayloadSourceRefDto | None


class CommandExecutionDetailDto(ClinkrModel):
    command_subject: str
    command_metadata: CommandMetadata
    exit_code: int | None
    cancelled: bool | None
    truncated: bool | None
    output_length: int | None
    line_count: int | None
    source_ref: PayloadSourceRefDto | None


class UsageDetailDto(ClinkrModel):
    input_tokens: int | None
    output_tokens: int | None
    cache_read_tokens: int | None
    cache_write_tokens: int | None
    total_tokens: int | None
    source_ref: PayloadSourceRefDto | None


class SessionDetailDto(ClinkrModel):
    session_index: int
    session_id: str | None
    summary: JsonObject
    model_events: tuple[ModelEventDetailDto, ...]
    tool_calls: tuple[ToolCallDetailDto, ...]
    tool_results: tuple[ToolResultDetailDto, ...]
    command_executions: tuple[CommandExecutionDetailDto, ...]
    usage_events: tuple[UsageDetailDto, ...]
    warnings: tuple[PayloadWarningDto, ...]


class EvidenceDetailItemDto(ClinkrModel):
    evidence_index: int
    item: JsonObject
    supporting_event_pointers: tuple[str, ...]


class AretroEvidencePayloadData(ClinkrModel):
    schema_version: Literal[1] = 1
    repo: JsonObject
    query: JsonObject
    source: JsonObject
    aggregate_metrics: JsonObject
    sessions: tuple[SessionDetailDto, ...]
    warnings: tuple[PayloadWarningDto, ...]
    evidence_items: tuple[EvidenceDetailItemDto, ...]


def build_evidence_payload_data(
    *,
    compact_result: ClinkrModel,
    sessions: tuple[ParsedSession, ...],
) -> AretroEvidencePayloadData:
    """Build a versioned, sanitized detail payload from compact evidence output."""

    compact_data = compact_result.model_dump(mode="json")
    pointer_index: dict[_SourceRefKey, list[str]] = {}
    detail_sessions = tuple(
        _session_detail(
            session=session,
            session_index=session_index,
            compact_session=_json_object_at(compact_data, "sessions", session_index),
            pointer_index=pointer_index,
        )
        for session_index, session in enumerate(sessions)
    )
    evidence_items = tuple(
        _evidence_detail_item(
            evidence_index=evidence_index,
            compact_item=compact_item,
            pointer_index=pointer_index,
        )
        for evidence_index, compact_item in enumerate(_json_objects(compact_data, "evidence_items"))
    )

    return AretroEvidencePayloadData(
        repo=_json_object(compact_data, "repo"),
        query=_json_object(compact_data, "query"),
        source=_json_object(compact_data, "source"),
        aggregate_metrics=_json_object(compact_data, "aggregate_metrics"),
        sessions=detail_sessions,
        warnings=_warnings_from_json(compact_data),
        evidence_items=evidence_items,
    )


def command_subject_for_payload(command: str) -> tuple[str, CommandMetadata]:
    """Return a bounded command subject plus metadata for payload detail."""

    if len(command) <= MAX_COMMAND_SUBJECT_LENGTH:
        return command, {}

    sha256_prefix = hashlib.sha256(command.encode("utf-8")).hexdigest()[
        :_COMMAND_HASH_PREFIX_LENGTH
    ]
    subject = f"{command[:_COMMAND_SUBJECT_PREFIX_LENGTH]}…[sha256:{sha256_prefix}]"
    return subject, {
        "truncated": True,
        "original_length": len(command),
        "sha256_prefix": sha256_prefix,
    }


def _session_detail(
    *,
    session: ParsedSession,
    session_index: int,
    compact_session: JsonObject,
    pointer_index: dict[_SourceRefKey, list[str]],
) -> SessionDetailDto:
    model_events = tuple(
        _model_event_detail(
            event=event,
            pointer=f"/data/sessions/{session_index}/model_events/{event_index}",
            pointer_index=pointer_index,
        )
        for event_index, event in enumerate(session.model_events)
    )
    tool_calls = tuple(
        _tool_call_detail(
            call=call,
            pointer=f"/data/sessions/{session_index}/tool_calls/{call_index}",
            pointer_index=pointer_index,
        )
        for call_index, call in enumerate(session.tool_calls)
    )
    tool_results = tuple(
        _tool_result_detail(
            result=result,
            pointer=f"/data/sessions/{session_index}/tool_results/{result_index}",
            pointer_index=pointer_index,
        )
        for result_index, result in enumerate(session.tool_results)
    )
    command_executions = tuple(
        _command_execution_detail(
            execution=execution,
            pointer=f"/data/sessions/{session_index}/command_executions/{execution_index}",
            pointer_index=pointer_index,
        )
        for execution_index, execution in enumerate(session.command_executions)
    )
    usage_events = tuple(
        _usage_detail(
            usage=usage,
            pointer=f"/data/sessions/{session_index}/usage_events/{usage_index}",
            pointer_index=pointer_index,
        )
        for usage_index, usage in enumerate(session.usage_events)
    )
    warnings = tuple(
        _session_warning_detail(
            warning=warning,
            pointer=f"/data/sessions/{session_index}/warnings/{warning_index}",
            pointer_index=pointer_index,
        )
        for warning_index, warning in enumerate(session.warnings)
    )
    return SessionDetailDto(
        session_index=session_index,
        session_id=session.session_id,
        summary=compact_session,
        model_events=model_events,
        tool_calls=tool_calls,
        tool_results=tool_results,
        command_executions=command_executions,
        usage_events=usage_events,
        warnings=warnings,
    )


def _model_event_detail(
    *,
    event: SessionModelEvent,
    pointer: str,
    pointer_index: dict[_SourceRefKey, list[str]],
) -> ModelEventDetailDto:
    _index_source_ref(event.source_ref, pointer=pointer, pointer_index=pointer_index)
    return ModelEventDetailDto(
        provider=event.provider,
        model=event.model,
        source_ref=_optional_source_ref_to_dto(event.source_ref),
    )


def _tool_call_detail(
    *,
    call: SessionToolCall,
    pointer: str,
    pointer_index: dict[_SourceRefKey, list[str]],
) -> ToolCallDetailDto:
    _index_source_ref(call.source_ref, pointer=pointer, pointer_index=pointer_index)
    command_subject: str | None = None
    command_metadata: CommandMetadata = {}
    if call.command is not None:
        command_subject, command_metadata = command_subject_for_payload(call.command)
    return ToolCallDetailDto(
        call_id=call.call_id,
        tool_name=call.tool_name,
        argument_keys=call.argument_keys,
        source_ref=_optional_source_ref_to_dto(call.source_ref),
        path=call.path,
        command_subject=command_subject,
        command_metadata=command_metadata,
    )


def _tool_result_detail(
    *,
    result: SessionToolResult,
    pointer: str,
    pointer_index: dict[_SourceRefKey, list[str]],
) -> ToolResultDetailDto:
    _index_source_ref(result.source_ref, pointer=pointer, pointer_index=pointer_index)
    return ToolResultDetailDto(
        tool_call_id=result.tool_call_id,
        tool_name=result.tool_name,
        is_error=result.is_error,
        has_error_message=result.error_message is not None,
        text_length=result.text_length,
        line_count=result.line_count,
        truncated=result.truncated,
        source_ref=_optional_source_ref_to_dto(result.source_ref),
    )


def _command_execution_detail(
    *,
    execution: SessionCommandExecution,
    pointer: str,
    pointer_index: dict[_SourceRefKey, list[str]],
) -> CommandExecutionDetailDto:
    _index_source_ref(execution.source_ref, pointer=pointer, pointer_index=pointer_index)
    command_subject, command_metadata = command_subject_for_payload(execution.command)
    return CommandExecutionDetailDto(
        command_subject=command_subject,
        command_metadata=command_metadata,
        exit_code=execution.exit_code,
        cancelled=execution.cancelled,
        truncated=execution.truncated,
        output_length=execution.output_length,
        line_count=execution.line_count,
        source_ref=_optional_source_ref_to_dto(execution.source_ref),
    )


def _usage_detail(
    *,
    usage: SessionUsage,
    pointer: str,
    pointer_index: dict[_SourceRefKey, list[str]],
) -> UsageDetailDto:
    _index_source_ref(usage.source_ref, pointer=pointer, pointer_index=pointer_index)
    return UsageDetailDto(
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read_tokens=usage.cache_read_tokens,
        cache_write_tokens=usage.cache_write_tokens,
        total_tokens=usage.total_tokens,
        source_ref=_optional_source_ref_to_dto(usage.source_ref),
    )


def _session_warning_detail(
    *,
    warning: SessionWarning,
    pointer: str,
    pointer_index: dict[_SourceRefKey, list[str]],
) -> PayloadWarningDto:
    _index_source_ref(warning.source_ref, pointer=pointer, pointer_index=pointer_index)
    return _warning_to_dto(warning)


def _evidence_detail_item(
    *,
    evidence_index: int,
    compact_item: JsonObject,
    pointer_index: dict[_SourceRefKey, list[str]],
) -> EvidenceDetailItemDto:
    supporting_event_pointers: list[str] = []
    seen_pointers: set[str] = set()
    for source_ref in _source_refs_from_item(compact_item):
        for pointer in pointer_index.get(source_ref, ()):
            if pointer not in seen_pointers:
                supporting_event_pointers.append(pointer)
                seen_pointers.add(pointer)
    return EvidenceDetailItemDto(
        evidence_index=evidence_index,
        item=compact_item,
        supporting_event_pointers=tuple(supporting_event_pointers),
    )


def _index_source_ref(
    source_ref: SessionSourceRef | None,
    *,
    pointer: str,
    pointer_index: dict[_SourceRefKey, list[str]],
) -> None:
    if source_ref is None:
        return
    pointer_index.setdefault(_source_ref_key(source_ref), []).append(pointer)


def _source_ref_key(source_ref: SessionSourceRef) -> _SourceRefKey:
    return (_path_to_string(source_ref.path), source_ref.uri, source_ref.line_number)


def _source_ref_json_key(source_ref: JsonObject) -> _SourceRefKey:
    path = source_ref.get("path")
    uri = source_ref.get("uri")
    line_number = source_ref.get("line_number")
    return (
        path if isinstance(path, str) else None,
        uri if isinstance(uri, str) else None,
        line_number if isinstance(line_number, int) and not isinstance(line_number, bool) else None,
    )


def _source_refs_from_item(item: JsonObject) -> tuple[_SourceRefKey, ...]:
    source_refs = item.get("source_refs")
    if not isinstance(source_refs, list):
        return ()
    return tuple(
        _source_ref_json_key(source_ref)
        for source_ref in source_refs
        if isinstance(source_ref, dict)
    )


def _warning_to_dto(warning: SessionWarning) -> PayloadWarningDto:
    return PayloadWarningDto(
        code=warning.code,
        message=warning.message,
        source_ref=_optional_source_ref_to_dto(warning.source_ref),
        harness=warning.harness,
        adapter_name=warning.adapter_name,
    )


def _warning_from_json(warning: JsonObject) -> PayloadWarningDto:
    source_ref = warning.get("source_ref")
    return PayloadWarningDto(
        code=str(warning.get("code", "")),
        message=str(warning.get("message", "")),
        source_ref=_source_ref_from_json(source_ref) if isinstance(source_ref, dict) else None,
        harness=_optional_string(warning.get("harness")),
        adapter_name=_optional_string(warning.get("adapter_name")),
    )


def _source_ref_to_dto(source_ref: SessionSourceRef) -> PayloadSourceRefDto:
    return PayloadSourceRefDto(
        path=_path_to_string(source_ref.path),
        uri=source_ref.uri,
        line_number=source_ref.line_number,
    )


def _optional_source_ref_to_dto(source_ref: SessionSourceRef | None) -> PayloadSourceRefDto | None:
    if source_ref is None:
        return None
    return _source_ref_to_dto(source_ref)


def _source_ref_from_json(source_ref: JsonObject) -> PayloadSourceRefDto:
    path = source_ref.get("path")
    uri = source_ref.get("uri")
    line_number = source_ref.get("line_number")
    return PayloadSourceRefDto(
        path=path if isinstance(path, str) else None,
        uri=uri if isinstance(uri, str) else None,
        line_number=line_number
        if isinstance(line_number, int) and not isinstance(line_number, bool)
        else None,
    )


def _warnings_from_json(data: JsonObject) -> tuple[PayloadWarningDto, ...]:
    warnings = data.get("warnings")
    if not isinstance(warnings, list):
        return ()
    return tuple(_warning_from_json(warning) for warning in warnings if isinstance(warning, dict))


def _json_object(data: JsonObject, key: str) -> JsonObject:
    value = data.get(key)
    if isinstance(value, dict):
        return value
    return {}


def _json_objects(data: JsonObject, key: str) -> tuple[JsonObject, ...]:
    value = data.get(key)
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, dict))


def _json_object_at(data: JsonObject, key: str, index: int) -> JsonObject:
    value = data.get(key)
    if not isinstance(value, list) or index >= len(value):
        return {}
    item = value[index]
    if isinstance(item, dict):
        return item
    return {}


def _optional_string(value: object) -> str | None:
    if isinstance(value, str):
        return value
    return None


def _path_to_string(path: Path | None) -> str | None:
    if path is None:
        return None
    return str(path)
