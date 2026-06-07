"""Payload-backed stack feedback orchestration helpers."""

from __future__ import annotations

from collections import Counter
from typing import Annotated, Literal, TypeAlias

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRDiscussionComment
from asdl_core.payloads.clinkr import open_clinkr_payload_store, write_clinkr_raw_payload_artifact
from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.models import PayloadReference
from asdl_core.payloads.store import PayloadStore
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.feedback_classification import validate_feedback_classification
from asdl_pr_address.cli.pr_address.feedback_classification_models import (
    FeedbackClassificationValidationError,
    FeedbackClassificationValidationResult,
)
from asdl_pr_address.cli.pr_address.feedback_classification_template import (
    FeedbackClassificationTemplateResult,
    build_feedback_classification_template,
)
from asdl_pr_address.cli.pr_address.feedback_payload import (
    BodyLocator,
    FeedbackCounts,
    GetFeedbackPayloadManifest,
    build_get_feedback_payload_manifest,
)
from asdl_pr_address.cli.pr_address.feedback_planning import (
    ACTION_COMPLEXITY_ORDER,
    APPROVAL_REQUIRED_COMPLEXITIES,
    FeedbackPlanActionItem,
    FeedbackPlanBatch,
    FeedbackPlanInformationalItem,
    FeedbackPlanningResult,
    PlanSourceKind,
    plan_feedback,
)
from asdl_pr_address.cli.pr_address.get_feedback import GetFeedbackInlineResult
from asdl_pr_address.cli.pr_address.review_filtering import filter_empty_reviews

DiscussionTriageHint: TypeAlias = Literal["automation", "human_like", "needs_agent_review"]
DiscussionTriageReason: TypeAlias = Literal[
    "vercel_status",
    "graphite_status",
    "roaster_summary",
    "github_actions_status",
    "bot_status",
    "human_like",
    "direct_request_possible",
    "uncertain",
]
DecisionKind: TypeAlias = Literal[
    "approval_required_action",
    "informational_review_thread",
    "discussion_comment_action",
    "discussion_comment_review",
]

_DIRECT_REQUEST_MARKERS: tuple[str, ...] = (
    "please",
    "can you",
    "could you",
    "should",
    "needs",
    "need to",
    "fix",
    "update",
    "question",
)


class StackFeedbackPrInput(ClinkrModel):
    pr_number: int
    branch: str
    title: str | None = None
    url: str | None = None
    head_ref_name: str | None = None
    base_ref_name: str | None = None


class StackFeedbackPrepInput(ClinkrModel):
    stack: tuple[StackFeedbackPrInput, ...]


class StackFeedbackPrepRequest(ClinkrModel):
    stack_json: Annotated[
        str | None,
        click.Option(["--stack-json"], type=click.STRING, required=False),
    ] = None
    payload_session_id: Annotated[
        str | None,
        click.Option(["--payload-session-id"], type=click.STRING, required=False),
    ] = None
    include_resolved: bool = False
    include_empty_reviews: bool = False


class StackDiscussionTriageItem(ClinkrModel):
    comment_id: int
    author: str
    classification_hint: DiscussionTriageHint
    reason: DiscussionTriageReason
    body_locator: BodyLocator


class StackDiscussionTriageSummary(ClinkrModel):
    automation_like: int
    human_like: int
    needs_agent_review: int
    by_reason: dict[DiscussionTriageReason, int]
    items: tuple[StackDiscussionTriageItem, ...] = ()


class StackFeedbackPrepPrResult(ClinkrModel):
    pr_number: int
    branch: str
    title: str | None = None
    url: str | None = None
    head_ref_name: str | None = None
    base_ref_name: str | None = None
    manifest: GetFeedbackPayloadManifest
    manifest_summary_reference: PayloadReference
    raw_feedback_reference: PayloadReference
    classification_template: FeedbackClassificationTemplateResult
    classification_template_reference: PayloadReference
    counts: FeedbackCounts
    discussion_triage: StackDiscussionTriageSummary


class StackFeedbackPrepSummary(ClinkrModel):
    prs: int
    reviews: int
    unresolved_review_threads: int
    discussion_comments: int
    automation_discussion_comments: int
    discussion_comments_needing_agent_review: int


class StackFeedbackPrepResult(ClinkrModel):
    payload_session_id: str
    stack: tuple[StackFeedbackPrepPrResult, ...]
    stack_summary_reference: PayloadReference | None = None
    summary: StackFeedbackPrepSummary


class StackFeedbackClassificationInput(ClinkrModel):
    pr_number: int
    classification: dict[str, object]


class StackFeedbackPlanInput(ClinkrModel):
    prep: StackFeedbackPrepResult
    classifications: tuple[StackFeedbackClassificationInput, ...]


class StackFeedbackPlanRequest(ClinkrModel):
    payload_json: Annotated[
        str | None,
        click.Option(["--payload-json"], type=click.STRING, required=False),
    ] = None
    payload_session_id: Annotated[
        str | None,
        click.Option(["--payload-session-id"], type=click.STRING, required=False),
    ] = None


class StackFeedbackPlanValidationPrResult(ClinkrModel):
    pr_number: int
    valid: bool
    counts: object
    errors: tuple[FeedbackClassificationValidationError, ...] = ()


class StackFeedbackPlanValidationSummary(ClinkrModel):
    all_valid: bool
    per_pr: tuple[StackFeedbackPlanValidationPrResult, ...]


class StackFeedbackPlanItem(ClinkrModel):
    pr_number: int
    branch: str
    title: str | None = None
    url: str | None = None
    source_batch_id: str | None = None
    source_kind: PlanSourceKind
    summary: str
    action_summary: str | None = None
    complexity: str | None = None
    approval_required: bool = False
    review_id: str | None = None
    review_state: str | None = None
    submitted_at: str | None = None
    thread_id: str | None = None
    discussion_comment_id: int | None = None
    covered_comment_ids: tuple[int, ...] = ()
    body_locator: BodyLocator | None = None
    thread_item_pointer: str | None = None
    path: str | None = None
    line: int | None = None
    start_line: int | None = None
    is_outdated: bool | None = None
    author: str | None = None
    needs_reply: bool | None = None


class StackFeedbackPlanBatch(ClinkrModel):
    batch_id: str
    complexity: str
    approval_required: bool
    items: tuple[StackFeedbackPlanItem, ...]


class StackFeedbackPlanInformationalItem(ClinkrModel):
    pr_number: int
    branch: str
    title: str | None = None
    url: str | None = None
    source_kind: PlanSourceKind
    summary: str
    informational_reason: str
    user_decision_required: bool
    allowed_decisions: tuple[str, ...] = ()
    review_id: str | None = None
    review_state: str | None = None
    submitted_at: str | None = None
    thread_id: str | None = None
    discussion_comment_id: int | None = None
    covered_comment_ids: tuple[int, ...] = ()
    body_locator: BodyLocator | None = None
    thread_item_pointer: str | None = None
    path: str | None = None
    line: int | None = None
    start_line: int | None = None
    is_outdated: bool | None = None
    author: str | None = None


class StackFeedbackDecisionDocketItem(ClinkrModel):
    decision_kind: DecisionKind
    pr_number: int
    branch: str
    title: str | None = None
    url: str | None = None
    source_kind: PlanSourceKind
    thread_id: str | None = None
    discussion_comment_id: int | None = None
    path: str | None = None
    line: int | None = None
    summary: str
    action_summary: str | None = None
    recommended_decision: str
    approval_required: bool = False


class StackFeedbackAutomationDiscussionSummary(ClinkrModel):
    automation_like: int
    human_like: int
    needs_agent_review: int
    by_reason: dict[DiscussionTriageReason, int]


class StackFeedbackPlanSummary(ClinkrModel):
    actionable_items: int
    approval_required_items: int
    informational_items: int
    automation_discussion_comments: int


class StackFeedbackPlanResult(ClinkrModel):
    valid: bool
    payload_session_id: str
    pr_count: int
    validation: StackFeedbackPlanValidationSummary
    batches: tuple[StackFeedbackPlanBatch, ...] = ()
    informational: tuple[StackFeedbackPlanInformationalItem, ...] = ()
    automation_discussion_summary: StackFeedbackAutomationDiscussionSummary | None = None
    decision_docket: tuple[StackFeedbackDecisionDocketItem, ...] = ()
    stack_plan_reference: PayloadReference | None = None
    summary: StackFeedbackPlanSummary | None = None


@clinkr_operation(
    name="stack-feedback-prep",
    help="Fetch stack PR feedback, write payload artifacts, and build classification templates.",
)
def run_stack_feedback_prep(
    ctx: click.Context,
    request: StackFeedbackPrepRequest,
) -> ClinkrExit[StackFeedbackPrepResult]:
    store = open_clinkr_payload_store(request.payload_session_id)
    payload = _load_prep_payload(request)
    _validate_stack_input(payload.stack)

    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    pr_results: list[StackFeedbackPrepPrResult] = []
    for pr_input in payload.stack:
        raw_reviews = pr_address_context.pr_gateway.get_reviews(pr_input.pr_number)
        reviews = (
            raw_reviews if request.include_empty_reviews else filter_empty_reviews(raw_reviews)
        )
        inline_result = GetFeedbackInlineResult(
            pr_number=pr_input.pr_number,
            reviews=reviews,
            review_threads=pr_address_context.pr_gateway.get_review_threads(
                pr_input.pr_number, include_resolved=request.include_resolved
            ),
            discussion_comments=pr_address_context.pr_gateway.get_pr_discussion_comments(
                pr_input.pr_number
            ),
        )
        raw_reference = write_clinkr_raw_payload_artifact(
            store=store,
            descriptor=f"pr-address-stack-feedback-pr-{pr_input.pr_number}",
            result=ClinkrExit.ok(inline_result),
        )
        manifest = build_get_feedback_payload_manifest(
            payload_reference=raw_reference,
            pr_number=inline_result.pr_number,
            reviews=inline_result.reviews,
            review_threads=inline_result.review_threads,
            discussion_comments=inline_result.discussion_comments,
        )
        classification_template = build_feedback_classification_template(
            manifest=manifest.model_dump(mode="json")
        )
        manifest_reference = _write_summary_artifact(
            store=store,
            descriptor=f"pr-address-stack-manifest-pr-{pr_input.pr_number}",
            payload=manifest.model_dump(mode="json"),
        )
        classification_template_reference = _write_summary_artifact(
            store=store,
            descriptor=f"pr-address-stack-classification-template-pr-{pr_input.pr_number}",
            payload=classification_template.model_dump(mode="json"),
        )
        pr_results.append(
            StackFeedbackPrepPrResult(
                pr_number=pr_input.pr_number,
                branch=pr_input.branch,
                title=pr_input.title,
                url=pr_input.url,
                head_ref_name=pr_input.head_ref_name,
                base_ref_name=pr_input.base_ref_name,
                manifest=manifest,
                manifest_summary_reference=manifest_reference,
                raw_feedback_reference=raw_reference,
                classification_template=classification_template,
                classification_template_reference=classification_template_reference,
                counts=manifest.counts,
                discussion_triage=_discussion_triage_summary(
                    manifest=manifest,
                    discussion_comments=inline_result.discussion_comments,
                ),
            )
        )

    result_without_reference = StackFeedbackPrepResult(
        payload_session_id=store.session_id,
        stack=tuple(pr_results),
        summary=_prep_summary(pr_results),
    )
    stack_summary_reference = _write_summary_artifact(
        store=store,
        descriptor="pr-address-stack-feedback-prep",
        payload=result_without_reference.model_dump(mode="json"),
    )
    return ClinkrExit.ok(
        result_without_reference.model_copy(
            update={"stack_summary_reference": stack_summary_reference}
        )
    )


@clinkr_operation(
    name="stack-feedback-plan",
    help="Validate stack feedback classifications and merge deterministic per-PR plans.",
)
def run_stack_feedback_plan(
    ctx: click.Context,
    request: StackFeedbackPlanRequest,
) -> ClinkrExit[StackFeedbackPlanResult]:
    del ctx
    store = open_clinkr_payload_store(request.payload_session_id)
    payload = _load_plan_payload(request)
    classification_by_pr = _classifications_by_pr(payload)
    validations = _validation_results(payload=payload, classification_by_pr=classification_by_pr)
    validation_summary = StackFeedbackPlanValidationSummary(
        all_valid=all(validation.valid for validation in validations),
        per_pr=tuple(
            StackFeedbackPlanValidationPrResult(
                pr_number=validation.pr_number or pr_result.pr_number,
                valid=validation.valid,
                counts=validation.counts,
                errors=validation.errors,
            )
            for pr_result, validation in zip(payload.prep.stack, validations, strict=True)
        ),
    )
    if not validation_summary.all_valid:
        return ClinkrExit.negative(
            StackFeedbackPlanResult(
                valid=False,
                payload_session_id=store.session_id,
                pr_count=len(payload.prep.stack),
                validation=validation_summary,
            ),
            message="Stack feedback classification failed validation; no stack plan produced.",
        )

    per_pr_plans = _planning_results(payload=payload, classification_by_pr=classification_by_pr)
    result_without_reference = _merged_stack_plan_result(
        store=store,
        prep=payload.prep,
        validation=validation_summary,
        per_pr_plans=per_pr_plans,
    )
    stack_plan_reference = _write_summary_artifact(
        store=store,
        descriptor="pr-address-stack-feedback-plan",
        payload=result_without_reference.model_dump(mode="json"),
    )
    return ClinkrExit.ok(
        result_without_reference.model_copy(update={"stack_plan_reference": stack_plan_reference})
    )


def _load_prep_payload(request: StackFeedbackPrepRequest) -> StackFeedbackPrepInput:
    return load_json_input(
        option_value=request.stack_json,
        command_name="stack-feedback-prep",
        input_description="stack JSON payload",
        option_name="--stack-json",
        parser=StackFeedbackPrepInput.model_validate_json,
    )


def _load_plan_payload(request: StackFeedbackPlanRequest) -> StackFeedbackPlanInput:
    return load_json_input(
        option_value=request.payload_json,
        command_name="stack-feedback-plan",
        input_description="stack feedback plan JSON payload",
        option_name="--payload-json",
        parser=StackFeedbackPlanInput.model_validate_json,
    )


def _validate_stack_input(stack: tuple[StackFeedbackPrInput, ...]) -> None:
    Ensure.truthy(
        stack,
        error_type="invalid_request",
        message="stack-feedback-prep requires at least one stack PR.",
    )
    pr_numbers = tuple(item.pr_number for item in stack)
    duplicate_prs = _duplicates(pr_numbers)
    Ensure.true(
        not duplicate_prs,
        error_type="invalid_request",
        message=f"stack-feedback-prep stack contains duplicate PR numbers: {duplicate_prs}",
    )
    branches = tuple(item.branch for item in stack)
    Ensure.true(
        all(branch.strip() for branch in branches),
        error_type="invalid_request",
        message="stack-feedback-prep requires every stack PR branch to be non-empty.",
    )
    duplicate_branches = _duplicates(branches)
    Ensure.true(
        not duplicate_branches,
        error_type="invalid_request",
        message=f"stack-feedback-prep stack contains duplicate branches: {duplicate_branches}",
    )


def _duplicates(values: tuple[int, ...] | tuple[str, ...]) -> tuple[int | str, ...]:
    counts = Counter(values)
    seen: set[int | str] = set()
    duplicates: list[int | str] = []
    for value in values:
        if counts[value] > 1 and value not in seen:
            duplicates.append(value)
            seen.add(value)
    return tuple(duplicates)


def _write_summary_artifact(
    *,
    store: PayloadStore,
    descriptor: str,
    payload: object,
) -> PayloadReference:
    try:
        return store.write_json_artifact(descriptor=descriptor, role="summary", payload=payload)
    except PayloadError as error:
        raise ClinkrFailure(error_type=error.error_type, message=error.message) from error


def _discussion_triage_summary(
    *,
    manifest: GetFeedbackPayloadManifest,
    discussion_comments: tuple[PRDiscussionComment, ...],
) -> StackDiscussionTriageSummary:
    comments_by_id = {comment.id: comment for comment in discussion_comments}
    items = tuple(
        _discussion_triage_item(
            comment=comments_by_id[item.comment_id],
            body_locator=item.body_locator,
        )
        for item in manifest.discussion_comments
        if item.comment_id in comments_by_id
    )
    return _triage_summary(items)


def _discussion_triage_item(
    *,
    comment: PRDiscussionComment,
    body_locator: BodyLocator,
) -> StackDiscussionTriageItem:
    author = comment.author.lower()
    body = comment.body.lower()
    hint, reason = _discussion_triage_hint(author=author, body=body)
    return StackDiscussionTriageItem(
        comment_id=comment.id,
        author=comment.author,
        classification_hint=hint,
        reason=reason,
        body_locator=body_locator,
    )


def _discussion_triage_hint(
    *,
    author: str,
    body: str,
) -> tuple[DiscussionTriageHint, DiscussionTriageReason]:
    if author == "vercel[bot]" or "[vc]:" in body:
        return "automation", "vercel_status"
    if "app.graphite.com" in body or "not mergeable via github" in body:
        return "automation", "graphite_status"
    if "<!-- roaster:" in body:
        return "automation", "roaster_summary"
    if author == "github-actions[bot]" or "github actions" in body:
        return "automation", "github_actions_status"
    if _contains_direct_request(body):
        return "needs_agent_review", "direct_request_possible"
    if author.endswith("[bot]"):
        return "automation", "bot_status"
    if author:
        return "human_like", "human_like"
    return "needs_agent_review", "uncertain"


def _contains_direct_request(body: str) -> bool:
    return any(marker in body for marker in _DIRECT_REQUEST_MARKERS)


def _triage_summary(
    items: tuple[StackDiscussionTriageItem, ...],
) -> StackDiscussionTriageSummary:
    by_reason = Counter(item.reason for item in items)
    return StackDiscussionTriageSummary(
        automation_like=sum(1 for item in items if item.classification_hint == "automation"),
        human_like=sum(1 for item in items if item.classification_hint == "human_like"),
        needs_agent_review=sum(
            1 for item in items if item.classification_hint == "needs_agent_review"
        ),
        by_reason=dict(by_reason),
        items=items,
    )


def _prep_summary(pr_results: list[StackFeedbackPrepPrResult]) -> StackFeedbackPrepSummary:
    return StackFeedbackPrepSummary(
        prs=len(pr_results),
        reviews=sum(item.counts.reviews for item in pr_results),
        unresolved_review_threads=sum(item.counts.unresolved_review_threads for item in pr_results),
        discussion_comments=sum(item.counts.discussion_comments for item in pr_results),
        automation_discussion_comments=sum(
            item.discussion_triage.automation_like for item in pr_results
        ),
        discussion_comments_needing_agent_review=sum(
            item.discussion_triage.needs_agent_review for item in pr_results
        ),
    )


def _classifications_by_pr(
    payload: StackFeedbackPlanInput,
) -> dict[int, dict[str, object]]:
    expected_prs = {item.pr_number for item in payload.prep.stack}
    actual_prs = tuple(item.pr_number for item in payload.classifications)
    duplicate_prs = _duplicates(actual_prs)
    Ensure.true(
        not duplicate_prs,
        error_type="invalid_request",
        message=(
            f"stack-feedback-plan classifications contain duplicate PR numbers: {duplicate_prs}"
        ),
    )
    missing_prs = tuple(
        item.pr_number for item in payload.prep.stack if item.pr_number not in actual_prs
    )
    Ensure.true(
        not missing_prs,
        error_type="invalid_request",
        message=f"stack-feedback-plan classifications missing PR numbers: {missing_prs}",
    )
    unknown_prs = tuple(pr_number for pr_number in actual_prs if pr_number not in expected_prs)
    Ensure.true(
        not unknown_prs,
        error_type="invalid_request",
        message=f"stack-feedback-plan classifications contain unknown PR numbers: {unknown_prs}",
    )
    return {item.pr_number: item.classification for item in payload.classifications}


def _validation_results(
    *,
    payload: StackFeedbackPlanInput,
    classification_by_pr: dict[int, dict[str, object]],
) -> tuple[FeedbackClassificationValidationResult, ...]:
    return tuple(
        validate_feedback_classification(
            manifest=pr_result.manifest.model_dump(mode="json"),
            classification=classification_by_pr[pr_result.pr_number],
        )
        for pr_result in payload.prep.stack
    )


def _planning_results(
    *,
    payload: StackFeedbackPlanInput,
    classification_by_pr: dict[int, dict[str, object]],
) -> tuple[FeedbackPlanningResult, ...]:
    plans = tuple(
        plan_feedback(
            manifest=pr_result.manifest.model_dump(mode="json"),
            classification=classification_by_pr[pr_result.pr_number],
        )
        for pr_result in payload.prep.stack
    )
    if not all(plan.valid for plan in plans):
        raise AssertionError("validated stack classifications must produce valid per-PR plans")
    return plans


def _merged_stack_plan_result(
    *,
    store: PayloadStore,
    prep: StackFeedbackPrepResult,
    validation: StackFeedbackPlanValidationSummary,
    per_pr_plans: tuple[FeedbackPlanningResult, ...],
) -> StackFeedbackPlanResult:
    batches = _merged_batches(prep=prep, per_pr_plans=per_pr_plans)
    informational = _merged_informational(prep=prep, per_pr_plans=per_pr_plans)
    automation_summary = _automation_discussion_summary(prep)
    return StackFeedbackPlanResult(
        valid=True,
        payload_session_id=store.session_id,
        pr_count=len(prep.stack),
        validation=validation,
        batches=batches,
        informational=informational,
        automation_discussion_summary=automation_summary,
        decision_docket=_decision_docket(
            prep=prep,
            batches=batches,
            informational=informational,
        ),
        summary=_plan_summary(
            batches=batches,
            informational=informational,
            automation_summary=automation_summary,
        ),
    )


def _merged_batches(
    *,
    prep: StackFeedbackPrepResult,
    per_pr_plans: tuple[FeedbackPlanningResult, ...],
) -> tuple[StackFeedbackPlanBatch, ...]:
    batches: list[StackFeedbackPlanBatch] = []
    for complexity in ACTION_COMPLEXITY_ORDER:
        items: list[StackFeedbackPlanItem] = []
        for pr_result, plan in zip(prep.stack, per_pr_plans, strict=True):
            source_batch = _batch_for_complexity(plan.batches, complexity)
            if source_batch is not None:
                items.extend(
                    _action_item(
                        pr_result=pr_result,
                        source_batch=source_batch,
                        item=item,
                    )
                    for item in source_batch.items
                )
        if items:
            batches.append(
                StackFeedbackPlanBatch(
                    batch_id=complexity,
                    complexity=complexity,
                    approval_required=complexity in APPROVAL_REQUIRED_COMPLEXITIES,
                    items=tuple(items),
                )
            )
    return tuple(batches)


def _batch_for_complexity(
    batches: tuple[FeedbackPlanBatch, ...],
    complexity: str,
) -> FeedbackPlanBatch | None:
    for batch in batches:
        if batch.batch_id == complexity:
            return batch
    return None


def _action_item(
    *,
    pr_result: StackFeedbackPrepPrResult,
    source_batch: FeedbackPlanBatch,
    item: FeedbackPlanActionItem,
) -> StackFeedbackPlanItem:
    return StackFeedbackPlanItem(
        pr_number=pr_result.pr_number,
        branch=pr_result.branch,
        title=pr_result.title,
        url=pr_result.url,
        source_batch_id=source_batch.batch_id,
        source_kind=item.source_kind,
        summary=item.summary,
        action_summary=item.action_summary,
        complexity=item.complexity,
        approval_required=source_batch.approval_required,
        review_id=item.review_id,
        review_state=item.review_state,
        submitted_at=item.submitted_at,
        thread_id=item.thread_id,
        discussion_comment_id=item.discussion_comment_id,
        covered_comment_ids=item.covered_comment_ids,
        body_locator=item.body_locator,
        thread_item_pointer=item.thread_item_pointer,
        path=item.path,
        line=item.line,
        start_line=item.start_line,
        is_outdated=item.is_outdated,
        author=item.author,
        needs_reply=item.needs_reply,
    )


def _merged_informational(
    *,
    prep: StackFeedbackPrepResult,
    per_pr_plans: tuple[FeedbackPlanningResult, ...],
) -> tuple[StackFeedbackPlanInformationalItem, ...]:
    items: list[StackFeedbackPlanInformationalItem] = []
    for pr_result, plan in zip(prep.stack, per_pr_plans, strict=True):
        items.extend(
            _informational_item(pr_result=pr_result, item=item) for item in plan.informational
        )
    return tuple(items)


def _informational_item(
    *,
    pr_result: StackFeedbackPrepPrResult,
    item: FeedbackPlanInformationalItem,
) -> StackFeedbackPlanInformationalItem:
    return StackFeedbackPlanInformationalItem(
        pr_number=pr_result.pr_number,
        branch=pr_result.branch,
        title=pr_result.title,
        url=pr_result.url,
        source_kind=item.source_kind,
        summary=item.summary,
        informational_reason=item.informational_reason,
        user_decision_required=item.user_decision_required,
        allowed_decisions=item.allowed_decisions,
        review_id=item.review_id,
        review_state=item.review_state,
        submitted_at=item.submitted_at,
        thread_id=item.thread_id,
        discussion_comment_id=item.discussion_comment_id,
        covered_comment_ids=item.covered_comment_ids,
        body_locator=item.body_locator,
        thread_item_pointer=item.thread_item_pointer,
        path=item.path,
        line=item.line,
        start_line=item.start_line,
        is_outdated=item.is_outdated,
        author=item.author,
    )


def _automation_discussion_summary(
    prep: StackFeedbackPrepResult,
) -> StackFeedbackAutomationDiscussionSummary:
    items = tuple(item for pr_result in prep.stack for item in pr_result.discussion_triage.items)
    summary = _triage_summary(items)
    return StackFeedbackAutomationDiscussionSummary(
        automation_like=summary.automation_like,
        human_like=summary.human_like,
        needs_agent_review=summary.needs_agent_review,
        by_reason=summary.by_reason,
    )


def _decision_docket(
    *,
    prep: StackFeedbackPrepResult,
    batches: tuple[StackFeedbackPlanBatch, ...],
    informational: tuple[StackFeedbackPlanInformationalItem, ...],
) -> tuple[StackFeedbackDecisionDocketItem, ...]:
    docket: list[StackFeedbackDecisionDocketItem] = []
    for batch in batches:
        for item in batch.items:
            if item.approval_required:
                docket.append(_action_decision(item, decision_kind="approval_required_action"))
            elif item.source_kind == "discussion_comment" and not _is_automation_discussion(
                prep=prep,
                pr_number=item.pr_number,
                discussion_comment_id=item.discussion_comment_id,
            ):
                docket.append(_action_decision(item, decision_kind="discussion_comment_action"))
    for item in informational:
        if item.user_decision_required:
            docket.append(
                _informational_decision(item, decision_kind="informational_review_thread")
            )
        elif item.source_kind == "discussion_comment" and not _is_automation_discussion(
            prep=prep,
            pr_number=item.pr_number,
            discussion_comment_id=item.discussion_comment_id,
        ):
            docket.append(_informational_decision(item, decision_kind="discussion_comment_review"))
    return tuple(docket)


def _is_automation_discussion(
    *,
    prep: StackFeedbackPrepResult,
    pr_number: int,
    discussion_comment_id: int | None,
) -> bool:
    if discussion_comment_id is None:
        return False
    for pr_result in prep.stack:
        if pr_result.pr_number != pr_number:
            continue
        for item in pr_result.discussion_triage.items:
            if item.comment_id == discussion_comment_id:
                return item.classification_hint == "automation"
    return False


def _action_decision(
    item: StackFeedbackPlanItem,
    *,
    decision_kind: DecisionKind,
) -> StackFeedbackDecisionDocketItem:
    return StackFeedbackDecisionDocketItem(
        decision_kind=decision_kind,
        pr_number=item.pr_number,
        branch=item.branch,
        title=item.title,
        url=item.url,
        source_kind=item.source_kind,
        thread_id=item.thread_id,
        discussion_comment_id=item.discussion_comment_id,
        path=item.path,
        line=item.line,
        summary=item.summary,
        action_summary=item.action_summary,
        recommended_decision="act",
        approval_required=item.approval_required,
    )


def _informational_decision(
    item: StackFeedbackPlanInformationalItem,
    *,
    decision_kind: DecisionKind,
) -> StackFeedbackDecisionDocketItem:
    return StackFeedbackDecisionDocketItem(
        decision_kind=decision_kind,
        pr_number=item.pr_number,
        branch=item.branch,
        title=item.title,
        url=item.url,
        source_kind=item.source_kind,
        thread_id=item.thread_id,
        discussion_comment_id=item.discussion_comment_id,
        path=item.path,
        line=item.line,
        summary=item.summary,
        recommended_decision="dismiss",
    )


def _plan_summary(
    *,
    batches: tuple[StackFeedbackPlanBatch, ...],
    informational: tuple[StackFeedbackPlanInformationalItem, ...],
    automation_summary: StackFeedbackAutomationDiscussionSummary,
) -> StackFeedbackPlanSummary:
    action_items = tuple(item for batch in batches for item in batch.items)
    return StackFeedbackPlanSummary(
        actionable_items=len(action_items),
        approval_required_items=sum(1 for item in action_items if item.approval_required),
        informational_items=len(informational),
        automation_discussion_comments=automation_summary.automation_like,
    )
