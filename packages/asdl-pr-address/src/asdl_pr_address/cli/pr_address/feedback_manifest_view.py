"""Compact manifest parsing for PR feedback classification workflows."""

from __future__ import annotations

from pydantic import ValidationError

from asdl_pr_address.cli.pr_address.feedback_classification_models import (
    FeedbackClassificationValidationError,
    FeedbackManifestView,
    ManifestKind,
    ValidationItemKind,
    duplicate_values,
    validation_schema_errors,
)
from asdl_pr_address.cli.pr_address.feedback_payload import (
    GetFeedbackPayloadManifest,
    PrepareRunPayloadManifest,
)


def manifest_kind_for_payload(payload: object) -> ManifestKind:
    if isinstance(payload, dict) and "found" in payload:
        return "prepare_run"
    return "get_feedback"


def build_feedback_manifest_view(
    manifest_payload: object,
) -> tuple[FeedbackManifestView | None, tuple[FeedbackClassificationValidationError, ...]]:
    manifest_kind = manifest_kind_for_payload(manifest_payload)
    try:
        if manifest_kind == "prepare_run":
            manifest = PrepareRunPayloadManifest.model_validate(manifest_payload)
            kind: ManifestKind = "prepare_run"
            pr_number = manifest.number if manifest.found else None
        else:
            manifest = GetFeedbackPayloadManifest.model_validate(manifest_payload)
            kind = "get_feedback"
            pr_number = manifest.pr_number
    except ValidationError as exc:
        return None, validation_schema_errors(exc, subject="manifest")

    required_threads = []
    resolved_threads = []
    for thread in manifest.review_threads:
        if thread.is_resolved:
            resolved_threads.append(thread)
        else:
            required_threads.append(thread)

    view = FeedbackManifestView(
        kind=kind,
        pr_number=pr_number,
        payload_path=manifest.payload_reference.payload_path,
        reviews=manifest.reviews,
        required_threads=tuple(required_threads),
        resolved_threads=tuple(resolved_threads),
        discussion_comments=manifest.discussion_comments,
    )
    return view, tuple(_manifest_integrity_errors(view))


def _manifest_integrity_errors(
    view: FeedbackManifestView,
) -> list[FeedbackClassificationValidationError]:
    errors: list[FeedbackClassificationValidationError] = []
    errors.extend(
        _manifest_duplicate_errors(
            values=tuple(review.id for review in view.reviews),
            kind="review",
            identifier_name="review id",
        )
    )
    all_threads = (*view.required_threads, *view.resolved_threads)
    errors.extend(
        _manifest_duplicate_errors(
            values=tuple(thread.thread_id for thread in all_threads),
            kind="review_thread",
            identifier_name="thread id",
        )
    )
    errors.extend(
        _manifest_duplicate_errors(
            values=tuple(comment.comment_id for comment in view.discussion_comments),
            kind="discussion_comment",
            identifier_name="discussion comment id",
        )
    )
    for thread in all_threads:
        errors.extend(
            _manifest_duplicate_errors(
                values=tuple(comment.id for comment in thread.comments),
                kind="thread_comment",
                identifier_name=f"comment id in thread {thread.thread_id}",
            )
        )
    return errors


def _manifest_duplicate_errors(
    *,
    values: tuple[str | int, ...],
    kind: ValidationItemKind,
    identifier_name: str,
) -> list[FeedbackClassificationValidationError]:
    errors: list[FeedbackClassificationValidationError] = []
    for value in duplicate_values(values):
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_schema",
                message=f"Manifest has duplicate {identifier_name}: {value}",
                kind=kind,
                identifier=value,
            )
        )
    return errors
