"""Domain models for roaster."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Literal, TypeAlias

from pydantic import Field, ValidationError, field_validator, model_serializer, model_validator

from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.serialization import serialize_to_json_dict

Severity = Literal["info", "warning", "error"]
_VALID_SEVERITIES = {"info", "warning", "error"}

ReviewFormat = Literal["findings", "text"]
TargetKind = Literal["diff", "document"]


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
class HarnessDetection:
    """Whether a harness binary is installed, and where it lives on PATH."""

    name: str
    binary: str
    path: str | None

    @property
    def available(self) -> bool:
        return self.path is not None


@dataclass(frozen=True)
class ReviewDefinition:
    """Parsed markdown definition of a reviewer."""

    name: str
    description: str
    instructions: str
    default_model: str | None
    when_changed: tuple[str, ...] = ()


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
class LocalDiff:
    """Diff content to review."""

    base_ref: str
    diff_text: str
    changed_paths: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReviewContextFragment:
    """Additive context supplied for one review invocation."""

    label: str
    content: str


@dataclass(frozen=True)
class DiffReviewTarget:
    """Current-branch diff target for a review invocation."""

    kind: Literal["diff"]
    local_diff: LocalDiff


@dataclass(frozen=True)
class DocumentReviewTarget:
    """Document or artifact target for a review invocation."""

    kind: Literal["document"]
    content: str
    label: str
    source_path: str | None = None


ReviewTarget: TypeAlias = DiffReviewTarget | DocumentReviewTarget


class GlobalLocation(ClinkrModel):
    """Finding applies to the whole reviewed target."""

    kind: Literal["global"]


class TextAnchorLocation(ClinkrModel):
    """Finding is grounded in exact text from a document target."""

    kind: Literal["text_anchor"]
    text: str = Field(min_length=1)
    section: str | None = None
    occurrence: int | None = None
    context: str | None = None

    @field_validator("text", "section", "context")
    @classmethod
    def _reject_blank_strings(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("must be non-empty when provided")
        return value


class DiffLineLocation(ClinkrModel):
    """Finding is grounded in a file/line in a unified diff."""

    kind: Literal["diff_line"]
    path: str = Field(min_length=1)
    line: int | None

    @field_validator("path")
    @classmethod
    def _reject_blank_path(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must be non-empty")
        return value


ReviewLocation: TypeAlias = Annotated[
    GlobalLocation | TextAnchorLocation | DiffLineLocation,
    Field(discriminator="kind"),
]
DocumentReviewLocation: TypeAlias = Annotated[
    GlobalLocation | TextAnchorLocation,
    Field(discriminator="kind"),
]


class ReviewFinding(ClinkrModel):
    """One actionable review finding emitted by the executor."""

    path: str | None = None
    line: int | None = None
    severity: Severity
    summary: str = Field(min_length=1)
    details: str = Field(min_length=1)
    location: ReviewLocation | None = None

    @field_validator("path", "summary", "details")
    @classmethod
    def _reject_blank_strings(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("must be non-empty when provided")
        return value

    @model_validator(mode="after")
    def _fill_legacy_diff_fields_from_location(self) -> ReviewFinding:
        if isinstance(self.location, DiffLineLocation):
            path = self.path or self.location.path
            line = self.line if self.line is not None else self.location.line
            return self.model_copy(update={"path": path, "line": line})
        return self

    @classmethod
    def from_json_dict(cls, data: dict[str, Any]) -> ReviewFinding:
        allowed_fields = {"path", "line", "location", "severity", "summary", "details"}
        unknown_fields = sorted(set(data) - allowed_fields)
        if unknown_fields:
            field_list = ", ".join(unknown_fields)
            raise ValueError(f"Unknown review-finding fields: {field_list}")

        required_common_fields = {"severity", "summary", "details"}
        missing_common = sorted(field for field in required_common_fields if field not in data)
        if missing_common:
            field_list = ", ".join(missing_common)
            raise ValueError(f"Missing review-finding fields: {field_list}")

        _validate_finding_common_payload(data)

        if "location" not in data:
            missing_legacy_fields = sorted(field for field in ("path", "line") if field not in data)
            if missing_legacy_fields:
                field_list = ", ".join(missing_legacy_fields)
                raise ValueError(
                    "Review finding must include `location` or legacy diff fields; "
                    f"missing: {field_list}"
                )
        try:
            finding = cls.model_validate(data)
        except ValidationError as exc:
            raise ValueError(str(exc)) from exc
        if finding.location is None and finding.path is None:
            raise ValueError("Review finding field `path` must be a non-empty string.")
        return finding

    def to_json_dict(self) -> dict[str, Any]:
        """Serialize while omitting absent generalized location metadata."""
        data = self.model_dump(mode="json", exclude_none=False)
        if self.location is None:
            data.pop("location", None)
        return data


def _validate_finding_common_payload(data: dict[str, Any]) -> None:
    severity = data["severity"]
    if not isinstance(severity, str) or severity not in _VALID_SEVERITIES:
        valid_values = ", ".join(sorted(_VALID_SEVERITIES))
        raise ValueError(f"Review finding field `severity` must be one of: {valid_values}")

    for field_name in ("summary", "details"):
        value = data[field_name]
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"Review finding field `{field_name}` must be a non-empty string.")


class ClaudeDiffFinding(ClinkrModel):
    """Claude schema model for legacy-compatible diff findings."""

    path: str = Field(min_length=1)
    line: int | None
    severity: Severity
    summary: str = Field(min_length=1)
    details: str = Field(min_length=1)
    location: DiffLineLocation | None = None


class ClaudeDocumentFinding(ClinkrModel):
    """Claude schema model for document findings."""

    location: DocumentReviewLocation
    severity: Severity
    summary: str = Field(min_length=1)
    details: str = Field(min_length=1)
    path: str | None = Field(default=None, min_length=1)
    line: int | None = None


class ClaudeDiffFindingsOutput(ClinkrModel):
    """Structured-output schema for diff review findings."""

    findings: tuple[ClaudeDiffFinding, ...]


class ClaudeDocumentFindingsOutput(ClinkrModel):
    """Structured-output schema for document review findings."""

    findings: tuple[ClaudeDocumentFinding, ...]


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
    """Structured result returned by the local roaster CLI."""

    review_name: str
    review_path: str
    model: str
    base_ref: str | None
    target_kind: TargetKind
    target_label: str
    payload: ReviewPayload
    usage: ReviewUsage | None = None
    target_source_path: str | None = None
    context_fragments: tuple[ReviewContextFragment, ...] = ()
    compatibility_warnings: tuple[str, ...] = ()

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        """Serialize the local-review result for JSON output."""
        target: dict[str, Any] = {
            "kind": self.target_kind,
            "label": self.target_label,
        }
        if self.base_ref is not None:
            target["base_ref"] = self.base_ref
        if self.target_source_path is not None:
            target["source_path"] = self.target_source_path
        return {
            "review_name": self.review_name,
            "review_path": self.review_path,
            "model": self.model,
            "base_ref": self.base_ref,
            "target_kind": self.target_kind,
            "target_label": self.target_label,
            "target": target,
            "context": {
                "fragments": [{"label": fragment.label} for fragment in self.context_fragments],
                "fragment_count": len(self.context_fragments),
            },
            "compatibility_warnings": list(self.compatibility_warnings),
            "usage": serialize_to_json_dict(self.usage) if self.usage else None,
            **serialize_to_json_dict(self.payload),
        }


@dataclass(frozen=True)
class MatchedReview:
    """A review whose changed-path condition selected it for execution."""

    key: str
    description: str
    default_model: str | None
    when_changed: tuple[str, ...]
    matched_paths: tuple[str, ...]


@dataclass(frozen=True)
class SkippedReview:
    """A review skipped by changed-path selection."""

    key: str
    description: str
    default_model: str | None
    when_changed: tuple[str, ...]
    reason: str


@dataclass(frozen=True)
class ResolvedReviewRunPlan:
    """Execution facts resolved before invoking a review harness."""

    review_name: str
    model: str
    harness: str
    base_ref: str | None
    changed_path_count: int | None
    target_kind: TargetKind = "diff"
    target_label: str | None = None
    compatibility_warnings: tuple[str, ...] = ()


class MatchingReviewSelectionResult(ClinkrModel):
    """Structured result for changed-path review selection."""

    base_ref: str
    changed_paths: tuple[str, ...]
    selected_reviews: tuple[MatchedReview, ...]
    skipped_reviews: tuple[SkippedReview, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        """Serialize a changed-path review selection for JSON output."""
        return {
            "base_ref": self.base_ref,
            "changed_paths": list(self.changed_paths),
            "changed_path_count": len(self.changed_paths),
            "selected_reviews": [dataclasses.asdict(review) for review in self.selected_reviews],
            "selected_count": len(self.selected_reviews),
            "skipped_reviews": [dataclasses.asdict(review) for review in self.skipped_reviews],
            "skipped_count": len(self.skipped_reviews),
        }
