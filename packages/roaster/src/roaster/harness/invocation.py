"""Claude Code invocation for CI PR-diff findings reviews."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import cache
from importlib.resources import files
from types import MappingProxyType
from typing import Any, TextIO

from pydantic import ValidationError

from roaster.models import (
    ClaudeCodeEmptyOutput,
    ClaudeCodeInvalidFindings,
    ClaudeCodeInvalidJson,
    ClaudeCodeInvalidResponse,
    ClaudeDiffFindingsOutput,
    DiffReviewTarget,
    FindingsReview,
    HarnessBinaryMissing,
    HarnessDetection,
    HarnessExecutionFailed,
    HarnessInvocationFailed,
    HarnessUnknown,
    ModelNotSupportedByHarness,
    ReviewDefinition,
    ReviewExecutionResponse,
    ReviewUsage,
    RoasterFailure,
)

ProgressWriter = Callable[[str], None]
BinaryLocator = Callable[[str], str | None]


@dataclass(frozen=True)
class HarnessReviewRequest:
    """Semantic request for running a parsed review through Claude Code."""

    harness_name: str
    model: str
    review_definition: ReviewDefinition
    target: DiffReviewTarget


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


def silent_progress(_msg: str) -> None:
    """Ignore harness progress messages."""
    return None


def _read_prompt(filename: str) -> str:
    return files("roaster.prompts").joinpath(filename).read_text(encoding="utf-8").strip()


@cache
def _review_prompt_template() -> str:
    return files("roaster.prompts").joinpath("review_prompt.md").read_text(encoding="utf-8")


@cache
def _system_prompt_findings() -> str:
    return _read_prompt("review_system_findings.md")


def _assemble_review_prompt(
    *,
    review_definition: ReviewDefinition,
    target: DiffReviewTarget,
) -> str:
    local_diff = target.local_diff
    return (
        _review_prompt_template()
        .format(
            review_name=review_definition.name,
            review_description=review_definition.description,
            review_instructions=review_definition.instructions,
            base_ref=local_diff.base_ref,
            changed_path_count=len(local_diff.changed_paths),
            changed_paths=_changed_paths_block(local_diff.changed_paths),
            diff_block=_render_prompt_fence(local_diff.diff_text, language="diff"),
        )
        .strip()
    )


def _changed_paths_block(changed_paths: tuple[str, ...]) -> str:
    if not changed_paths:
        return "(no changed paths reported)"
    return "\n".join(f"- {path}" for path in changed_paths)


def _render_prompt_fence(content: str, *, language: str) -> str:
    fence = _collision_free_backtick_fence(content)
    return "\n".join((f"{fence}{language}", content, fence))


def _collision_free_backtick_fence(content: str) -> str:
    longest_run = max((len(match) for match in re.findall(r"`+", content)), default=0)
    return "`" * max(3, longest_run + 1)


def _claude_code_supports_model(model: str) -> bool:
    if model in _CLAUDE_CODE_MODEL_ALIASES:
        return True
    return any(model.startswith(prefix) for prefix in _CLAUDE_CODE_MODEL_PREFIXES)


def _claude_diff_findings_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "path": {"type": "string", "minLength": 1},
                        "line": {"type": ["integer", "null"]},
                        "severity": {"type": "string", "enum": ["info", "warning", "error"]},
                        "summary": {"type": "string", "minLength": 1},
                        "details": {"type": "string", "minLength": 1},
                    },
                    "required": ["path", "line", "severity", "summary", "details"],
                },
            }
        },
        "required": ["findings"],
    }


def _claude_code_build_invocation(request: HarnessReviewRequest) -> HarnessProcessInvocation:
    # The user prompt is fed via stdin, not argv, so a large diff can never
    # trigger E2BIG when claude is execve'd. `--tools` is variadic, so it must
    # always be followed by another flag; keep `--model` immediately after it.
    argv = [
        CLAUDE_CODE_BINARY,
        "-p",
        "--output-format",
        "json",
        "--bare",
        # Read-only exploration only. Edit/Write stay out so a review run
        # cannot mutate the repo. --json-schema injects StructuredOutput.
        "--tools",
        _READ_ONLY_TOOLS,
        "--model",
        request.model,
        "--system-prompt",
        _system_prompt_findings(),
        "--json-schema",
        json.dumps(_claude_diff_findings_schema()),
    ]
    return HarnessProcessInvocation(
        argv=tuple(argv),
        stdin=_assemble_review_prompt(
            review_definition=request.review_definition,
            target=request.target,
        ),
    )


def _parse_findings_payload(
    payload: Any,
    usage: ReviewUsage | None,
) -> ReviewExecutionResponse | RoasterFailure:
    findings_output = _validate_findings_output(payload)
    if isinstance(findings_output, RoasterFailure):
        return findings_output

    findings = tuple(finding.to_review_finding() for finding in findings_output.findings)
    return ReviewExecutionResponse(
        payload=FindingsReview(findings=findings),
        usage=usage,
    )


def _validate_findings_output(payload: Any) -> ClaudeDiffFindingsOutput | RoasterFailure:
    try:
        return ClaudeDiffFindingsOutput.model_validate(payload)
    except ValidationError as exc:
        return ClaudeCodeInvalidFindings(
            message=f"Claude Code review output did not match the diff findings schema: {exc}",
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


def _find_result_event(events: list[dict[str, Any]]) -> dict[str, Any] | RoasterFailure:
    for event in events:
        if event.get("type") == "result":
            return event

    return ClaudeCodeInvalidResponse(
        message=(
            "Claude Code output did not include a terminal `result` event. "
            "The harness may have been killed before finishing."
        ),
    )


def _truncate_prose(text: str, limit: int = _PROSE_SNIPPET_MAX_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def _claude_code_parse_stdout(
    request: HarnessReviewRequest,
    stdout: str,
) -> ReviewExecutionResponse | RoasterFailure:
    result_event = _extract_json_result(stdout)
    if isinstance(result_event, RoasterFailure):
        return result_event

    usage = _extract_usage(result_event)
    structured = result_event.get("structured_output")
    if structured is not None:
        return _parse_findings_payload(structured, usage)

    result_text = result_event.get("result")
    if isinstance(result_text, str):
        prose = _truncate_prose(result_text.strip())
        return ClaudeCodeInvalidResponse(
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
    """Run parsed reviews through the internal Claude Code harness."""

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
        """Return detection information for the internal harness."""
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
        """Execute a semantic review request through Claude Code."""
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
                    f"Harness binary {definition.binary!r} is not on PATH. Install Claude Code."
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
                    f"Harness binary {definition.binary!r} is not on PATH. Install Claude Code."
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
