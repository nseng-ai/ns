"""Domain models for asdl-reviewer."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, TypeAlias

from pydantic import model_serializer

from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.serialization import serialize_to_json_dict

Severity = Literal["info", "warning", "error"]
_VALID_SEVERITIES = {"info", "warning", "error"}

ReviewFormat = Literal["findings", "text"]


@dataclass(frozen=True)
class InvalidReviewDefinition:
    """The markdown review definition failed validation."""

    message: str


@dataclass(frozen=True)
class ModelNotProvided:
    """No executor model was provided and the definition has no default."""

    message: str


@dataclass(frozen=True)
class ExecutorCommandMissing:
    """The executor command was empty after shell-parsing."""

    message: str


@dataclass(frozen=True)
class ExecutorCommandInvalid:
    """The executor command could not be shell-parsed."""

    message: str


@dataclass(frozen=True)
class ReviewExecutionFailed:
    """The executor ran but exited with a non-zero status."""

    message: str


@dataclass(frozen=True)
class ReviewExecutionInvalidResponse:
    """The executor output was structurally invalid."""

    message: str


@dataclass(frozen=True)
class ReviewExecutionInvalidJson:
    """The executor output was not valid JSON."""

    message: str


@dataclass(frozen=True)
class ReviewDefinitionNotFound:
    """The review-definition path does not exist on disk."""

    path: Path
    message: str


@dataclass(frozen=True)
class ReviewDefinitionNotAFile:
    """The review-definition path exists but is not a regular file."""

    path: Path
    message: str


@dataclass(frozen=True)
class BaseRefUnavailable:
    """A base git ref was not provided and could not be resolved."""

    message: str


@dataclass(frozen=True)
class HarnessNotConfigured:
    """No harness could be resolved via flag, env var, or auto-detection on PATH."""

    message: str


@dataclass(frozen=True)
class HarnessUnknown:
    """The requested harness name is not registered."""

    message: str


@dataclass(frozen=True)
class HarnessBinaryMissing:
    """The harness binary is not on ``PATH``."""

    message: str


@dataclass(frozen=True)
class HarnessInvocationFailed:
    """Invoking the harness subprocess failed with an OS error."""

    message: str


@dataclass(frozen=True)
class HarnessExecutionFailed:
    """The harness subprocess ran but exited non-zero."""

    message: str


@dataclass(frozen=True)
class ModelNotSupportedByHarness:
    """The requested model is not supported by the selected harness."""

    message: str


@dataclass(frozen=True)
class ClaudeCodeEmptyOutput:
    """Claude Code returned no stdout."""

    message: str


@dataclass(frozen=True)
class ClaudeCodeInvalidJson:
    """Claude Code stdout was not valid JSON."""

    message: str


@dataclass(frozen=True)
class ClaudeCodeInvalidResponse:
    """Claude Code JSON response was missing required fields."""

    message: str


@dataclass(frozen=True)
class ClaudeCodeMissingResultEvent:
    """Claude Code stream-json output did not include a terminal ``result`` event."""

    message: str


@dataclass(frozen=True)
class ClaudeCodeNonJsonResult:
    """Claude Code's ``result`` field was prose rather than JSON."""

    message: str


@dataclass(frozen=True)
class ClaudeCodeInvalidFindings:
    """Claude Code's parsed findings payload was malformed."""

    message: str


@dataclass(frozen=True)
class ReviewsDirMissing:
    """The ``reviews/`` directory does not exist at the repo root."""

    message: str


@dataclass(frozen=True)
class ReviewsDirNotADirectory:
    """The ``reviews`` path exists but is not a directory."""

    message: str


@dataclass(frozen=True)
class ReviewKeyInvalid:
    """The review key is empty, absolute, or contains traversal segments."""

    message: str


@dataclass(frozen=True)
class ReviewKeyResolutionFailed:
    """Resolving the review key to an absolute path failed with an OS error."""

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


class FindingsReview(ClinkrModel):
    """A review payload carrying structured findings."""

    findings: tuple[ReviewFinding, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "format": "findings",
            "findings": [dataclasses.asdict(finding) for finding in self.findings],
            "count": len(self.findings),
        }


class ProseReview(ClinkrModel):
    """A review payload carrying a human-readable markdown review."""

    prose: str

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
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


class ReviewUsage(ClinkrModel):
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


class LocalReviewResult(ClinkrModel):
    """Structured result returned by the local reviewer CLI."""

    review_name: str
    review_path: str
    model: str
    base_ref: str
    payload: ReviewPayload
    usage: ReviewUsage | None = None

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        """Serialize the local-review result for JSON output."""
        return {
            "review_name": self.review_name,
            "review_path": self.review_path,
            "model": self.model,
            "base_ref": self.base_ref,
            "usage": serialize_to_json_dict(self.usage) if self.usage else None,
            **serialize_to_json_dict(self.payload),
        }
