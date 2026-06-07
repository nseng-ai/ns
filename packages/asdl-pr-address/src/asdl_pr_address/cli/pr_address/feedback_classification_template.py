"""Template generation for PR feedback classification packets."""

from __future__ import annotations

from typing import Literal

from asdl_core.clinkr.models import ClinkrModel
from asdl_pr_address.cli.pr_address.feedback_classification_models import (
    ActionComplexity,
    ClassificationBodyLocatorRef,
    FeedbackClassificationValidationError,
    InformationalReason,
    ManifestKind,
)
from asdl_pr_address.cli.pr_address.feedback_manifest_view import build_feedback_manifest_view
from asdl_pr_address.cli.pr_address.feedback_payload import BodyLocator

FILL_DISPOSITION_PLACEHOLDER = "<fill: actionable|informational>"


class FeedbackClassificationTemplateReviewItem(ClinkrModel):
    review_id: str
    disposition: str = FILL_DISPOSITION_PLACEHOLDER
    body_locator: ClassificationBodyLocatorRef
    summary: str = ""
    action_summary: str | None = None
    complexity: ActionComplexity | None = None
    pre_existing: bool = False
    informational_reason: InformationalReason | None = None


class FeedbackClassificationTemplateThreadCommentRef(ClinkrModel):
    comment_id: int
    body_locator: ClassificationBodyLocatorRef


class FeedbackClassificationTemplateThreadItem(ClinkrModel):
    thread_id: str
    disposition: str = FILL_DISPOSITION_PLACEHOLDER
    thread_item_pointer: str
    covered_comments: tuple[FeedbackClassificationTemplateThreadCommentRef, ...]
    summary: str = ""
    action_summary: str | None = None
    complexity: ActionComplexity | None = None
    pre_existing: bool = False
    informational_reason: InformationalReason | None = None


class FeedbackClassificationTemplateDiscussionCommentItem(ClinkrModel):
    comment_id: int
    disposition: str = FILL_DISPOSITION_PLACEHOLDER
    body_locator: ClassificationBodyLocatorRef
    summary: str = ""
    action_summary: str | None = None
    complexity: ActionComplexity | None = None
    needs_reply: bool = False
    informational_reason: InformationalReason | None = None


class FeedbackClassificationTemplatePacket(ClinkrModel):
    schema_version: Literal[1] = 1
    reviews: tuple[FeedbackClassificationTemplateReviewItem, ...] = ()
    review_threads: tuple[FeedbackClassificationTemplateThreadItem, ...] = ()
    discussion_comments: tuple[FeedbackClassificationTemplateDiscussionCommentItem, ...] = ()


class FeedbackClassificationTemplateCounts(ClinkrModel):
    reviews: int
    review_threads: int
    thread_comments: int
    discussion_comments: int
    resolved_review_threads_omitted: int


class FeedbackClassificationTemplateResult(ClinkrModel):
    manifest_kind: ManifestKind
    pr_number: int | None = None
    payload_path: str | None = None
    counts: FeedbackClassificationTemplateCounts
    classification_template: FeedbackClassificationTemplatePacket


class FeedbackClassificationTemplateManifestError(ValueError):
    def __init__(
        self,
        errors: tuple[FeedbackClassificationValidationError, ...],
    ) -> None:
        self.errors = errors
        message = "Cannot build feedback classification template from invalid manifest."
        if errors:
            message = f"{message} {errors[0].message}"
        super().__init__(message)


def build_feedback_classification_template(
    *,
    manifest: object,
) -> FeedbackClassificationTemplateResult:
    view, manifest_errors = build_feedback_manifest_view(manifest)
    if view is None or manifest_errors:
        raise FeedbackClassificationTemplateManifestError(manifest_errors)

    classification_template = FeedbackClassificationTemplatePacket(
        reviews=tuple(
            FeedbackClassificationTemplateReviewItem(
                review_id=review.id,
                body_locator=_classification_locator_ref(review.body_locator),
            )
            for review in view.reviews
        ),
        review_threads=tuple(
            FeedbackClassificationTemplateThreadItem(
                thread_id=thread.thread_id,
                thread_item_pointer=thread.item_pointer,
                covered_comments=tuple(
                    FeedbackClassificationTemplateThreadCommentRef(
                        comment_id=comment.id,
                        body_locator=_classification_locator_ref(comment.body_locator),
                    )
                    for comment in thread.comments
                ),
            )
            for thread in view.required_threads
        ),
        discussion_comments=tuple(
            FeedbackClassificationTemplateDiscussionCommentItem(
                comment_id=comment.comment_id,
                body_locator=_classification_locator_ref(comment.body_locator),
            )
            for comment in view.discussion_comments
        ),
    )
    return FeedbackClassificationTemplateResult(
        manifest_kind=view.kind,
        pr_number=view.pr_number,
        payload_path=view.payload_path,
        counts=FeedbackClassificationTemplateCounts(
            reviews=len(view.reviews),
            review_threads=len(view.required_threads),
            thread_comments=sum(len(thread.comments) for thread in view.required_threads),
            discussion_comments=len(view.discussion_comments),
            resolved_review_threads_omitted=len(view.resolved_threads),
        ),
        classification_template=classification_template,
    )


def _classification_locator_ref(locator: BodyLocator) -> ClassificationBodyLocatorRef:
    return ClassificationBodyLocatorRef(
        json_pointer=locator.json_pointer,
        item_pointer=locator.item_pointer,
    )
