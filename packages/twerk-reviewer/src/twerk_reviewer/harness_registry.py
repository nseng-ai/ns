"""Registry of known harness adapters."""

from __future__ import annotations

import json
from collections.abc import Mapping
from types import MappingProxyType
from typing import Any

from twerk_reviewer.harness_adapter import HarnessAdapter
from twerk_reviewer.models import ReviewerFailure, ReviewExecutionResponse, ReviewFinding

CLAUDE_CODE_BINARY = "claude"
CLAUDE_CODE_NAME = "claude-code"

_CLAUDE_CODE_MODEL_ALIASES = frozenset({"sonnet", "opus", "haiku"})
_CLAUDE_CODE_MODEL_PREFIXES = ("claude-",)


def _claude_code_supports_model(model: str) -> bool:
    if model in _CLAUDE_CODE_MODEL_ALIASES:
        return True
    return any(model.startswith(prefix) for prefix in _CLAUDE_CODE_MODEL_PREFIXES)


def _claude_code_build_argv(model: str, prompt: str) -> list[str]:
    return [
        CLAUDE_CODE_BINARY,
        "-p",
        "--output-format",
        "json",
        "--bare",
        "--model",
        model,
        prompt,
    ]


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

    return ReviewExecutionResponse(findings=tuple(findings))


def _claude_code_parse_stdout(stdout: str) -> ReviewExecutionResponse | ReviewerFailure:
    text = stdout.strip()
    if not text:
        return ReviewerFailure(
            error_type="claude_code_empty_output",
            message="Claude Code returned no output.",
        )

    try:
        outer = json.loads(text)
    except json.JSONDecodeError as exc:
        return ReviewerFailure(
            error_type="claude_code_invalid_json",
            message=f"Unable to parse Claude Code output: {exc}",
        )

    if not isinstance(outer, dict) or "result" not in outer:
        return ReviewerFailure(
            error_type="claude_code_invalid_response",
            message="Claude Code output did not include a `result` field.",
        )

    result_text = outer["result"]
    if not isinstance(result_text, str):
        return ReviewerFailure(
            error_type="claude_code_invalid_response",
            message="Claude Code `result` must be a string.",
        )

    try:
        inner = json.loads(result_text)
    except json.JSONDecodeError as exc:
        return ReviewerFailure(
            error_type="claude_code_non_json_result",
            message=(f"Claude Code returned prose instead of JSON findings. Parse error: {exc}"),
        )

    return _parse_findings_payload(inner)


CLAUDE_CODE_ADAPTER = HarnessAdapter(
    name=CLAUDE_CODE_NAME,
    binary=CLAUDE_CODE_BINARY,
    build_argv=_claude_code_build_argv,
    parse_stdout=_claude_code_parse_stdout,
    supports_model=_claude_code_supports_model,
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
