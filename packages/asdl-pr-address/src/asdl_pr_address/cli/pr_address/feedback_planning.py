"""Deterministic planning for validated PR feedback classifications."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Literal, TypeAlias

from asdl_core.clinkr.models import ClinkrModel
from asdl_pr_address.cli.pr_address.feedback_classification import (
    validate_feedback_classification_artifacts,
)
from asdl_pr_address.cli.pr_address.feedback_classification_models import (
    ActionComplexity,
    ClassifiedDiscussionCommentItem,
    ClassifiedReviewItem,
    ClassifiedThreadItem,
    FeedbackClassificationPacket,
    FeedbackClassificationValidationResult,
    FeedbackManifestView,
    InformationalReason,
    ManifestKind,
)
from asdl_pr_address.cli.pr_address.feedback_payload import (
    BodyLocator,
    DiscussionCommentManifestItem,
    ReviewManifestItem,
    ThreadCommentManifestItem,
    ThreadManifestItem,
)

PlanSourceKind: TypeAlias = Literal["review", "review_thread", "discussion_comment"]
PlanDecision: TypeAlias = Literal["act", "dismiss", "skip"]

ACTION_COMPLEXITY_ORDER: tuple[ActionComplexity, ...] = (
    "pre_existing",
    "local",
    "single_file",
    "cross_cutting",
    "complex",
)
APPROVAL_REQUIRED_COMPLEXITIES: tuple[ActionComplexity, ...] = ("cross_cutting", "complex")
INFORMATIONAL_THREAD_DECISIONS: tuple[PlanDecision, ...] = ("act", "dismiss", "skip")


class FeedbackPlanCoveredThreadComment(ClinkrModel):
    comment_id: int
    author: str
    path: str
    line: int | None = None
    start_line: int | None = None
    body_locator: BodyLocator


class FeedbackPlanSourceItem(ClinkrModel):
    source_kind: PlanSourceKind
    summary: str
    review_id: str | None = None
    review_state: str | None = None
    submitted_at: str | None = None
    thread_id: str | None = None
    discussion_comment_id: int | None = None
    covered_comment_ids: tuple[int, ...] = ()
    covered_comments: tuple[FeedbackPlanCoveredThreadComment, ...] = ()
    body_locator: BodyLocator | None = None
    thread_item_pointer: str | None = None
    path: str | None = None
    line: int | None = None
    start_line: int | None = None
    is_outdated: bool | None = None
    author: str | None = None
    url: str | None = None


class FeedbackPlanActionItem(FeedbackPlanSourceItem):
    action_summary: str
    complexity: ActionComplexity
    pre_existing: bool = False
    needs_reply: bool | None = None


class FeedbackPlanInformationalItem(FeedbackPlanSourceItem):
    informational_reason: InformationalReason
    user_decision_required: bool
    allowed_decisions: tuple[PlanDecision, ...] = ()


class FeedbackPlanBatch(ClinkrModel):
    # batch_id intentionally mirrors complexity: it is the stable external selector consumed by
    # build-resolve-thread-batch-payload, while complexity remains semantic metadata.
    batch_id: ActionComplexity
    complexity: ActionComplexity
    approval_required: bool
    items: tuple[FeedbackPlanActionItem, ...]


class FeedbackPlanCounts(ClinkrModel):
    actionable_items: int
    informational_items: int
    batches: int
    approval_required_batches: int
    actionable_reviews: int
    actionable_review_threads: int
    actionable_discussion_comments: int
    informational_reviews: int
    informational_review_threads: int
    informational_discussion_comments: int


class FeedbackPlanningResult(ClinkrModel):
    valid: bool
    manifest_kind: ManifestKind
    pr_number: int | None = None
    payload_path: str | None = None
    validation: FeedbackClassificationValidationResult
    counts: FeedbackPlanCounts | None = None
    batches: tuple[FeedbackPlanBatch, ...] = ()
    informational: tuple[FeedbackPlanInformationalItem, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class _ClassifiedLookup:
    reviews: dict[str, ClassifiedReviewItem]
    threads: dict[str, ClassifiedThreadItem]
    comments: dict[int, ClassifiedDiscussionCommentItem]


def plan_feedback(
    *,
    manifest: object,
    classification: object,
) -> FeedbackPlanningResult:
    artifacts = validate_feedback_classification_artifacts(
        manifest=manifest,
        classification=classification,
    )
    validation = artifacts.validation
    if not validation.valid:
        return FeedbackPlanningResult(
            valid=False,
            manifest_kind=validation.manifest_kind,
            pr_number=validation.pr_number,
            payload_path=validation.payload_path,
            validation=validation,
        )

    if artifacts.manifest_view is None or artifacts.classification_packet is None:
        return FeedbackPlanningResult(
            valid=False,
            manifest_kind=validation.manifest_kind,
            pr_number=validation.pr_number,
            payload_path=validation.payload_path,
            validation=validation,
            warnings=("Validated input could not be converted into planning artifacts.",),
        )

    view = artifacts.manifest_view
    classified = _classified_lookup(artifacts.classification_packet)
    actions = _action_items(view=view, classified=classified)
    informational = _informational_items(view=view, classified=classified)
    batches = _batches(actions)
    return FeedbackPlanningResult(
        valid=True,
        manifest_kind=view.kind,
        pr_number=view.pr_number,
        payload_path=view.payload_path,
        validation=validation,
        counts=_counts(actions=actions, informational=informational, batches=batches),
        batches=batches,
        informational=informational,
        warnings=_warnings(view),
    )


def _classified_lookup(packet: FeedbackClassificationPacket) -> _ClassifiedLookup:
    return _ClassifiedLookup(
        reviews={item.review_id: item for item in packet.reviews},
        threads={item.thread_id: item for item in packet.review_threads},
        comments={item.comment_id: item for item in packet.discussion_comments},
    )


def _action_items(
    *,
    view: FeedbackManifestView,
    classified: _ClassifiedLookup,
) -> tuple[FeedbackPlanActionItem, ...]:
    actions: list[FeedbackPlanActionItem] = []

    for review in view.reviews:
        item = classified.reviews.get(review.id)
        if item is not None and item.disposition == "actionable":
            action = _review_action_item(review=review, item=item)
            if action is not None:
                actions.append(action)
    for thread in view.required_threads:
        item = classified.threads.get(thread.thread_id)
        if item is not None and item.disposition == "actionable":
            action = _thread_action_item(thread=thread, item=item)
            if action is not None:
                actions.append(action)
    for comment in view.discussion_comments:
        item = classified.comments.get(comment.comment_id)
        if item is not None and item.disposition == "actionable":
            action = _discussion_action_item(comment=comment, item=item)
            if action is not None:
                actions.append(action)
    return tuple(actions)


def _review_action_item(
    *,
    review: ReviewManifestItem,
    item: ClassifiedReviewItem,
) -> FeedbackPlanActionItem | None:
    if item.action_summary is None or item.complexity is None:
        return None
    return FeedbackPlanActionItem(
        source_kind="review",
        summary=item.summary,
        action_summary=item.action_summary,
        complexity=item.complexity,
        pre_existing=item.pre_existing,
        review_id=review.id,
        review_state=review.state,
        submitted_at=review.submitted_at,
        body_locator=review.body_locator,
        author=review.author,
    )


def _thread_action_item(
    *,
    thread: ThreadManifestItem,
    item: ClassifiedThreadItem,
) -> FeedbackPlanActionItem | None:
    if item.action_summary is None or item.complexity is None:
        return None
    covered_comments = _covered_thread_comments(thread=thread, item=item)
    first_comment = covered_comments[0] if covered_comments else None
    return FeedbackPlanActionItem(
        source_kind="review_thread",
        summary=item.summary,
        action_summary=item.action_summary,
        complexity=item.complexity,
        pre_existing=item.pre_existing,
        thread_id=thread.thread_id,
        covered_comment_ids=tuple(comment.comment_id for comment in covered_comments),
        covered_comments=covered_comments,
        body_locator=first_comment.body_locator if first_comment is not None else None,
        thread_item_pointer=thread.item_pointer,
        path=thread.path,
        line=thread.line,
        start_line=thread.start_line,
        is_outdated=thread.is_outdated,
        author=first_comment.author if first_comment is not None else None,
    )


def _discussion_action_item(
    *,
    comment: DiscussionCommentManifestItem,
    item: ClassifiedDiscussionCommentItem,
) -> FeedbackPlanActionItem | None:
    if item.action_summary is None or item.complexity is None:
        return None
    return FeedbackPlanActionItem(
        source_kind="discussion_comment",
        summary=item.summary,
        action_summary=item.action_summary,
        complexity=item.complexity,
        discussion_comment_id=comment.comment_id,
        body_locator=comment.body_locator,
        author=comment.author,
        needs_reply=item.needs_reply,
        url=comment.url,
    )


def _informational_items(
    *,
    view: FeedbackManifestView,
    classified: _ClassifiedLookup,
) -> tuple[FeedbackPlanInformationalItem, ...]:
    informational: list[FeedbackPlanInformationalItem] = []

    for review in view.reviews:
        item = classified.reviews.get(review.id)
        if item is not None and item.disposition == "informational":
            info = _review_informational_item(review=review, item=item)
            if info is not None:
                informational.append(info)
    for thread in view.required_threads:
        item = classified.threads.get(thread.thread_id)
        if item is not None and item.disposition == "informational":
            info = _thread_informational_item(thread=thread, item=item)
            if info is not None:
                informational.append(info)
    for comment in view.discussion_comments:
        item = classified.comments.get(comment.comment_id)
        if item is not None and item.disposition == "informational":
            info = _discussion_informational_item(comment=comment, item=item)
            if info is not None:
                informational.append(info)
    return tuple(informational)


def _review_informational_item(
    *,
    review: ReviewManifestItem,
    item: ClassifiedReviewItem,
) -> FeedbackPlanInformationalItem | None:
    if item.informational_reason is None:
        return None
    return FeedbackPlanInformationalItem(
        source_kind="review",
        summary=item.summary,
        informational_reason=item.informational_reason,
        user_decision_required=False,
        review_id=review.id,
        review_state=review.state,
        submitted_at=review.submitted_at,
        body_locator=review.body_locator,
        author=review.author,
    )


def _thread_informational_item(
    *,
    thread: ThreadManifestItem,
    item: ClassifiedThreadItem,
) -> FeedbackPlanInformationalItem | None:
    if item.informational_reason is None:
        return None
    covered_comments = _covered_thread_comments(thread=thread, item=item)
    first_comment = covered_comments[0] if covered_comments else None
    return FeedbackPlanInformationalItem(
        source_kind="review_thread",
        summary=item.summary,
        informational_reason=item.informational_reason,
        user_decision_required=True,
        allowed_decisions=INFORMATIONAL_THREAD_DECISIONS,
        thread_id=thread.thread_id,
        covered_comment_ids=tuple(comment.comment_id for comment in covered_comments),
        covered_comments=covered_comments,
        body_locator=first_comment.body_locator if first_comment is not None else None,
        thread_item_pointer=thread.item_pointer,
        path=thread.path,
        line=thread.line,
        start_line=thread.start_line,
        is_outdated=thread.is_outdated,
        author=first_comment.author if first_comment is not None else None,
    )


def _discussion_informational_item(
    *,
    comment: DiscussionCommentManifestItem,
    item: ClassifiedDiscussionCommentItem,
) -> FeedbackPlanInformationalItem | None:
    if item.informational_reason is None:
        return None
    return FeedbackPlanInformationalItem(
        source_kind="discussion_comment",
        summary=item.summary,
        informational_reason=item.informational_reason,
        user_decision_required=False,
        discussion_comment_id=comment.comment_id,
        body_locator=comment.body_locator,
        author=comment.author,
        url=comment.url,
    )


def _covered_thread_comments(
    *,
    thread: ThreadManifestItem,
    item: ClassifiedThreadItem,
) -> tuple[FeedbackPlanCoveredThreadComment, ...]:
    covered_ids = {comment.comment_id for comment in item.covered_comments}
    return tuple(
        _covered_thread_comment(comment) for comment in thread.comments if comment.id in covered_ids
    )


def _covered_thread_comment(comment: ThreadCommentManifestItem) -> FeedbackPlanCoveredThreadComment:
    return FeedbackPlanCoveredThreadComment(
        comment_id=comment.id,
        author=comment.author,
        path=comment.path,
        line=comment.line,
        start_line=comment.start_line,
        body_locator=comment.body_locator,
    )


def _batches(actions: tuple[FeedbackPlanActionItem, ...]) -> tuple[FeedbackPlanBatch, ...]:
    items_by_complexity: dict[ActionComplexity, list[FeedbackPlanActionItem]] = {
        complexity: [] for complexity in ACTION_COMPLEXITY_ORDER
    }
    for item in actions:
        items_by_complexity[item.complexity].append(item)

    batches: list[FeedbackPlanBatch] = []
    for complexity in ACTION_COMPLEXITY_ORDER:
        items = tuple(items_by_complexity[complexity])
        if items:
            batches.append(
                FeedbackPlanBatch(
                    batch_id=complexity,
                    complexity=complexity,
                    approval_required=complexity in APPROVAL_REQUIRED_COMPLEXITIES,
                    items=items,
                )
            )
    return tuple(batches)


def _counts(
    *,
    actions: tuple[FeedbackPlanActionItem, ...],
    informational: tuple[FeedbackPlanInformationalItem, ...],
    batches: tuple[FeedbackPlanBatch, ...],
) -> FeedbackPlanCounts:
    action_source_counts = Counter(item.source_kind for item in actions)
    informational_source_counts = Counter(item.source_kind for item in informational)
    return FeedbackPlanCounts(
        actionable_items=len(actions),
        informational_items=len(informational),
        batches=len(batches),
        approval_required_batches=sum(1 for batch in batches if batch.approval_required),
        actionable_reviews=action_source_counts["review"],
        actionable_review_threads=action_source_counts["review_thread"],
        actionable_discussion_comments=action_source_counts["discussion_comment"],
        informational_reviews=informational_source_counts["review"],
        informational_review_threads=informational_source_counts["review_thread"],
        informational_discussion_comments=informational_source_counts["discussion_comment"],
    )


def _warnings(view: FeedbackManifestView) -> tuple[str, ...]:
    if (
        view.kind == "prepare_run"
        and view.pr_number is None
        and not view.reviews
        and not view.required_threads
        and not view.discussion_comments
    ):
        return ("prepare-run manifest has found=false; plan is empty.",)
    return ()
