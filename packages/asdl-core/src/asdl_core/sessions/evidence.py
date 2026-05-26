"""Deterministic evidence aggregation for normalized session facts."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType

from asdl_core.sessions.types import ParsedSession, SessionSourceRef

EvidenceMetadataValue = str | int | bool | None

EVIDENCE_KIND_ORDER: tuple[str, ...] = (
    "tool_usage_count",
    "failed_tool_result",
    "repeated_file_read",
    "repeated_shell_command",
    "token_usage_observed",
    "large_output_observed",
)

_READ_TOOL_NAMES = frozenset({"read"})
_SHELL_TOOL_NAMES = frozenset({"bash", "shell", "sh", "terminal", "run_command"})
_UNKNOWN_TOOL = "unknown_tool"
_MAX_SUBJECT_LENGTH = 500
_HASH_PREFIX_LENGTH = 16


@dataclass(frozen=True)
class SessionEvidenceItem:
    """One source-backed deterministic observation about parsed sessions."""

    kind: str
    subject: str
    summary: str
    count: int | None
    session_count: int | None
    source_refs: tuple[SessionSourceRef, ...]
    metadata: Mapping[str, EvidenceMetadataValue] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "source_refs", tuple(self.source_refs))
        object.__setattr__(self, "metadata", MappingProxyType(dict(self.metadata)))


@dataclass
class _GroupAccumulator:
    count: int = 0
    session_indices: set[int] = field(default_factory=set)
    source_refs: list[SessionSourceRef] = field(default_factory=list)

    def record(
        self,
        *,
        session_index: int,
        source_ref: SessionSourceRef,
        max_source_refs: int,
    ) -> None:
        self.count += 1
        self.session_indices.add(session_index)
        _append_unique_source_ref(self.source_refs, source_ref, max_source_refs)


@dataclass
class _FailureAccumulator(_GroupAccumulator):
    error_message_count: int = 0


@dataclass
class _LargeOutputAccumulator(_GroupAccumulator):
    max_output_length: int | None = None
    max_line_count: int | None = None
    truncated_count: int = 0
    char_threshold_hits: int = 0
    line_threshold_hits: int = 0

    def record_large_output(
        self,
        *,
        session_index: int,
        source_ref: SessionSourceRef,
        max_source_refs: int,
        output_length: int | None,
        line_count: int | None,
        truncated: bool | None,
        char_threshold_hit: bool,
        line_threshold_hit: bool,
    ) -> None:
        self.record(
            session_index=session_index,
            source_ref=source_ref,
            max_source_refs=max_source_refs,
        )
        if output_length is not None:
            if self.max_output_length is None or output_length > self.max_output_length:
                self.max_output_length = output_length
        if line_count is not None:
            if self.max_line_count is None or line_count > self.max_line_count:
                self.max_line_count = line_count
        if truncated is True:
            self.truncated_count += 1
        if char_threshold_hit:
            self.char_threshold_hits += 1
        if line_threshold_hit:
            self.line_threshold_hits += 1


@dataclass
class _UsageAccumulator:
    count: int = 0
    session_indices: set[int] = field(default_factory=set)
    source_refs: list[SessionSourceRef] = field(default_factory=list)
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    total_tokens: int | None = None

    def record(
        self,
        *,
        session_index: int,
        source_ref: SessionSourceRef,
        max_source_refs: int,
        input_tokens: int | None,
        output_tokens: int | None,
        cache_read_tokens: int | None,
        cache_write_tokens: int | None,
        total_tokens: int | None,
    ) -> None:
        self.count += 1
        self.session_indices.add(session_index)
        _append_unique_source_ref(self.source_refs, source_ref, max_source_refs)
        self.input_tokens = _add_optional_total(self.input_tokens, input_tokens)
        self.output_tokens = _add_optional_total(self.output_tokens, output_tokens)
        self.cache_read_tokens = _add_optional_total(self.cache_read_tokens, cache_read_tokens)
        self.cache_write_tokens = _add_optional_total(self.cache_write_tokens, cache_write_tokens)
        self.total_tokens = _add_optional_total(self.total_tokens, total_tokens)


def collect_session_evidence(
    sessions: tuple[ParsedSession, ...],
    *,
    repeated_file_read_threshold: int = 2,
    repeated_shell_command_threshold: int = 2,
    large_output_line_threshold: int = 200,
    large_output_char_threshold: int = 20_000,
    max_source_refs_per_item: int = 10,
) -> tuple[SessionEvidenceItem, ...]:
    """Collect factual, source-backed evidence from parsed sessions."""

    if not sessions:
        return ()

    max_source_refs = max(0, max_source_refs_per_item)
    items: list[SessionEvidenceItem] = []
    items.extend(_tool_usage_items(sessions, max_source_refs=max_source_refs))
    items.extend(_failed_tool_items(sessions, max_source_refs=max_source_refs))
    items.extend(
        _repeated_file_read_items(
            sessions,
            threshold=max(1, repeated_file_read_threshold),
            max_source_refs=max_source_refs,
        )
    )
    items.extend(
        _repeated_shell_command_items(
            sessions,
            threshold=max(1, repeated_shell_command_threshold),
            max_source_refs=max_source_refs,
        )
    )
    usage_item = _token_usage_item(sessions, max_source_refs=max_source_refs)
    if usage_item is not None:
        items.append(usage_item)
    items.extend(
        _large_output_items(
            sessions,
            line_threshold=max(0, large_output_line_threshold),
            char_threshold=max(0, large_output_char_threshold),
            max_source_refs=max_source_refs,
        )
    )
    return tuple(sorted(items, key=_evidence_sort_key))


def _tool_usage_items(
    sessions: tuple[ParsedSession, ...],
    *,
    max_source_refs: int,
) -> tuple[SessionEvidenceItem, ...]:
    groups: dict[str, _GroupAccumulator] = {}
    for session_index, session in enumerate(sessions):
        for tool_call in session.tool_calls:
            subject = tool_call.tool_name
            if subject not in groups:
                groups[subject] = _GroupAccumulator()
            groups[subject].record(
                session_index=session_index,
                source_ref=_source_ref(tool_call.source_ref, session),
                max_source_refs=max_source_refs,
            )

    items: list[SessionEvidenceItem] = []
    for subject, group in groups.items():
        items.append(
            SessionEvidenceItem(
                kind="tool_usage_count",
                subject=subject,
                summary=(
                    f"{subject} called {group.count} {_plural('time', group.count)} "
                    f"across {len(group.session_indices)} "
                    f"{_plural('session', len(group.session_indices))}"
                ),
                count=group.count,
                session_count=len(group.session_indices),
                source_refs=tuple(group.source_refs),
                metadata={},
            )
        )
    return tuple(items)


def _failed_tool_items(
    sessions: tuple[ParsedSession, ...],
    *,
    max_source_refs: int,
) -> tuple[SessionEvidenceItem, ...]:
    groups: dict[str, _FailureAccumulator] = {}
    for session_index, session in enumerate(sessions):
        for tool_result in session.tool_results:
            if not tool_result.is_error:
                continue
            subject = tool_result.tool_name or _UNKNOWN_TOOL
            if subject not in groups:
                groups[subject] = _FailureAccumulator()
            group = groups[subject]
            group.record(
                session_index=session_index,
                source_ref=_source_ref(tool_result.source_ref, session),
                max_source_refs=max_source_refs,
            )
            if tool_result.error_message is not None:
                group.error_message_count += 1

    items: list[SessionEvidenceItem] = []
    for subject, group in groups.items():
        metadata: dict[str, EvidenceMetadataValue] = {}
        if group.error_message_count > 0:
            metadata["error_message_count"] = group.error_message_count
        items.append(
            SessionEvidenceItem(
                kind="failed_tool_result",
                subject=subject,
                summary=(
                    f"{group.count} failed {_plural('tool result', group.count)} "
                    f"for {subject} across {len(group.session_indices)} "
                    f"{_plural('session', len(group.session_indices))}"
                ),
                count=group.count,
                session_count=len(group.session_indices),
                source_refs=tuple(group.source_refs),
                metadata=metadata,
            )
        )
    return tuple(items)


def _repeated_file_read_items(
    sessions: tuple[ParsedSession, ...],
    *,
    threshold: int,
    max_source_refs: int,
) -> tuple[SessionEvidenceItem, ...]:
    groups: dict[str, _GroupAccumulator] = {}
    for session_index, session in enumerate(sessions):
        for tool_call in session.tool_calls:
            if not _is_read_tool(tool_call.tool_name) or tool_call.path is None:
                continue
            subject = tool_call.path
            if subject not in groups:
                groups[subject] = _GroupAccumulator()
            groups[subject].record(
                session_index=session_index,
                source_ref=_source_ref(tool_call.source_ref, session),
                max_source_refs=max_source_refs,
            )

    items: list[SessionEvidenceItem] = []
    for subject, group in groups.items():
        if group.count < threshold:
            continue
        items.append(
            SessionEvidenceItem(
                kind="repeated_file_read",
                subject=subject,
                summary=(
                    f"{subject} read {group.count} {_plural('time', group.count)} "
                    f"across {len(group.session_indices)} "
                    f"{_plural('session', len(group.session_indices))}"
                ),
                count=group.count,
                session_count=len(group.session_indices),
                source_refs=tuple(group.source_refs),
                metadata={},
            )
        )
    return tuple(items)


def _repeated_shell_command_items(
    sessions: tuple[ParsedSession, ...],
    *,
    threshold: int,
    max_source_refs: int,
) -> tuple[SessionEvidenceItem, ...]:
    groups: dict[str, _GroupAccumulator] = {}
    for session_index, session in enumerate(sessions):
        for command_execution in session.command_executions:
            command = command_execution.command
            if command not in groups:
                groups[command] = _GroupAccumulator()
            groups[command].record(
                session_index=session_index,
                source_ref=_source_ref(command_execution.source_ref, session),
                max_source_refs=max_source_refs,
            )
        for tool_call in session.tool_calls:
            if not _is_shell_tool(tool_call.tool_name) or tool_call.command is None:
                continue
            command = tool_call.command
            if command not in groups:
                groups[command] = _GroupAccumulator()
            groups[command].record(
                session_index=session_index,
                source_ref=_source_ref(tool_call.source_ref, session),
                max_source_refs=max_source_refs,
            )

    items: list[SessionEvidenceItem] = []
    for command, group in groups.items():
        if group.count < threshold:
            continue
        subject, metadata = _bounded_command_subject(command)
        items.append(
            SessionEvidenceItem(
                kind="repeated_shell_command",
                subject=subject,
                summary=(
                    f"shell command occurred {group.count} {_plural('time', group.count)} "
                    f"across {len(group.session_indices)} "
                    f"{_plural('session', len(group.session_indices))}"
                ),
                count=group.count,
                session_count=len(group.session_indices),
                source_refs=tuple(group.source_refs),
                metadata=metadata,
            )
        )
    return tuple(items)


def _token_usage_item(
    sessions: tuple[ParsedSession, ...],
    *,
    max_source_refs: int,
) -> SessionEvidenceItem | None:
    usage = _UsageAccumulator()
    for session_index, session in enumerate(sessions):
        for usage_event in session.usage_events:
            usage.record(
                session_index=session_index,
                source_ref=_source_ref(usage_event.source_ref, session),
                max_source_refs=max_source_refs,
                input_tokens=usage_event.input_tokens,
                output_tokens=usage_event.output_tokens,
                cache_read_tokens=usage_event.cache_read_tokens,
                cache_write_tokens=usage_event.cache_write_tokens,
                total_tokens=usage_event.total_tokens,
            )

    if usage.count == 0:
        return None

    metadata: dict[str, EvidenceMetadataValue] = {"usage_event_count": usage.count}
    _set_if_not_none(metadata, "input_tokens", usage.input_tokens)
    _set_if_not_none(metadata, "output_tokens", usage.output_tokens)
    _set_if_not_none(metadata, "cache_read_tokens", usage.cache_read_tokens)
    _set_if_not_none(metadata, "cache_write_tokens", usage.cache_write_tokens)
    _set_if_not_none(metadata, "total_tokens", usage.total_tokens)
    session_count = len(usage.session_indices)
    return SessionEvidenceItem(
        kind="token_usage_observed",
        subject="token_usage",
        summary=(
            f"token usage observed in {usage.count} {_plural('event', usage.count)} "
            f"across {session_count} {_plural('session', session_count)}"
        ),
        count=usage.count,
        session_count=session_count,
        source_refs=tuple(usage.source_refs),
        metadata=metadata,
    )


def _large_output_items(
    sessions: tuple[ParsedSession, ...],
    *,
    line_threshold: int,
    char_threshold: int,
    max_source_refs: int,
) -> tuple[SessionEvidenceItem, ...]:
    groups: dict[str, _LargeOutputAccumulator] = {}
    for session_index, session in enumerate(sessions):
        for tool_result in session.tool_results:
            char_hit = _hits_threshold(tool_result.text_length, char_threshold)
            line_hit = _hits_threshold(tool_result.line_count, line_threshold)
            if tool_result.truncated is not True and not char_hit and not line_hit:
                continue
            subject = f"tool_result:{tool_result.tool_name or _UNKNOWN_TOOL}"
            if subject not in groups:
                groups[subject] = _LargeOutputAccumulator()
            groups[subject].record_large_output(
                session_index=session_index,
                source_ref=_source_ref(tool_result.source_ref, session),
                max_source_refs=max_source_refs,
                output_length=tool_result.text_length,
                line_count=tool_result.line_count,
                truncated=tool_result.truncated,
                char_threshold_hit=char_hit,
                line_threshold_hit=line_hit,
            )
        for command_execution in session.command_executions:
            char_hit = _hits_threshold(command_execution.output_length, char_threshold)
            line_hit = _hits_threshold(command_execution.line_count, line_threshold)
            if command_execution.truncated is not True and not char_hit and not line_hit:
                continue
            subject = "command_execution"
            if subject not in groups:
                groups[subject] = _LargeOutputAccumulator()
            groups[subject].record_large_output(
                session_index=session_index,
                source_ref=_source_ref(command_execution.source_ref, session),
                max_source_refs=max_source_refs,
                output_length=command_execution.output_length,
                line_count=command_execution.line_count,
                truncated=command_execution.truncated,
                char_threshold_hit=char_hit,
                line_threshold_hit=line_hit,
            )

    items: list[SessionEvidenceItem] = []
    for subject, group in groups.items():
        metadata: dict[str, EvidenceMetadataValue] = {
            "truncated_count": group.truncated_count,
            "char_threshold_hits": group.char_threshold_hits,
            "line_threshold_hits": group.line_threshold_hits,
        }
        _set_if_not_none(metadata, "max_output_length", group.max_output_length)
        _set_if_not_none(metadata, "max_line_count", group.max_line_count)
        session_count = len(group.session_indices)
        items.append(
            SessionEvidenceItem(
                kind="large_output_observed",
                subject=subject,
                summary=(
                    f"{group.count} large or truncated {_plural('output', group.count)} "
                    f"observed for {subject} across {session_count} "
                    f"{_plural('session', session_count)}"
                ),
                count=group.count,
                session_count=session_count,
                source_refs=tuple(group.source_refs),
                metadata=metadata,
            )
        )
    return tuple(items)


def _source_ref(source_ref: SessionSourceRef | None, session: ParsedSession) -> SessionSourceRef:
    if source_ref is not None:
        return source_ref
    return session.source_ref


def _append_unique_source_ref(
    source_refs: list[SessionSourceRef],
    source_ref: SessionSourceRef,
    max_source_refs: int,
) -> None:
    if len(source_refs) >= max_source_refs:
        return
    source_ref_key = _source_ref_key(source_ref)
    for existing in source_refs:
        if _source_ref_key(existing) == source_ref_key:
            return
    source_refs.append(source_ref)


def _source_ref_key(source_ref: SessionSourceRef) -> tuple[str | None, str | None, int | None]:
    path = None
    if source_ref.path is not None:
        path = str(source_ref.path)
    return (path, source_ref.uri, source_ref.line_number)


def _is_read_tool(tool_name: str) -> bool:
    return tool_name.lower() in _READ_TOOL_NAMES


def _is_shell_tool(tool_name: str) -> bool:
    return tool_name.lower() in _SHELL_TOOL_NAMES


def _bounded_command_subject(command: str) -> tuple[str, dict[str, EvidenceMetadataValue]]:
    if len(command) <= _MAX_SUBJECT_LENGTH:
        return command, {}
    digest = hashlib.sha256(command.encode("utf-8")).hexdigest()[:_HASH_PREFIX_LENGTH]
    subject = f"{command[:_MAX_SUBJECT_LENGTH]}…"
    return subject, {"subject_truncated": True, "command_sha256_prefix": digest}


def _add_optional_total(current: int | None, value: int | None) -> int | None:
    if value is None:
        return current
    if current is None:
        return value
    return current + value


def _set_if_not_none(
    metadata: dict[str, EvidenceMetadataValue],
    key: str,
    value: int | None,
) -> None:
    if value is not None:
        metadata[key] = value


def _hits_threshold(value: int | None, threshold: int) -> bool:
    if value is None:
        return False
    return value >= threshold


def _plural(noun: str, count: int) -> str:
    if count == 1:
        return noun
    return f"{noun}s"


def _kind_index(kind: str) -> int:
    if kind in EVIDENCE_KIND_ORDER:
        return EVIDENCE_KIND_ORDER.index(kind)
    return len(EVIDENCE_KIND_ORDER)


def _evidence_sort_key(item: SessionEvidenceItem) -> tuple[int, int, int, str]:
    count = item.count or 0
    size = _metadata_int(item.metadata, "max_output_length")
    return (_kind_index(item.kind), -count, -size, item.subject)


def _metadata_int(metadata: Mapping[str, EvidenceMetadataValue], key: str) -> int:
    value = metadata.get(key)
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    return 0
