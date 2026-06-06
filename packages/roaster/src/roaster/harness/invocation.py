"""Unified harness invocation for markdown-defined reviews."""

from __future__ import annotations

import json
import shutil
import subprocess
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import cache
from importlib.resources import files
from types import MappingProxyType
from typing import Any, TextIO

from roaster.models import (
    ClaudeCodeEmptyOutput,
    ClaudeCodeInvalidFindings,
    ClaudeCodeInvalidJson,
    ClaudeCodeInvalidResponse,
    ClaudeCodeMissingResultEvent,
    ClaudeCodeNonJsonResult,
    FindingsReview,
    HarnessBinaryMissing,
    HarnessDetection,
    HarnessExecutionFailed,
    HarnessInvocationFailed,
    HarnessUnknown,
    LocalDiff,
    ModelNotSupportedByHarness,
    ProseReview,
    ReviewDefinition,
    ReviewExecutionResponse,
    ReviewFinding,
    ReviewFormat,
    ReviewUsage,
    RoasterFailure,
)

ProgressWriter = Callable[[str], None]
BinaryLocator = Callable[[str], str | None]


@dataclass(frozen=True)
class HarnessReviewRequest:
    """Semantic request for running a parsed review through a selected harness."""

    harness_name: str
    model: str
    review_definition: ReviewDefinition
    local_diff: LocalDiff
    review_format: ReviewFormat


@dataclass(frozen=True)
class HarnessProcessInvocation:
    """Concrete subprocess invocation for one harness run."""

    argv: tuple[str, ...]
    stdin: str | None


@dataclass(frozen=True)
class HarnessDefinition:
    """Internal definition of how to invoke one known harness."""

    name: str
    binary: str
    supports_model: Callable[[str], bool]
    build_invocation: Callable[[HarnessReviewRequest], HarnessProcessInvocation]
    parse_stdout: Callable[[HarnessReviewRequest, str], ReviewExecutionResponse | RoasterFailure]
    describe_event: Callable[[str], str | None]


CLAUDE_CODE_BINARY = "claude"
CLAUDE_CODE_NAME = "claude-code"

_CLAUDE_CODE_MODEL_ALIASES = frozenset({"sonnet", "opus", "haiku"})
_CLAUDE_CODE_MODEL_PREFIXES = ("claude-",)

_PROSE_SNIPPET_MAX_CHARS = 500

_READ_ONLY_TOOLS = "Bash,Read"

_CLAUDE_FINDINGS_SCHEMA: dict[str, Any] = {
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


def silent_progress(_msg: str) -> None:
    """Ignore harness progress messages."""
    return None


def _no_event_description(_line: str) -> str | None:
    return None


def _read_prompt(filename: str) -> str:
    return files("roaster.prompts").joinpath(filename).read_text(encoding="utf-8").strip()


@cache
def _review_prompt_template() -> str:
    return files("roaster.prompts").joinpath("review_prompt.md").read_text(encoding="utf-8")


@cache
def _system_prompt_findings() -> str:
    return _read_prompt("review_system_findings.md")


@cache
def _system_prompt_text() -> str:
    return _read_prompt("review_system_text.md")


def _select_review_system_prompt(review_format: ReviewFormat) -> str:
    if review_format == "findings":
        return _system_prompt_findings()
    return _system_prompt_text()


def _assemble_review_prompt(
    *,
    review_definition: ReviewDefinition,
    local_diff: LocalDiff,
) -> str:
    return (
        _review_prompt_template()
        .format(
            review_name=review_definition.name,
            review_description=review_definition.description,
            review_instructions=review_definition.instructions,
            base_ref=local_diff.base_ref,
            diff_text=local_diff.diff_text,
        )
        .strip()
    )


def _claude_code_supports_model(model: str) -> bool:
    if model in _CLAUDE_CODE_MODEL_ALIASES:
        return True
    return any(model.startswith(prefix) for prefix in _CLAUDE_CODE_MODEL_PREFIXES)


def _claude_code_output_format(review_format: ReviewFormat) -> str:
    if review_format == "findings":
        return "json"
    return "stream-json"


def _claude_code_build_invocation(request: HarnessReviewRequest) -> HarnessProcessInvocation:
    # The user prompt is fed via stdin, not argv, so a large diff can never
    # trigger E2BIG when claude is execve'd. `--tools` is variadic, so it must
    # always be followed by another flag; keep `--model` immediately after it.
    output_format = _claude_code_output_format(request.review_format)
    argv = [
        CLAUDE_CODE_BINARY,
        "-p",
        "--output-format",
        output_format,
    ]
    if output_format == "stream-json":
        argv.append("--verbose")
    argv += [
        "--bare",
        # Read-only exploration only. Edit/Write stay out so a review run
        # cannot mutate the repo. In findings mode --json-schema also injects
        # the StructuredOutput tool, which the model uses to return findings.
        "--tools",
        _READ_ONLY_TOOLS,
        "--model",
        request.model,
        "--system-prompt",
        _select_review_system_prompt(request.review_format),
    ]
    if request.review_format == "findings":
        argv += ["--json-schema", json.dumps(_CLAUDE_FINDINGS_SCHEMA)]
    return HarnessProcessInvocation(
        argv=tuple(argv),
        stdin=_assemble_review_prompt(
            review_definition=request.review_definition,
            local_diff=request.local_diff,
        ),
    )


def _parse_findings_payload(
    payload: Any,
    usage: ReviewUsage | None,
) -> ReviewExecutionResponse | RoasterFailure:
    if not isinstance(payload, dict):
        return ClaudeCodeInvalidFindings(
            message="Claude Code review output must be a JSON object with a `findings` array.",
        )

    findings_payload = payload.get("findings")
    if not isinstance(findings_payload, list):
        return ClaudeCodeInvalidFindings(
            message="Claude Code review output must include a `findings` array.",
        )

    findings: list[ReviewFinding] = []
    for finding_payload in findings_payload:
        if not isinstance(finding_payload, dict):
            return ClaudeCodeInvalidFindings(
                message="Each review finding must be a JSON object.",
            )
        try:
            findings.append(ReviewFinding.from_json_dict(finding_payload))
        except ValueError as exc:
            return ClaudeCodeInvalidFindings(
                message=str(exc),
            )

    return ReviewExecutionResponse(
        payload=FindingsReview(findings=tuple(findings)),
        usage=usage,
    )


def _extract_usage(result_event: dict[str, Any]) -> ReviewUsage | None:
    total_cost_usd = result_event.get("total_cost_usd")
    duration_ms = result_event.get("duration_ms")
    num_turns = result_event.get("num_turns")
    usage_payload = result_event.get("usage")

    if not isinstance(usage_payload, dict):
        return None
    if not isinstance(total_cost_usd, (int, float)):
        return None
    if not isinstance(duration_ms, int):
        return None
    if not isinstance(num_turns, int):
        return None

    input_tokens = usage_payload.get("input_tokens")
    output_tokens = usage_payload.get("output_tokens")
    cache_creation_input_tokens = usage_payload.get("cache_creation_input_tokens")
    cache_read_input_tokens = usage_payload.get("cache_read_input_tokens")

    if not isinstance(input_tokens, int):
        return None
    if not isinstance(output_tokens, int):
        return None
    if not isinstance(cache_creation_input_tokens, int):
        return None
    if not isinstance(cache_read_input_tokens, int):
        return None

    return ReviewUsage(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_creation_input_tokens=cache_creation_input_tokens,
        cache_read_input_tokens=cache_read_input_tokens,
        total_cost_usd=float(total_cost_usd),
        duration_ms=duration_ms,
        num_turns=num_turns,
    )


def _iter_json_lines(stdout: str) -> list[dict[str, Any]] | RoasterFailure:
    events: list[dict[str, Any]] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            return ClaudeCodeInvalidJson(
                message=f"Unable to parse Claude Code stream-json line: {exc}",
            )
        if not isinstance(event, dict):
            return ClaudeCodeInvalidResponse(
                message="Each Claude Code stream-json event must be a JSON object.",
            )
        events.append(event)
    return events


def _truncate_prose(text: str, limit: int = _PROSE_SNIPPET_MAX_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def _find_result_event(events: list[dict[str, Any]]) -> dict[str, Any] | RoasterFailure:
    for event in events:
        if event.get("type") == "result":
            return event

    return ClaudeCodeMissingResultEvent(
        message=(
            "Claude Code output did not include a terminal `result` event. "
            "The harness may have been killed before finishing."
        ),
    )


def _extract_result_event(stdout: str) -> dict[str, Any] | RoasterFailure:
    if not stdout.strip():
        return ClaudeCodeEmptyOutput(
            message="Claude Code returned no output.",
        )

    events = _iter_json_lines(stdout)
    if isinstance(events, RoasterFailure):
        return events

    return _find_result_event(events)


def _extract_json_result(stdout: str) -> dict[str, Any] | RoasterFailure:
    if not stdout.strip():
        return ClaudeCodeEmptyOutput(
            message="Claude Code returned no output.",
        )

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        return ClaudeCodeInvalidJson(
            message=f"Unable to parse Claude Code JSON output: {exc}",
        )

    if isinstance(payload, dict):
        return payload

    if isinstance(payload, list):
        events: list[dict[str, Any]] = []
        for item in payload:
            if not isinstance(item, dict):
                return ClaudeCodeInvalidResponse(
                    message="Each Claude Code JSON event must be an object.",
                )
            events.append(item)
        return _find_result_event(events)

    return ClaudeCodeInvalidResponse(
        message="Claude Code JSON output must be an object.",
    )


def _claude_code_parse_stdout(
    request: HarnessReviewRequest,
    stdout: str,
) -> ReviewExecutionResponse | RoasterFailure:
    if request.review_format == "findings":
        result_event = _extract_json_result(stdout)
    else:
        result_event = _extract_result_event(stdout)
    if isinstance(result_event, RoasterFailure):
        return result_event

    usage = _extract_usage(result_event)

    if request.review_format == "text":
        result_text = result_event.get("result")
        if not isinstance(result_text, str):
            return ClaudeCodeInvalidResponse(
                message="Claude Code `result` must be a string.",
            )
        return ReviewExecutionResponse(payload=ProseReview(prose=result_text), usage=usage)

    structured = result_event.get("structured_output")
    if structured is not None:
        return _parse_findings_payload(structured, usage)

    result_text = result_event.get("result")
    if isinstance(result_text, str):
        prose = _truncate_prose(result_text.strip())
        return ClaudeCodeNonJsonResult(
            message=(
                "Claude Code did not return a structured_output payload.\n\n"
                f"Model response:\n{prose}\n\n"
                "Confirm --json-schema is being honored by the installed claude binary."
            ),
        )
    return ClaudeCodeInvalidResponse(
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


def _pump_stdin(stdin_stream: TextIO, stdin_payload: str) -> None:
    try:
        stdin_stream.write(stdin_payload)
    except BrokenPipeError:
        # The harness may exit before reading stdin; stdout/stderr handling reports failures.
        pass
    finally:
        stdin_stream.close()


_CLAUDE_CODE_HARNESS = HarnessDefinition(
    name=CLAUDE_CODE_NAME,
    binary=CLAUDE_CODE_BINARY,
    supports_model=_claude_code_supports_model,
    build_invocation=_claude_code_build_invocation,
    parse_stdout=_claude_code_parse_stdout,
    describe_event=_claude_code_describe_event,
)

_DEFAULT_HARNESSES: Mapping[str, HarnessDefinition] = MappingProxyType(
    {
        _CLAUDE_CODE_HARNESS.name: _CLAUDE_CODE_HARNESS,
    }
)


class HarnessRuntime:
    """Run parsed reviews through the configured harness implementations."""

    def __init__(
        self,
        *,
        progress_writer: ProgressWriter = silent_progress,
        binary_locator: BinaryLocator | None = None,
    ) -> None:
        self._progress_writer = progress_writer
        self._binary_locator = binary_locator or shutil.which
        self._harnesses = _DEFAULT_HARNESSES

    def list_harnesses(self) -> tuple[HarnessDetection, ...]:
        """Return detection information for every known harness."""
        detections: list[HarnessDetection] = []
        for definition in self._harnesses.values():
            detections.append(
                HarnessDetection(
                    name=definition.name,
                    binary=definition.binary,
                    path=self._binary_locator(definition.binary),
                )
            )
        return tuple(detections)

    def run_review(
        self,
        request: HarnessReviewRequest,
    ) -> ReviewExecutionResponse | RoasterFailure:
        """Execute a semantic review request through its selected harness."""
        definition = self._harnesses.get(request.harness_name)
        if definition is None:
            known = ", ".join(sorted(self._harnesses))
            return HarnessUnknown(
                message=f"Unknown harness {request.harness_name!r}. Known harnesses: {known}.",
            )

        if not definition.supports_model(request.model):
            return ModelNotSupportedByHarness(
                message=(
                    f"Model {request.model!r} is not supported by harness {definition.name!r}."
                ),
            )

        if self._binary_locator(definition.binary) is None:
            return HarnessBinaryMissing(
                message=(
                    f"Harness binary {definition.binary!r} is not on PATH. "
                    "Install the harness or pick a different one."
                ),
            )

        invocation = definition.build_invocation(request)
        stdin_arg = subprocess.PIPE if invocation.stdin is not None else subprocess.DEVNULL

        try:
            process = subprocess.Popen(
                list(invocation.argv),
                stdin=stdin_arg,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            return HarnessBinaryMissing(
                message=(
                    f"Harness binary {definition.binary!r} is not on PATH. "
                    "Install the harness or pick a different one."
                ),
            )
        except OSError as exc:
            return HarnessInvocationFailed(
                message=f"Unable to invoke {definition.binary!r}: {exc}",
            )

        writer_thread: threading.Thread | None = None
        if invocation.stdin is not None:
            if process.stdin is None:
                return HarnessInvocationFailed(
                    message=f"Unable to open stdin pipe for harness {definition.name!r}.",
                )
            writer_thread = threading.Thread(
                target=_pump_stdin,
                args=(process.stdin, invocation.stdin),
                daemon=True,
            )
            writer_thread.start()

        stdout_lines: list[str] = []
        if process.stdout is not None:
            for line in process.stdout:
                stdout_lines.append(line)
                description = definition.describe_event(line)
                if description is not None:
                    self._progress_writer(description)

        process.wait()
        if writer_thread is not None:
            writer_thread.join(timeout=5.0)
        stderr_text = ""
        if process.stderr is not None:
            stderr_text = process.stderr.read()

        if process.returncode != 0:
            stderr = stderr_text.strip()
            last_line = stdout_lines[-1].strip() if stdout_lines else ""
            return HarnessExecutionFailed(
                message=(
                    stderr
                    or last_line
                    or f"Harness {definition.name!r} exited with status {process.returncode}."
                ),
            )

        return definition.parse_stdout(request, "".join(stdout_lines))
