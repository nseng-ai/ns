"""Codex CLI harness adapter."""

from __future__ import annotations

import json
import re
from typing import Any

from twerk_reviewer.harness.findings_schema import (
    FINDINGS_JSON_SCHEMA_PATH,
)
from twerk_reviewer.harness_adapter import HarnessAdapter
from twerk_reviewer.models import (
    FindingsReview,
    ProseReview,
    ReviewerFailure,
    ReviewExecutionInvalidJson,
    ReviewExecutionInvalidResponse,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewFinding,
)

CODEX_BINARY = "codex"
CODEX_NAME = "codex"


def _codex_supports_model(model: str) -> bool:
    return model.startswith(("gpt-", "codex-")) or re.match(r"^o\d", model) is not None


def _codex_build_argv(request: ReviewExecutionRequest) -> list[str]:
    argv = [
        CODEX_BINARY,
        "exec",
        "--json",
        "--sandbox",
        "read-only",
        "-c",
        'approval_policy="never"',
        "-c",
        f"developer_instructions={json.dumps(request.system_prompt)}",
        "--model",
        request.model,
    ]
    if request.review_format == "findings":
        argv += ["--output-schema", str(FINDINGS_JSON_SCHEMA_PATH)]
    argv += ["--", request.prompt]
    return argv


def _iter_json_lines(stdout: str) -> list[dict[str, Any]] | ReviewerFailure:
    events: list[dict[str, Any]] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            return ReviewExecutionInvalidJson(
                message=f"Unable to parse Codex JSONL event: {exc}",
            )
        if not isinstance(event, dict):
            return ReviewExecutionInvalidResponse(
                message="Each Codex JSONL event must be a JSON object.",
            )
        events.append(event)
    return events


def _extract_final_message(stdout: str) -> str | ReviewerFailure:
    if not stdout.strip():
        return ReviewExecutionInvalidResponse(message="Codex returned no output.")

    events = _iter_json_lines(stdout)
    if isinstance(events, ReviewerFailure):
        return events

    final_message: str | None = None
    for event in events:
        if event.get("type") != "item.completed":
            continue
        item = event.get("item")
        if not isinstance(item, dict):
            continue
        if item.get("type") != "agent_message":
            continue
        text = item.get("text")
        if isinstance(text, str):
            final_message = text

    if final_message is None:
        return ReviewExecutionInvalidResponse(
            message=("Codex JSONL output did not include a completed `agent_message` item."),
        )

    return final_message


def _parse_findings_payload(payload: Any) -> ReviewExecutionResponse | ReviewerFailure:
    if not isinstance(payload, dict):
        return ReviewExecutionInvalidResponse(
            message="Codex review output must be a JSON object with a `findings` array.",
        )

    findings_payload = payload.get("findings")
    if not isinstance(findings_payload, list):
        return ReviewExecutionInvalidResponse(
            message="Codex review output must include a `findings` array.",
        )

    findings: list[ReviewFinding] = []
    for finding_payload in findings_payload:
        if not isinstance(finding_payload, dict):
            return ReviewExecutionInvalidResponse(
                message="Each review finding must be a JSON object.",
            )
        try:
            findings.append(ReviewFinding.from_json_dict(finding_payload))
        except ValueError as exc:
            return ReviewExecutionInvalidResponse(message=str(exc))

    return ReviewExecutionResponse(payload=FindingsReview(findings=tuple(findings)))


def _codex_parse_stdout(
    request: ReviewExecutionRequest,
    stdout: str,
) -> ReviewExecutionResponse | ReviewerFailure:
    final_message = _extract_final_message(stdout)
    if isinstance(final_message, ReviewerFailure):
        return final_message

    if request.review_format == "text":
        return ReviewExecutionResponse(payload=ProseReview(prose=final_message))

    try:
        payload = json.loads(final_message)
    except json.JSONDecodeError as exc:
        return ReviewExecutionInvalidJson(
            message=f"Unable to parse Codex structured response as JSON: {exc}",
        )
    return _parse_findings_payload(payload)


def _codex_describe_event(line: str) -> str | None:
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
    if event_type == "thread.started":
        return "session started"
    if event_type == "turn.started":
        return "turn started"
    if event_type == "item.completed":
        item = event.get("item")
        if not isinstance(item, dict):
            return None
        if item.get("type") != "agent_message":
            return None
        body = item.get("text")
        if isinstance(body, str) and body:
            return f"assistant message received ({len(body)} chars)"
        return "assistant message received"
    if event_type == "turn.completed":
        return "result received"
    return None


CODEX_ADAPTER = HarnessAdapter(
    name=CODEX_NAME,
    binary=CODEX_BINARY,
    build_argv=_codex_build_argv,
    parse_stdout=_codex_parse_stdout,
    supports_model=_codex_supports_model,
    describe_event=_codex_describe_event,
)
