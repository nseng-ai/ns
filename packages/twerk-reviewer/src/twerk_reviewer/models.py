"""Domain models for twerk-reviewer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Severity = Literal["info", "warning", "error"]
_VALID_SEVERITIES = {"info", "warning", "error"}


@dataclass(frozen=True)
class ReviewerFailure:
    """A typed failure surfaced by reviewer gateways or workflow code."""

    error_type: str
    message: str


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
