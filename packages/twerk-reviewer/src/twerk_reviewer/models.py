"""Domain models for twerk-reviewer."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar, Literal, TypeAlias

from twerk_core.clinkr.dataclass_json import JsonSerializable

Severity = Literal["info", "warning", "error"]
_VALID_SEVERITIES = {"info", "warning", "error"}

ReviewFormat = Literal["findings", "text"]


class _HasErrorType:
    """Mixin exposing the class-level ``ERROR_TYPE`` as an ``error_type`` property."""

    ERROR_TYPE: ClassVar[str]

    @property
    def error_type(self) -> str:
        return type(self).ERROR_TYPE


@dataclass(frozen=True)
class InvalidReviewDefinition(_HasErrorType):
    """The markdown review definition failed validation."""

    ERROR_TYPE: ClassVar[str] = "invalid_review_definition"
    message: str


@dataclass(frozen=True)
class ModelNotProvided(_HasErrorType):
    """No executor model was provided and the definition has no default."""

    ERROR_TYPE: ClassVar[str] = "model_not_provided"
    message: str


@dataclass(frozen=True)
class ExecutorCommandMissing(_HasErrorType):
    """The executor command was empty after shell-parsing."""

    ERROR_TYPE: ClassVar[str] = "executor_command_missing"
    message: str


@dataclass(frozen=True)
class ExecutorCommandInvalid(_HasErrorType):
    """The executor command could not be shell-parsed."""

    ERROR_TYPE: ClassVar[str] = "executor_command_invalid"
    message: str


@dataclass(frozen=True)
class ReviewExecutionFailed(_HasErrorType):
    """The executor ran but exited with a non-zero status."""

    ERROR_TYPE: ClassVar[str] = "review_execution_failed"
    message: str


@dataclass(frozen=True)
class ReviewExecutionInvalidResponse(_HasErrorType):
    """The executor output was structurally invalid."""

    ERROR_TYPE: ClassVar[str] = "review_execution_invalid_response"
    message: str


@dataclass(frozen=True)
class ReviewExecutionInvalidJson(_HasErrorType):
    """The executor output was not valid JSON."""

    ERROR_TYPE: ClassVar[str] = "review_execution_invalid_json"
    message: str


@dataclass(frozen=True)
class ReviewDefinitionNotFound(_HasErrorType):
    """The review-definition path does not exist on disk."""

    ERROR_TYPE: ClassVar[str] = "review_definition_not_found"
    path: Path
    message: str


@dataclass(frozen=True)
class ReviewDefinitionNotAFile(_HasErrorType):
    """The review-definition path exists but is not a regular file."""

    ERROR_TYPE: ClassVar[str] = "review_definition_not_a_file"
    path: Path
    message: str


@dataclass(frozen=True)
class BaseRefUnavailable(_HasErrorType):
    """A base git ref was not provided and could not be resolved."""

    ERROR_TYPE: ClassVar[str] = "base_ref_unavailable"
    message: str


@dataclass(frozen=True)
class HarnessNotConfigured(_HasErrorType):
    """No harness could be resolved via flag, env var, or auto-detection on PATH."""

    ERROR_TYPE: ClassVar[str] = "harness_not_configured"
    message: str


@dataclass(frozen=True)
class HarnessUnknown(_HasErrorType):
    """The requested harness name is not registered."""

    ERROR_TYPE: ClassVar[str] = "harness_unknown"
    message: str


@dataclass(frozen=True)
class HarnessBinaryMissing(_HasErrorType):
    """The harness binary is not on ``PATH``."""

    ERROR_TYPE: ClassVar[str] = "harness_binary_missing"
    message: str


@dataclass(frozen=True)
class HarnessInvocationFailed(_HasErrorType):
    """Invoking the harness subprocess failed with an OS error."""

    ERROR_TYPE: ClassVar[str] = "harness_invocation_failed"
    message: str


@dataclass(frozen=True)
class HarnessExecutionFailed(_HasErrorType):
    """The harness subprocess ran but exited non-zero."""

    ERROR_TYPE: ClassVar[str] = "harness_execution_failed"
    message: str


@dataclass(frozen=True)
class ModelNotSupportedByHarness(_HasErrorType):
    """The requested model is not supported by the selected harness."""

    ERROR_TYPE: ClassVar[str] = "model_not_supported_by_harness"
    message: str


@dataclass(frozen=True)
class ClaudeCodeEmptyOutput(_HasErrorType):
    """Claude Code returned no stdout."""

    ERROR_TYPE: ClassVar[str] = "claude_code_empty_output"
    message: str


@dataclass(frozen=True)
class ClaudeCodeInvalidJson(_HasErrorType):
    """Claude Code stdout was not valid JSON."""

    ERROR_TYPE: ClassVar[str] = "claude_code_invalid_json"
    message: str


@dataclass(frozen=True)
class ClaudeCodeInvalidResponse(_HasErrorType):
    """Claude Code JSON response was missing required fields."""

    ERROR_TYPE: ClassVar[str] = "claude_code_invalid_response"
    message: str


@dataclass(frozen=True)
class ClaudeCodeMissingResultEvent(_HasErrorType):
    """Claude Code stream-json output did not include a terminal ``result`` event."""

    ERROR_TYPE: ClassVar[str] = "claude_code_missing_result_event"
    message: str


@dataclass(frozen=True)
class ClaudeCodeNonJsonResult(_HasErrorType):
    """Claude Code's ``result`` field was prose rather than JSON."""

    ERROR_TYPE: ClassVar[str] = "claude_code_non_json_result"
    message: str


@dataclass(frozen=True)
class ClaudeCodeInvalidFindings(_HasErrorType):
    """Claude Code's parsed findings payload was malformed."""

    ERROR_TYPE: ClassVar[str] = "claude_code_invalid_findings"
    message: str


@dataclass(frozen=True)
class ReviewsDirMissing(_HasErrorType):
    """The ``reviews/`` directory does not exist at the repo root."""

    ERROR_TYPE: ClassVar[str] = "reviews_dir_missing"
    message: str


@dataclass(frozen=True)
class ReviewsDirNotADirectory(_HasErrorType):
    """The ``reviews`` path exists but is not a directory."""

    ERROR_TYPE: ClassVar[str] = "reviews_dir_not_a_directory"
    message: str


@dataclass(frozen=True)
class ReviewKeyInvalid(_HasErrorType):
    """The review key is empty, absolute, or contains traversal segments."""

    ERROR_TYPE: ClassVar[str] = "review_key_invalid"
    message: str


@dataclass(frozen=True)
class ReviewKeyResolutionFailed(_HasErrorType):
    """Resolving the review key to an absolute path failed with an OS error."""

    ERROR_TYPE: ClassVar[str] = "review_key_resolution_failed"
    message: str


ReviewerFailure: TypeAlias = (
    InvalidReviewDefinition
    | ModelNotProvided
    | ExecutorCommandMissing
    | ExecutorCommandInvalid
    | ReviewExecutionFailed
    | ReviewExecutionInvalidResponse
    | ReviewExecutionInvalidJson
    | ReviewDefinitionNotFound
    | ReviewDefinitionNotAFile
    | BaseRefUnavailable
    | HarnessNotConfigured
    | HarnessUnknown
    | HarnessBinaryMissing
    | HarnessInvocationFailed
    | HarnessExecutionFailed
    | ModelNotSupportedByHarness
    | ClaudeCodeEmptyOutput
    | ClaudeCodeInvalidJson
    | ClaudeCodeInvalidResponse
    | ClaudeCodeMissingResultEvent
    | ClaudeCodeNonJsonResult
    | ClaudeCodeInvalidFindings
    | ReviewsDirMissing
    | ReviewsDirNotADirectory
    | ReviewKeyInvalid
    | ReviewKeyResolutionFailed
)


class ReviewerError(Exception):
    """Base class for halt-worthy reviewer failures surfaced as exceptions."""


class ReviewExecutorInvocationError(ReviewerError):
    """The review executor subprocess could not be invoked at all."""


class ReviewDefinitionReadError(ReviewerError):
    """The review-definition file exists but could not be read."""


class RepoRootUnavailableError(ReviewerError):
    """The current git repository root could not be resolved."""


class GitInvocationFailedError(ReviewerError):
    """A ``git`` subprocess could not be invoked (e.g. binary missing)."""


class GitDiffFailedError(ReviewerError):
    """`git diff` exited non-zero while building the local diff."""


@dataclass(frozen=True)
class ReviewDefinition:
    """Parsed markdown definition of a reviewer."""

    name: str
    description: str
    instructions: str
    default_model: str | None


@dataclass(frozen=True)
class LocalDiff:
    """Diff content to review."""

    base_ref: str
    diff_text: str


@dataclass(frozen=True)
class ReviewFinding:
    """One actionable review finding emitted by the executor."""

    path: str
    line: int | None
    severity: Severity
    summary: str
    details: str

    @classmethod
    def from_json_dict(cls, data: dict[str, Any]) -> ReviewFinding:
        required_fields = {"path", "line", "severity", "summary", "details"}
        unknown_fields = sorted(set(data) - required_fields)
        if unknown_fields:
            field_list = ", ".join(unknown_fields)
            raise ValueError(f"Unknown review-finding fields: {field_list}")

        missing_fields = sorted(field for field in required_fields if field not in data)
        if missing_fields:
            field_list = ", ".join(missing_fields)
            raise ValueError(f"Missing review-finding fields: {field_list}")

        path = data["path"]
        line = data["line"]
        severity = data["severity"]
        summary = data["summary"]
        details = data["details"]

        if not isinstance(path, str) or not path.strip():
            raise ValueError("Review finding field `path` must be a non-empty string.")
        if line is not None and not isinstance(line, int):
            raise ValueError("Review finding field `line` must be an integer or null.")
        if severity not in _VALID_SEVERITIES:
            valid_values = ", ".join(sorted(_VALID_SEVERITIES))
            raise ValueError(f"Review finding field `severity` must be one of: {valid_values}")
        if not isinstance(summary, str) or not summary.strip():
            raise ValueError("Review finding field `summary` must be a non-empty string.")
        if not isinstance(details, str) or not details.strip():
            raise ValueError("Review finding field `details` must be a non-empty string.")

        return cls(
            path=path,
            line=line,
            severity=severity,
            summary=summary,
            details=details,
        )


@dataclass(frozen=True)
class FindingsReview(JsonSerializable):
    """A review payload carrying structured findings."""

    findings: tuple[ReviewFinding, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "format": "findings",
            "findings": [dataclasses.asdict(finding) for finding in self.findings],
            "count": len(self.findings),
        }


@dataclass(frozen=True)
class ProseReview(JsonSerializable):
    """A review payload carrying a human-readable markdown review."""

    prose: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "format": "text",
            "prose": self.prose,
        }


ReviewPayload = FindingsReview | ProseReview


@dataclass(frozen=True)
class ReviewExecutionRequest:
    """Request dispatched to a harness adapter for execution."""

    adapter_name: str
    model: str
    prompt: str
    system_prompt: str
    review_format: ReviewFormat
    review_name: str
    review_description: str
    review_instructions: str
    base_ref: str
    diff_text: str


@dataclass(frozen=True)
class ReviewUsage:
    """Cost and token usage statistics from a harness run."""

    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    total_cost_usd: float
    duration_ms: int
    num_turns: int

    @property
    def total_input_tokens(self) -> int:
        return self.input_tokens + self.cache_creation_input_tokens + self.cache_read_input_tokens


@dataclass(frozen=True)
class ReviewExecutionResponse:
    """Structured review payload returned by the review executor."""

    payload: ReviewPayload
    usage: ReviewUsage | None = None


@dataclass(frozen=True)
class LocalReviewResult(JsonSerializable):
    """Structured result returned by the local reviewer CLI."""

    review_name: str
    review_path: str
    model: str
    base_ref: str
    payload: ReviewPayload
    usage: ReviewUsage | None = None

    def to_json_dict(self) -> dict[str, Any]:
        """Serialize the local-review result for JSON output."""
        return {
            "review_name": self.review_name,
            "review_path": self.review_path,
            "model": self.model,
            "base_ref": self.base_ref,
            "usage": dataclasses.asdict(self.usage) if self.usage else None,
            **self.payload.to_json_dict(),
        }
