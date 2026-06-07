"""Validation for PR feedback classification packets."""

from __future__ import annotations

from pydantic import ValidationError

from asdl_pr_address.cli.pr_address.feedback_classification_models import (
    ActionComplexity,
    ClassificationBodyLocatorRef,
    ClassificationDisposition,
    ClassifiedThreadItem,
    ExactOnceCodePrefix,
    FeedbackClassificationPacket,
    FeedbackClassificationValidationCounts,
    FeedbackClassificationValidationError,
    FeedbackClassificationValidationResult,
    FeedbackManifestView,
    InformationalReason,
    ValidationErrorCode,
    ValidationItemKind,
    duplicate_values,
    validation_schema_errors,
)
from asdl_pr_address.cli.pr_address.feedback_manifest_view import (
    build_feedback_manifest_view,
    manifest_kind_for_payload,
)
from asdl_pr_address.cli.pr_address.feedback_payload import ThreadManifestItem


def validate_feedback_classification(
    *,
    manifest: object,
    classification: object,
) -> FeedbackClassificationValidationResult:
    manifest_kind = manifest_kind_for_payload(manifest)
    view, manifest_errors = build_feedback_manifest_view(manifest)
    packet, packet_errors = _classification_packet(classification)

    counts = _validation_counts(view=view, packet=packet)
    errors = [*manifest_errors, *packet_errors]
    if view is not None and packet is not None and not manifest_errors:
        errors.extend(_validate_reviews(view, packet))
        errors.extend(_validate_threads(view, packet))
        errors.extend(_validate_discussion_comments(view, packet))
        errors.extend(_validate_item_semantics(packet))

    return FeedbackClassificationValidationResult(
        valid=not errors,
        manifest_kind=view.kind if view is not None else manifest_kind,
        pr_number=view.pr_number if view is not None else None,
        payload_path=view.payload_path if view is not None else None,
        counts=counts,
        errors=tuple(errors),
    )


def _classification_packet(
    classification_payload: object,
) -> tuple[FeedbackClassificationPacket | None, tuple[FeedbackClassificationValidationError, ...]]:
    try:
        return FeedbackClassificationPacket.model_validate(classification_payload), ()
    except ValidationError as exc:
        return None, validation_schema_errors(exc, subject="classification")


def _validation_counts(
    *,
    view: FeedbackManifestView | None,
    packet: FeedbackClassificationPacket | None,
) -> FeedbackClassificationValidationCounts:
    return FeedbackClassificationValidationCounts(
        reviews_expected=len(view.reviews) if view is not None else 0,
        reviews_classified=len(packet.reviews) if packet is not None else 0,
        review_threads_expected=len(view.required_threads) if view is not None else 0,
        review_threads_classified=len(packet.review_threads) if packet is not None else 0,
        thread_comments_expected=_expected_thread_comment_count(view),
        thread_comments_covered=_covered_thread_comment_count(packet),
        discussion_comments_expected=len(view.discussion_comments) if view is not None else 0,
        discussion_comments_classified=len(packet.discussion_comments) if packet is not None else 0,
    )


def _expected_thread_comment_count(view: FeedbackManifestView | None) -> int:
    if view is None:
        return 0
    return sum(len(thread.comments) for thread in view.required_threads)


def _covered_thread_comment_count(packet: FeedbackClassificationPacket | None) -> int:
    if packet is None:
        return 0
    return sum(len(thread.covered_comments) for thread in packet.review_threads)


def _validate_reviews(
    view: FeedbackManifestView,
    packet: FeedbackClassificationPacket,
) -> list[FeedbackClassificationValidationError]:
    manifest_by_id = {review.id: review for review in view.reviews}
    expected_ids = tuple(review.id for review in view.reviews)
    actual_ids = tuple(item.review_id for item in packet.reviews)
    errors = _exact_once_errors(
        expected_ids=expected_ids,
        actual_ids=actual_ids,
        code_prefix="review",
        kind="review",
        path_prefix="classification.reviews",
    )

    for index, item in enumerate(packet.reviews):
        if item.review_id in manifest_by_id:
            expected = manifest_by_id[item.review_id]
            errors.extend(
                _body_locator_errors(
                    actual=item.body_locator,
                    expected=expected.body_locator.json_pointer,
                    expected_item_pointer=expected.body_locator.item_pointer,
                    code_kind="review",
                    identifier=item.review_id,
                    path_prefix=f"classification.reviews[{index}].body_locator",
                )
            )
    return errors


def _validate_threads(
    view: FeedbackManifestView,
    packet: FeedbackClassificationPacket,
) -> list[FeedbackClassificationValidationError]:
    required_by_id = {thread.thread_id: thread for thread in view.required_threads}
    resolved_ids = {thread.thread_id for thread in view.resolved_threads}
    expected_ids = tuple(thread.thread_id for thread in view.required_threads)
    actual_unresolved_ids = tuple(
        item.thread_id for item in packet.review_threads if item.thread_id not in resolved_ids
    )
    errors = _exact_once_errors(
        expected_ids=expected_ids,
        actual_ids=actual_unresolved_ids,
        code_prefix="thread",
        kind="review_thread",
        path_prefix="classification.review_threads",
    )

    for index, item in enumerate(packet.review_threads):
        if item.thread_id in resolved_ids:
            errors.append(
                FeedbackClassificationValidationError(
                    code="resolved_thread_classified",
                    message=f"Resolved review thread was classified: {item.thread_id}",
                    kind="review_thread",
                    identifier=item.thread_id,
                    path=f"classification.review_threads[{index}].thread_id",
                )
            )
            continue
        if item.thread_id not in required_by_id:
            continue
        thread = required_by_id[item.thread_id]
        if item.thread_item_pointer != thread.item_pointer:
            errors.append(
                FeedbackClassificationValidationError(
                    code="invalid_locator",
                    message=(
                        f"Review thread {item.thread_id} item pointer does not match manifest: "
                        f"expected {thread.item_pointer!r}, got {item.thread_item_pointer!r}"
                    ),
                    kind="review_thread",
                    identifier=item.thread_id,
                    path=f"classification.review_threads[{index}].thread_item_pointer",
                )
            )
        errors.extend(_validate_thread_comments(thread=thread, item=item, item_index=index))
    return errors


def _validate_thread_comments(
    *,
    thread: ThreadManifestItem,
    item: ClassifiedThreadItem,
    item_index: int,
) -> list[FeedbackClassificationValidationError]:
    manifest_by_id = {comment.id: comment for comment in thread.comments}
    expected_ids = tuple(comment.id for comment in thread.comments)
    actual_ids = tuple(comment.comment_id for comment in item.covered_comments)
    errors = _exact_once_errors(
        expected_ids=expected_ids,
        actual_ids=actual_ids,
        code_prefix="thread_comment",
        kind="thread_comment",
        path_prefix=f"classification.review_threads[{item_index}].covered_comments",
        parent_identifier=item.thread_id,
    )
    for comment_index, comment_ref in enumerate(item.covered_comments):
        if comment_ref.comment_id not in manifest_by_id:
            continue
        expected = manifest_by_id[comment_ref.comment_id]
        errors.extend(
            _body_locator_errors(
                actual=comment_ref.body_locator,
                expected=expected.body_locator.json_pointer,
                expected_item_pointer=expected.body_locator.item_pointer,
                code_kind="thread_comment",
                identifier=comment_ref.comment_id,
                path_prefix=(
                    f"classification.review_threads[{item_index}]"
                    f".covered_comments[{comment_index}].body_locator"
                ),
            )
        )
    return errors


def _validate_discussion_comments(
    view: FeedbackManifestView,
    packet: FeedbackClassificationPacket,
) -> list[FeedbackClassificationValidationError]:
    manifest_by_id = {comment.comment_id: comment for comment in view.discussion_comments}
    expected_ids = tuple(comment.comment_id for comment in view.discussion_comments)
    actual_ids = tuple(item.comment_id for item in packet.discussion_comments)
    errors = _exact_once_errors(
        expected_ids=expected_ids,
        actual_ids=actual_ids,
        code_prefix="discussion_comment",
        kind="discussion_comment",
        path_prefix="classification.discussion_comments",
    )

    for index, item in enumerate(packet.discussion_comments):
        if item.comment_id in manifest_by_id:
            expected = manifest_by_id[item.comment_id]
            errors.extend(
                _body_locator_errors(
                    actual=item.body_locator,
                    expected=expected.body_locator.json_pointer,
                    expected_item_pointer=expected.body_locator.item_pointer,
                    code_kind="discussion_comment",
                    identifier=item.comment_id,
                    path_prefix=f"classification.discussion_comments[{index}].body_locator",
                )
            )
    return errors


def _exact_once_errors(
    *,
    expected_ids: tuple[str | int, ...],
    actual_ids: tuple[str | int, ...],
    code_prefix: ExactOnceCodePrefix,
    kind: ValidationItemKind,
    path_prefix: str,
    parent_identifier: str | None = None,
) -> list[FeedbackClassificationValidationError]:
    expected_set = set(expected_ids)
    errors: list[FeedbackClassificationValidationError] = []

    for duplicate_id in duplicate_values(actual_ids):
        errors.append(
            FeedbackClassificationValidationError(
                code=_duplicate_code(code_prefix),
                message=_duplicate_message(kind, duplicate_id, parent_identifier),
                kind=kind,
                identifier=duplicate_id,
                path=path_prefix,
            )
        )
    for actual_id in _unknown_values(actual_ids, expected_set):
        errors.append(
            FeedbackClassificationValidationError(
                code=_unknown_code(code_prefix),
                message=_unknown_message(kind, actual_id, parent_identifier),
                kind=kind,
                identifier=actual_id,
                path=path_prefix,
            )
        )
    actual_set = set(actual_ids)
    for expected_id in expected_ids:
        if expected_id not in actual_set:
            errors.append(
                FeedbackClassificationValidationError(
                    code=_missing_code(code_prefix),
                    message=_missing_message(kind, expected_id, parent_identifier),
                    kind=kind,
                    identifier=expected_id,
                    path=path_prefix,
                )
            )
    return errors


def _duplicate_code(code_prefix: ExactOnceCodePrefix) -> ValidationErrorCode:
    if code_prefix == "review":
        return "duplicate_review"
    if code_prefix == "thread":
        return "duplicate_thread"
    if code_prefix == "thread_comment":
        return "duplicate_thread_comment"
    return "duplicate_discussion_comment"


def _unknown_code(code_prefix: ExactOnceCodePrefix) -> ValidationErrorCode:
    if code_prefix == "review":
        return "unknown_review"
    if code_prefix == "thread":
        return "unknown_thread"
    if code_prefix == "thread_comment":
        return "unknown_thread_comment"
    return "unknown_discussion_comment"


def _missing_code(code_prefix: ExactOnceCodePrefix) -> ValidationErrorCode:
    if code_prefix == "review":
        return "missing_review"
    if code_prefix == "thread":
        return "missing_thread"
    if code_prefix == "thread_comment":
        return "missing_thread_comment"
    return "missing_discussion_comment"


def _unknown_values(
    values: tuple[str | int, ...], expected: set[str | int]
) -> tuple[str | int, ...]:
    seen: set[str | int] = set()
    unknowns: list[str | int] = []
    for value in values:
        if value not in expected and value not in seen:
            unknowns.append(value)
            seen.add(value)
    return tuple(unknowns)


def _body_locator_errors(
    *,
    actual: ClassificationBodyLocatorRef,
    expected: str,
    expected_item_pointer: str | None,
    code_kind: ValidationItemKind,
    identifier: str | int,
    path_prefix: str,
) -> list[FeedbackClassificationValidationError]:
    errors: list[FeedbackClassificationValidationError] = []
    if actual.json_pointer != expected:
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_locator",
                message=(
                    f"{_kind_label(code_kind)} {identifier} body JSON Pointer does not match "
                    f"manifest: expected {expected!r}, got {actual.json_pointer!r}"
                ),
                kind=code_kind,
                identifier=identifier,
                path=f"{path_prefix}.json_pointer",
            )
        )
    if actual.item_pointer != expected_item_pointer:
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_locator",
                message=(
                    f"{_kind_label(code_kind)} {identifier} body item pointer does not match "
                    f"manifest: expected {expected_item_pointer!r}, got {actual.item_pointer!r}"
                ),
                kind=code_kind,
                identifier=identifier,
                path=f"{path_prefix}.item_pointer",
            )
        )
    return errors


def _validate_item_semantics(
    packet: FeedbackClassificationPacket,
) -> list[FeedbackClassificationValidationError]:
    errors: list[FeedbackClassificationValidationError] = []
    for index, item in enumerate(packet.reviews):
        errors.extend(
            _item_semantic_errors(
                disposition=item.disposition,
                summary=item.summary,
                action_summary=item.action_summary,
                complexity=item.complexity,
                pre_existing=item.pre_existing,
                informational_reason=item.informational_reason,
                kind="review",
                identifier=item.review_id,
                path_prefix=f"classification.reviews[{index}]",
            )
        )
    for index, item in enumerate(packet.review_threads):
        errors.extend(
            _item_semantic_errors(
                disposition=item.disposition,
                summary=item.summary,
                action_summary=item.action_summary,
                complexity=item.complexity,
                pre_existing=item.pre_existing,
                informational_reason=item.informational_reason,
                kind="review_thread",
                identifier=item.thread_id,
                path_prefix=f"classification.review_threads[{index}]",
            )
        )
    for index, item in enumerate(packet.discussion_comments):
        errors.extend(
            _item_semantic_errors(
                disposition=item.disposition,
                summary=item.summary,
                action_summary=item.action_summary,
                complexity=item.complexity,
                pre_existing=False,
                informational_reason=item.informational_reason,
                kind="discussion_comment",
                identifier=item.comment_id,
                path_prefix=f"classification.discussion_comments[{index}]",
                needs_reply=item.needs_reply,
            )
        )
    return errors


def _item_semantic_errors(
    *,
    disposition: ClassificationDisposition,
    summary: str,
    action_summary: str | None,
    complexity: ActionComplexity | None,
    pre_existing: bool,
    informational_reason: InformationalReason | None,
    kind: ValidationItemKind,
    identifier: str | int,
    path_prefix: str,
    needs_reply: bool = False,
) -> list[FeedbackClassificationValidationError]:
    errors: list[FeedbackClassificationValidationError] = []
    if not summary.strip():
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_schema",
                message=f"{_kind_label(kind)} {identifier} summary must be non-empty.",
                kind=kind,
                identifier=identifier,
                path=f"{path_prefix}.summary",
            )
        )

    if disposition == "actionable":
        if action_summary is None or not action_summary.strip():
            errors.append(
                FeedbackClassificationValidationError(
                    code="invalid_action_fields",
                    message=f"Actionable {_kind_label(kind)} {identifier} requires action_summary.",
                    kind=kind,
                    identifier=identifier,
                    path=f"{path_prefix}.action_summary",
                )
            )
        if complexity is None:
            errors.append(
                FeedbackClassificationValidationError(
                    code="invalid_action_fields",
                    message=f"Actionable {_kind_label(kind)} {identifier} requires complexity.",
                    kind=kind,
                    identifier=identifier,
                    path=f"{path_prefix}.complexity",
                )
            )
        if informational_reason is not None:
            errors.append(
                FeedbackClassificationValidationError(
                    code="invalid_action_fields",
                    message=(
                        f"Actionable {_kind_label(kind)} {identifier} must not include "
                        "informational_reason."
                    ),
                    kind=kind,
                    identifier=identifier,
                    path=f"{path_prefix}.informational_reason",
                )
            )
        if pre_existing and complexity != "pre_existing":
            errors.append(
                FeedbackClassificationValidationError(
                    code="invalid_action_fields",
                    message=(
                        f"Actionable {_kind_label(kind)} {identifier} with pre_existing=true "
                        "must use complexity='pre_existing'."
                    ),
                    kind=kind,
                    identifier=identifier,
                    path=f"{path_prefix}.pre_existing",
                )
            )
        if complexity == "pre_existing" and not pre_existing:
            errors.append(
                FeedbackClassificationValidationError(
                    code="invalid_action_fields",
                    message=(
                        f"Actionable {_kind_label(kind)} {identifier} with "
                        "complexity='pre_existing' must set pre_existing=true."
                    ),
                    kind=kind,
                    identifier=identifier,
                    path=f"{path_prefix}.complexity",
                )
            )
        return errors

    if informational_reason is None:
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_informational_fields",
                message=(
                    f"Informational {_kind_label(kind)} {identifier} requires informational_reason."
                ),
                kind=kind,
                identifier=identifier,
                path=f"{path_prefix}.informational_reason",
            )
        )
    if action_summary is not None and action_summary.strip():
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_informational_fields",
                message=(
                    f"Informational {_kind_label(kind)} {identifier} must not include "
                    "action_summary."
                ),
                kind=kind,
                identifier=identifier,
                path=f"{path_prefix}.action_summary",
            )
        )
    if complexity is not None:
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_informational_fields",
                message=(
                    f"Informational {_kind_label(kind)} {identifier} must not include complexity."
                ),
                kind=kind,
                identifier=identifier,
                path=f"{path_prefix}.complexity",
            )
        )
    if pre_existing:
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_informational_fields",
                message=f"Informational {_kind_label(kind)} {identifier} must not be pre_existing.",
                kind=kind,
                identifier=identifier,
                path=f"{path_prefix}.pre_existing",
            )
        )
    if needs_reply:
        errors.append(
            FeedbackClassificationValidationError(
                code="invalid_informational_fields",
                message=f"Informational {_kind_label(kind)} {identifier} must not set needs_reply.",
                kind=kind,
                identifier=identifier,
                path=f"{path_prefix}.needs_reply",
            )
        )
    return errors


def _duplicate_message(
    kind: ValidationItemKind,
    identifier: str | int,
    parent_identifier: str | None,
) -> str:
    if kind == "thread_comment" and parent_identifier is not None:
        return (
            f"Thread comment {identifier} is covered more than once in thread {parent_identifier}."
        )
    return f"{_kind_label(kind)} {identifier} is classified more than once."


def _unknown_message(
    kind: ValidationItemKind,
    identifier: str | int,
    parent_identifier: str | None,
) -> str:
    if kind == "thread_comment" and parent_identifier is not None:
        return f"Thread comment {identifier} is not present in thread {parent_identifier}."
    return f"{_kind_label(kind)} {identifier} is not present in the manifest."


def _missing_message(
    kind: ValidationItemKind,
    identifier: str | int,
    parent_identifier: str | None,
) -> str:
    if kind == "thread_comment" and parent_identifier is not None:
        return f"Thread comment {identifier} is missing from thread {parent_identifier} coverage."
    return f"{_kind_label(kind)} {identifier} is missing from the classification packet."


def _kind_label(kind: ValidationItemKind) -> str:
    return kind.replace("_", " ")
