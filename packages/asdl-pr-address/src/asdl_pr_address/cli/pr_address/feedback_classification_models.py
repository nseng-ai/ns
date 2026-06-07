"""Models shared by PR feedback classification validation and templating."""

from __future__ import annotations

from collections import Counter
from typing import Literal, TypeAlias

from pydantic import ValidationError

from asdl_core.clinkr.models import ClinkrModel
from asdl_pr_address.cli.pr_address.feedback_payload import (
    DiscussionCommentManifestItem,
    ReviewManifestItem,
    ThreadManifestItem,
)

ClassificationDisposition: TypeAlias = Literal["actionable", "informational"]
ActionComplexity: TypeAlias = Literal[
    "pre_existing",
    "local",
    "single_file",
    "cross_cutting",
    "complex",
]
InformationalReason: TypeAlias = Literal[
    "resolved_reference",
    "automation",
    "acknowledgement",
    "approval",
    "question_only",
    "fyi",
    "noise",
    "already_addressed",
    "other",
]
ValidationErrorCode: TypeAlias = Literal[
    "invalid_schema",
    "missing_review",
    "duplicate_review",
    "unknown_review",
    "missing_thread",
    "duplicate_thread",
    "unknown_thread",
    "resolved_thread_classified",
    "missing_thread_comment",
    "duplicate_thread_comment",
    "unknown_thread_comment",
    "missing_discussion_comment",
    "duplicate_discussion_comment",
    "unknown_discussion_comment",
    "invalid_locator",
    "invalid_action_fields",
    "invalid_informational_fields",
]
ValidationItemKind: TypeAlias = Literal[
    "review", "review_thread", "thread_comment", "discussion_comment", "packet"
]
ManifestKind: TypeAlias = Literal["get_feedback", "prepare_run"]
ExactOnceCodePrefix: TypeAlias = Literal["review", "thread", "thread_comment", "discussion_comment"]
SchemaErrorSubject: TypeAlias = Literal["manifest", "classification"]


class ClassificationBodyLocatorRef(ClinkrModel):
    json_pointer: str
    item_pointer: str | None = None


class ClassifiedReviewItem(ClinkrModel):
    review_id: str
    disposition: ClassificationDisposition
    body_locator: ClassificationBodyLocatorRef
    summary: str
    action_summary: str | None = None
    complexity: ActionComplexity | None = None
    pre_existing: bool = False
    informational_reason: InformationalReason | None = None


class ClassifiedThreadCommentRef(ClinkrModel):
    comment_id: int
    body_locator: ClassificationBodyLocatorRef


class ClassifiedThreadItem(ClinkrModel):
    thread_id: str
    disposition: ClassificationDisposition
    thread_item_pointer: str
    covered_comments: tuple[ClassifiedThreadCommentRef, ...]
    summary: str
    action_summary: str | None = None
    complexity: ActionComplexity | None = None
    pre_existing: bool = False
    informational_reason: InformationalReason | None = None


class ClassifiedDiscussionCommentItem(ClinkrModel):
    comment_id: int
    disposition: ClassificationDisposition
    body_locator: ClassificationBodyLocatorRef
    summary: str
    action_summary: str | None = None
    complexity: ActionComplexity | None = None
    needs_reply: bool = False
    informational_reason: InformationalReason | None = None


class FeedbackClassificationPacket(ClinkrModel):
    schema_version: Literal[1] = 1
    reviews: tuple[ClassifiedReviewItem, ...] = ()
    review_threads: tuple[ClassifiedThreadItem, ...] = ()
    discussion_comments: tuple[ClassifiedDiscussionCommentItem, ...] = ()


class ValidateFeedbackClassificationInput(ClinkrModel):
    manifest: dict[str, object]
    classification: dict[str, object]


class FeedbackClassificationValidationError(ClinkrModel):
    code: ValidationErrorCode
    message: str
    kind: ValidationItemKind
    identifier: str | int | None = None
    path: str | None = None


class FeedbackClassificationValidationCounts(ClinkrModel):
    reviews_expected: int
    reviews_classified: int
    review_threads_expected: int
    review_threads_classified: int
    thread_comments_expected: int
    thread_comments_covered: int
    discussion_comments_expected: int
    discussion_comments_classified: int


class FeedbackClassificationValidationResult(ClinkrModel):
    valid: bool
    manifest_kind: ManifestKind
    pr_number: int | None = None
    payload_path: str | None = None
    counts: FeedbackClassificationValidationCounts
    errors: tuple[FeedbackClassificationValidationError, ...] = ()


class FeedbackManifestView(ClinkrModel):
    kind: ManifestKind
    pr_number: int | None
    payload_path: str
    reviews: tuple[ReviewManifestItem, ...]
    required_threads: tuple[ThreadManifestItem, ...]
    resolved_threads: tuple[ThreadManifestItem, ...]
    discussion_comments: tuple[DiscussionCommentManifestItem, ...]


def duplicate_values(values: tuple[str | int, ...]) -> tuple[str | int, ...]:
    counts = Counter(values)
    seen: set[str | int] = set()
    duplicates: list[str | int] = []
    for value in values:
        if counts[value] > 1 and value not in seen:
            duplicates.append(value)
            seen.add(value)
    return tuple(duplicates)


def validation_schema_errors(
    exc: ValidationError,
    *,
    subject: SchemaErrorSubject,
) -> tuple[FeedbackClassificationValidationError, ...]:
    errors: list[FeedbackClassificationValidationError] = []
    for index, error in enumerate(exc.errors()):
        path = validation_error_path(subject, error.get("loc", ()))
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_schema",
                message=(
                    f"Invalid {subject} schema at {path}: {error.get('msg', 'validation failed')}"
                ),
                kind="packet",
                path=path,
                identifier=index,
            )
        )
    return tuple(errors)


def validation_error_path(subject: str, loc: object) -> str:
    if not isinstance(loc, tuple) or not loc:
        return subject
    path = subject
    for part in loc:
        if isinstance(part, int):
            path += f"[{part}]"
        else:
            path += f".{part}"
    return path
