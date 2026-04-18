"""Domain models for twerk-reviewer."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar, Literal, TypeAlias

Severity = Literal["info", "warning", "error"]
_VALID_SEVERITIES = {"info", "warning", "error"}


@dataclass(frozen=True)
class InvalidReviewDefinition:
    """The markdown review definition failed validation."""

    ERROR_TYPE: ClassVar[str] = "invalid_review_definition"
    message: str


@dataclass(frozen=True)
class ModelNotProvided:
    """No executor model was provided and the definition has no default."""

    ERROR_TYPE: ClassVar[str] = "model_not_provided"
    message: str


@dataclass(frozen=True)
class ExecutorCommandMissing:
    """The executor command was empty after shell-parsing."""

    ERROR_TYPE: ClassVar[str] = "executor_command_missing"
    message: str


@dataclass(frozen=True)
class ExecutorCommandInvalid:
    """The executor command could not be shell-parsed."""

    ERROR_TYPE: ClassVar[str] = "executor_command_invalid"
    message: str


@dataclass(frozen=True)
class ReviewExecutionFailed:
    """The executor ran but exited with a non-zero status."""

    ERROR_TYPE: ClassVar[str] = "review_execution_failed"
    message: str


@dataclass(frozen=True)
class ReviewExecutionInvalidResponse:
    """The executor output was structurally invalid."""

    ERROR_TYPE: ClassVar[str] = "review_execution_invalid_response"
    message: str


@dataclass(frozen=True)
class ReviewExecutionInvalidJson:
    """The executor output was not valid JSON."""

    ERROR_TYPE: ClassVar[str] = "review_execution_invalid_json"
    message: str


@dataclass(frozen=True)
class ReviewDefinitionNotFound:
    """The review-definition path does not exist on disk."""

    ERROR_TYPE: ClassVar[str] = "review_definition_not_found"
    path: Path
    message: str


@dataclass(frozen=True)
class ReviewDefinitionNotAFile:
    """The review-definition path exists but is not a regular file."""

    ERROR_TYPE: ClassVar[str] = "review_definition_not_a_file"
    path: Path
    message: str


@dataclass(frozen=True)
class BaseRefUnavailable:
    """A base git ref was not provided and could not be resolved."""

    ERROR_TYPE: ClassVar[str] = "base_ref_unavailable"
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
)


class ReviewerError(Exception):
    """Base class for halt-worthy reviewer failures surfaced as exceptions."""


class ReviewExecutorInvocationError(ReviewerError):
    """The review executor subprocess could not be invoked at all."""


class ReviewDefinitionReadError(ReviewerError):
    """The review-definition file exists but could not be read."""


class RepoRootUnavailableError(ReviewerError):
    """The current git repository root could not be resolved."""


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

    def to_json_dict(self) -> dict[str, Any]:
        """Serialize the finding for JSON output."""
        return {
            "path": self.path,
            "line": self.line,
            "severity": self.severity,
            "summary": self.summary,
            "details": self.details,
        }


@dataclass(frozen=True)
class ReviewExecutionRequest:
    """Request sent to the local review executor command."""

    executor_command: str
    model: str
    prompt: str
    review_name: str
    review_description: str
    review_instructions: str
    base_ref: str
    diff_text: str

    def to_json_dict(self) -> dict[str, Any]:
        """Serialize the executor request as JSON."""
        return {
            "review_name": self.review_name,
            "review_description": self.review_description,
            "review_instructions": self.review_instructions,
            "model": self.model,
            "base_ref": self.base_ref,
            "diff_text": self.diff_text,
            "prompt": self.prompt,
        }


@dataclass(frozen=True)
class ReviewExecutionResponse:
    """Structured findings returned by the review executor."""

    findings: tuple[ReviewFinding, ...]


@dataclass(frozen=True)
class LocalReviewResult:
    """Structured result returned by the local reviewer CLI."""

    review_name: str
    review_path: str
    model: str
    base_ref: str
    findings: tuple[ReviewFinding, ...]

    def to_json_dict(self) -> dict[str, Any]:
        """Serialize the local-review result for JSON output."""
        return {
            "review_name": self.review_name,
            "review_path": self.review_path,
            "model": self.model,
            "base_ref": self.base_ref,
            "findings": [finding.to_json_dict() for finding in self.findings],
            "count": len(self.findings),
        }
