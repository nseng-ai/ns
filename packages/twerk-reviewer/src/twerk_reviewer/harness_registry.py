"""Registry of known harness adapters."""

from __future__ import annotations

import json
from collections.abc import Mapping
from types import MappingProxyType
from typing import Any

from twerk_reviewer.harness_adapter import HarnessAdapter
from twerk_reviewer.models import (
    FindingsReview,
    ProseReview,
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewFinding,
)

CLAUDE_CODE_BINARY = "claude"
CLAUDE_CODE_NAME = "claude-code"

_CLAUDE_CODE_MODEL_ALIASES = frozenset({"sonnet", "opus", "haiku"})
_CLAUDE_CODE_MODEL_PREFIXES = ("claude-",)

_PROSE_SNIPPET_MAX_CHARS = 500

FINDINGS_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["findings"],
    "properties": {
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["path", "line", "severity", "summary", "details"],
                "properties": {
                    "path": {"type": "string", "minLength": 1},
                    "line": {"type": ["integer", "null"]},
                    "severity": {"type": "string", "enum": ["info", "warning", "error"]},
                    "summary": {"type": "string", "minLength": 1},
                    "details": {"type": "string", "minLength": 1},
                },
            },
        },
    },
}


def _claude_code_supports_model(model: str) -> bool:
    if model in _CLAUDE_CODE_MODEL_ALIASES:
        return True
    return any(model.startswith(prefix) for prefix in _CLAUDE_CODE_MODEL_PREFIXES)


_READ_ONLY_TOOLS = "Bash,Read"


def _claude_code_build_argv(request: ReviewExecutionRequest) -> list[str]:
    argv = [
        CLAUDE_CODE_BINARY,
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--bare",
        "--model",
        request.model,
        "--system-prompt",
        request.system_prompt,
        # Read-only exploration only. Edit/Write stay out so a review run
        # cannot mutate the repo. In findings mode --json-schema also injects
        # the StructuredOutput tool, which the model uses to return findings.
        "--tools",
        _READ_ONLY_TOOLS,
    ]
    if request.review_format == "findings":
        argv += ["--json-schema", json.dumps(FINDINGS_JSON_SCHEMA)]
    argv.append(request.prompt)
    return argv


def _parse_findings_payload(payload: Any) -> ReviewExecutionResponse | ReviewerFailure:
    if not isinstance(payload, dict):
        return ReviewerFailure(
            error_type="claude_code_invalid_findings",
            message="Claude Code review output must be a JSON object with a `findings` array.",
        )

    findings_payload = payload.get("findings")
    if not isinstance(findings_payload, list):
        return ReviewerFailure(
            error_type="claude_code_invalid_findings",
            message="Claude Code review output must include a `findings` array.",
        )

    findings: list[ReviewFinding] = []
    for finding_payload in findings_payload:
        if not isinstance(finding_payload, dict):
            return ReviewerFailure(
                error_type="claude_code_invalid_findings",
                message="Each review finding must be a JSON object.",
            )
        try:
            findings.append(ReviewFinding.from_json_dict(finding_payload))
        except ValueError as exc:
            return ReviewerFailure(
                error_type="claude_code_invalid_findings",
                message=str(exc),
            )

    return ReviewExecutionResponse(payload=FindingsReview(findings=tuple(findings)))


def _iter_json_lines(stdout: str) -> list[dict[str, Any]] | ReviewerFailure:
    events: list[dict[str, Any]] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            return ReviewerFailure(
                error_type="claude_code_invalid_json",
                message=f"Unable to parse Claude Code stream-json line: {exc}",
            )
        if not isinstance(event, dict):
            return ReviewerFailure(
                error_type="claude_code_invalid_response",
                message="Each Claude Code stream-json event must be a JSON object.",
            )
        events.append(event)
    return events


def _truncate_prose(text: str, limit: int = _PROSE_SNIPPET_MAX_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def _extract_result_event(stdout: str) -> dict[str, Any] | ReviewerFailure:
    if not stdout.strip():
        return ReviewerFailure(
            error_type="claude_code_empty_output",
            message="Claude Code returned no output.",
        )

    events = _iter_json_lines(stdout)
    if isinstance(events, ReviewerFailure):
        return events

    for event in events:
        if event.get("type") == "result":
            return event

    return ReviewerFailure(
        error_type="claude_code_missing_result_event",
        message=(
            "Claude Code stream-json output did not include a terminal "
            "`result` event. The harness may have been killed before finishing."
        ),
    )


def _claude_code_parse_stdout(
    request: ReviewExecutionRequest,
    stdout: str,
) -> ReviewExecutionResponse | ReviewerFailure:
    result_event = _extract_result_event(stdout)
    if isinstance(result_event, ReviewerFailure):
        return result_event

    if request.review_format == "text":
        result_text = result_event.get("result")
        if not isinstance(result_text, str):
            return ReviewerFailure(
                error_type="claude_code_invalid_response",
                message="Claude Code `result` must be a string.",
            )
        return ReviewExecutionResponse(payload=ProseReview(prose=result_text))

    structured = result_event.get("structured_output")
    if structured is not None:
        return _parse_findings_payload(structured)

    result_text = result_event.get("result")
    if isinstance(result_text, str):
        prose = _truncate_prose(result_text.strip())
        return ReviewerFailure(
            error_type="claude_code_non_json_result",
            message=(
                "Claude Code did not return a structured_output payload.\n\n"
                f"Model response:\n{prose}\n\n"
                "Confirm --json-schema is being honored by the installed claude binary."
            ),
        )
    return ReviewerFailure(
        error_type="claude_code_invalid_response",
        message=(
            "Claude Code `result` event did not include a `structured_output` or `result` field."
        ),
    )


def _first_message_text(message: Any) -> str:
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if not isinstance(content, list):
        return ""
    pieces: list[str] = []
    for block in content:
        if isinstance(block, dict) and isinstance(block.get("text"), str):
            pieces.append(block["text"])
    return "".join(pieces)


def _claude_code_describe_event(line: str) -> str | None:
    text = line.strip()
    if not text:
        return None
    try:
        event = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(event, dict):
        return None

    event_type = event.get("type")
    if event_type == "system" and event.get("subtype") == "init":
        model = event.get("model")
        if isinstance(model, str) and model:
            return f"session started (model={model})"
        return "session started"
    if event_type == "assistant":
        body = _first_message_text(event.get("message"))
        if body:
            return f"assistant turn received ({len(body)} chars)"
        return "assistant turn received"
    if event_type == "result":
        duration_ms = event.get("duration_ms")
        num_turns = event.get("num_turns")
        parts: list[str] = []
        if isinstance(num_turns, int):
            parts.append(f"{num_turns} turn{'s' if num_turns != 1 else ''}")
        if isinstance(duration_ms, int):
            parts.append(f"{duration_ms / 1000:.1f}s")
        if parts:
            return f"result received ({', '.join(parts)})"
        return "result received"
    return None


CLAUDE_CODE_ADAPTER = HarnessAdapter(
    name=CLAUDE_CODE_NAME,
    binary=CLAUDE_CODE_BINARY,
    build_argv=_claude_code_build_argv,
    parse_stdout=_claude_code_parse_stdout,
    supports_model=_claude_code_supports_model,
    describe_event=_claude_code_describe_event,
)


HARNESS_ADAPTERS: Mapping[str, HarnessAdapter] = MappingProxyType(
    {
        CLAUDE_CODE_ADAPTER.name: CLAUDE_CODE_ADAPTER,
    }
)


def resolve_adapter(name: str) -> HarnessAdapter | ReviewerFailure:
    """Look up a harness adapter by name."""
    adapter = HARNESS_ADAPTERS.get(name)
    if adapter is None:
        known = ", ".join(sorted(HARNESS_ADAPTERS))
        return ReviewerFailure(
            error_type="harness_unknown",
            message=f"Unknown harness '{name}'. Known harnesses: {known}.",
        )
    return adapter
