"""Domain models for roaster."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Literal, TypeAlias

from pydantic import Field, ValidationError, field_validator, model_serializer

from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.serialization import serialize_to_json_dict

Severity = Literal["info", "warning", "error"]
DiffChangeKind = Literal["added", "modified", "deleted", "renamed", "copied"]
StrictInt: TypeAlias = Annotated[int, Field(strict=True)]


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
class HarnessBinaryMissing:
    """The Claude Code binary is not on ``PATH``."""

    message: str


@dataclass(frozen=True)
class HarnessInvocationFailed:
    """Invoking Claude Code failed with an OS error."""

    message: str


@dataclass(frozen=True)
class HarnessExecutionFailed:
    """Claude Code ran but exited non-zero."""

    message: str


@dataclass(frozen=True)
class ModelNotSupportedByHarness:
    """The requested model is not supported by Claude Code."""

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


RoasterFailure: TypeAlias = (
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
    | HarnessBinaryMissing
    | HarnessInvocationFailed
    | HarnessExecutionFailed
    | ModelNotSupportedByHarness
    | ClaudeCodeEmptyOutput
    | ClaudeCodeInvalidJson
    | ClaudeCodeInvalidResponse
    | ClaudeCodeInvalidFindings
    | ReviewsDirMissing
    | ReviewsDirNotADirectory
    | ReviewKeyInvalid
    | ReviewKeyResolutionFailed
)


class RoasterError(Exception):
    """Base class for halt-worthy roaster failures surfaced as exceptions."""


class ReviewExecutorInvocationError(RoasterError):
    """The review executor subprocess could not be invoked at all."""


class ReviewDefinitionReadError(RoasterError):
    """The review-definition file exists but could not be read."""


class RepoRootUnavailableError(RoasterError):
    """The current git repository root could not be resolved."""


class GitInvocationFailedError(RoasterError):
    """A ``git`` subprocess could not be invoked (e.g. binary missing)."""


class GitDiffFailedError(RoasterError):
    """`git diff` exited non-zero while building the local diff."""


@dataclass(frozen=True)
class ReviewApplicability:
    """Repo-relative path patterns that determine whether a reviewer applies."""

    include: tuple[str, ...] = ()
    exclude: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReviewDefinition:
    """Parsed markdown definition of a CI reviewer."""

    name: str
    description: str
    instructions: str
    default_model: str | None
    applicability: ReviewApplicability = ReviewApplicability()


@dataclass(frozen=True)
class ReviewSource:
    """Markdown source for a review definition loaded from the environment."""

    key: str
    path: Path
    source: str


@dataclass(frozen=True)
class ReviewCatalog:
    """Catalog of markdown review keys available in the environment."""

    reviews_dir: Path
    keys: tuple[str, ...]


@dataclass(frozen=True)
class DiffFile:
    """One file's slice of a unified diff, with size metrics."""

    path: str
    old_path: str | None
    change_kind: DiffChangeKind
    raw_text: str
    is_binary: bool
    added_lines: int
    removed_lines: int
    hunk_count: int
    byte_size: int
    estimated_tokens: int


@dataclass(frozen=True)
class LocalDiff:
    """Diff content to review."""

    base_ref: str
    diff_text: str
    changed_paths: tuple[str, ...] = ()
    files: tuple[DiffFile, ...] = ()

    @classmethod
    def from_diff_text(
        cls,
        *,
        base_ref: str,
        diff_text: str,
        changed_paths: tuple[str, ...] = (),
    ) -> LocalDiff:
        from roaster.diff_parsing import parse_unified_diff

        return cls(
            base_ref=base_ref,
            diff_text=diff_text,
            changed_paths=changed_paths,
            files=parse_unified_diff(diff_text),
        )


@dataclass(frozen=True)
class DiffReviewTarget:
    """Current-branch diff target for a review invocation."""

    local_diff: LocalDiff


def _reject_blank_string(value: str) -> str:
    if not value.strip():
        raise ValueError("must be non-empty")
    return value


class ReviewFinding(ClinkrModel):
    """One actionable PR-diff finding emitted by the reviewer."""

    path: str = Field(min_length=1)
    line: StrictInt | None
    severity: Severity
    summary: str = Field(min_length=1)
    details: str = Field(min_length=1)

    @field_validator("path", "summary", "details")
    @classmethod
    def _reject_blank_strings(cls, value: str) -> str:
        return _reject_blank_string(value)

    @classmethod
    def diff_line(
        cls,
        *,
        path: str,
        line: int | None,
        severity: Severity,
        summary: str,
        details: str,
    ) -> ReviewFinding:
        return cls(path=path, line=line, severity=severity, summary=summary, details=details)

    @classmethod
    def from_json_dict(cls, data: dict[str, Any]) -> ReviewFinding:
        allowed_fields = {"path", "line", "severity", "summary", "details"}
        unknown_fields = sorted(set(data) - allowed_fields)
        if unknown_fields:
            field_list = ", ".join(unknown_fields)
            raise ValueError(f"Unknown review-finding fields: {field_list}")

        required_fields = {"path", "severity", "summary", "details"}
        missing = sorted(field for field in required_fields if field not in data)
        if missing:
            field_list = ", ".join(missing)
            raise ValueError(f"Missing review-finding fields: {field_list}")

        try:
            return cls.model_validate(data)
        except ValidationError as exc:
            raise ValueError(str(exc)) from exc

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "line": self.line,
            "severity": self.severity,
            "summary": self.summary,
            "details": self.details,
        }


class ClaudeDiffFinding(ClinkrModel):
    """Claude-facing diff finding contract using path/line only."""

    path: str = Field(min_length=1)
    line: StrictInt | None
    severity: Severity
    summary: str = Field(min_length=1)
    details: str = Field(min_length=1)

    @field_validator("path", "summary", "details")
    @classmethod
    def _reject_blank_strings(cls, value: str) -> str:
        return _reject_blank_string(value)

    def to_review_finding(self) -> ReviewFinding:
        return ReviewFinding(
            path=self.path,
            line=self.line,
            severity=self.severity,
            summary=self.summary,
            details=self.details,
        )


class ClaudeDiffFindingsOutput(ClinkrModel):
    """Structured-output schema for diff review findings."""

    findings: tuple[ClaudeDiffFinding, ...]


class FindingsReview(ClinkrModel):
    """A review payload carrying structured findings."""

    findings: tuple[ReviewFinding, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "format": "findings",
            "findings": [finding.to_json_dict() for finding in self.findings],
            "count": len(self.findings),
        }


ReviewPayload: TypeAlias = FindingsReview


class ReviewUsage(ClinkrModel):
    """Cost and token usage statistics from a Claude Code run."""

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
    """Structured result returned by the CI roaster CLI."""

    review_name: str
    review_path: str
    model: str
    base_ref: str | None
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


@dataclass(frozen=True)
class ResolvedReviewRunPlan:
    """Execution facts resolved before invoking Claude Code."""

    review_name: str
    model: str
    base_ref: str | None
    changed_path_count: int | None
