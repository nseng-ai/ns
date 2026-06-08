"""Build validated resolve-thread-batch payloads from planned feedback decisions."""

from __future__ import annotations

from typing import Annotated, cast

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.feedback_planning import (
    FeedbackPlanActionItem,
    FeedbackPlanningResult,
)
from asdl_pr_address.cli.pr_address.reply_formatting import (
    VALID_RESOLUTION_MODES,
    ResolutionReplyMode,
    valid_resolution_modes_text,
)
from asdl_pr_address.cli.pr_address.resolution_provenance import (
    ResolutionProvenanceInput,
    provenance_shape_error,
)
from asdl_pr_address.cli.pr_address.resolve_thread_batch import (
    ResolveThreadBatchItem,
    ResolveThreadBatchPayload,
)
from asdl_pr_address.cli.pr_address.string_values import trim_optional, trim_required


class BuildResolveThreadBatchPayloadRequest(ClinkrModel):
    payload_json: Annotated[
        str | None,
        click.Option(["--payload-json"], type=click.STRING, required=False),
    ] = None


class ResolveThreadBatchDecision(ClinkrModel):
    thread_id: str
    action: str
    mode: str | None = None
    message: str | None = None
    commit_sha: str | None = None
    provenance: ResolutionProvenanceInput | None = None
    skip_reason: str | None = None


class BuildResolveThreadBatchPayloadInput(ClinkrModel):
    plan: dict[str, object]
    batch_id: str
    commit_sha: str | None = None
    continue_on_error: bool = False
    decisions: tuple[ResolveThreadBatchDecision, ...]


class BuildResolveThreadBatchPayloadError(ClinkrModel):
    code: str
    message: str
    batch_id: str | None = None
    thread_id: str | None = None


class IgnoredNonThreadItem(ClinkrModel):
    source_kind: str
    review_id: str | None = None
    discussion_comment_id: int | None = None
    summary: str


class SkippedResolveThreadItem(ClinkrModel):
    thread_id: str
    skip_reason: str
    summary: str


class BuildResolveThreadBatchPayloadResult(ClinkrModel):
    valid: bool
    payload_ready: bool
    batch_id: str
    commit_sha: str | None = None
    continue_on_error: bool = False
    review_thread_count: int
    resolved_thread_count: int
    skipped_thread_count: int
    ignored_non_thread_items: tuple[IgnoredNonThreadItem, ...] = ()
    skipped_items: tuple[SkippedResolveThreadItem, ...] = ()
    payload: ResolveThreadBatchPayload | None = None
    errors: tuple[BuildResolveThreadBatchPayloadError, ...] = ()
    warnings: tuple[str, ...] = ()


@clinkr_operation(
    name="build-resolve-thread-batch-payload",
    help="Build a non-mutating resolve-thread-batch payload from planned feedback decisions.",
)
def run_build_resolve_thread_batch_payload(
    ctx: click.Context,
    request: BuildResolveThreadBatchPayloadRequest,
) -> ClinkrExit[BuildResolveThreadBatchPayloadResult]:
    del ctx
    payload = _load_payload(request)
    result = build_resolve_thread_batch_payload(payload)
    if result.valid:
        return ClinkrExit.ok(result)
    return ClinkrExit.negative(
        result,
        message="Resolve-thread batch payload decisions failed validation; no payload produced.",
    )


def build_resolve_thread_batch_payload(
    request: BuildResolveThreadBatchPayloadInput,
) -> BuildResolveThreadBatchPayloadResult:
    plan = FeedbackPlanningResult.model_validate(request.plan)
    batch_id = request.batch_id.strip()
    batch_commit_sha = trim_optional(request.commit_sha)

    if not plan.valid:
        return _invalid_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            errors=(
                BuildResolveThreadBatchPayloadError(
                    code="invalid_plan",
                    message=(
                        "plan.valid must be true before building a resolve-thread-batch payload."
                    ),
                    batch_id=batch_id,
                ),
            ),
        )

    selected_batch = None
    for batch in plan.batches:
        if batch.batch_id == batch_id:
            selected_batch = batch
            break
    if selected_batch is None:
        return _invalid_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            errors=(
                BuildResolveThreadBatchPayloadError(
                    code="unknown_batch",
                    message=f"No plan batch found for batch_id '{batch_id}'.",
                    batch_id=batch_id,
                ),
            ),
        )

    errors: list[BuildResolveThreadBatchPayloadError] = []
    candidates: list[FeedbackPlanActionItem] = []
    ignored = _ignored_non_thread_items(selected_batch.items)
    for item in selected_batch.items:
        if item.source_kind != "review_thread":
            continue
        thread_id = trim_optional(item.thread_id)
        if thread_id is None:
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="invalid_plan_thread_item",
                    message="Selected batch contains a review-thread item without a thread_id.",
                    batch_id=batch_id,
                )
            )
            continue
        candidates.append(item)

    selected_thread_ids = {trim_required(item.thread_id) for item in candidates}
    other_batch_by_thread = _other_batch_review_threads(plan=plan, selected_batch_id=batch_id)
    informational_thread_ids: set[str] = set()
    for item in plan.informational:
        if item.source_kind != "review_thread":
            continue
        thread_id = trim_optional(item.thread_id)
        if thread_id is not None:
            informational_thread_ids.add(thread_id)

    decisions_by_thread: dict[str, ResolveThreadBatchDecision] = {}
    duplicate_thread_ids: set[str] = set()
    for index, decision in enumerate(request.decisions):
        thread_id = decision.thread_id.strip()
        if not thread_id:
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="empty_thread_decision",
                    message=f"decisions[{index}].thread_id must be non-empty.",
                    batch_id=batch_id,
                )
            )
            continue
        if thread_id in decisions_by_thread:
            duplicate_thread_ids.add(thread_id)
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="duplicate_thread_decision",
                    message=f"Duplicate decision supplied for thread {thread_id}.",
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )
            continue
        decisions_by_thread[thread_id] = decision

        if thread_id in selected_thread_ids:
            continue
        if thread_id in other_batch_by_thread:
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="thread_not_in_selected_batch",
                    message=(
                        f"Decision for thread {thread_id} belongs to batch "
                        f"'{other_batch_by_thread[thread_id]}', not selected batch '{batch_id}'."
                    ),
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )
        elif thread_id in informational_thread_ids:
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="informational_thread_not_in_batch",
                    message=(
                        f"Decision for informational thread {thread_id} cannot be converted into "
                        "a resolve-thread-batch payload item."
                    ),
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )
        else:
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="unknown_thread_decision",
                    message=f"Decision references unknown thread {thread_id}.",
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )

    for item in candidates:
        thread_id = trim_required(item.thread_id)
        if thread_id not in decisions_by_thread:
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="missing_thread_decision",
                    message=f"Missing explicit resolve or skip decision for thread {thread_id}.",
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )

    payload_items: list[ResolveThreadBatchItem] = []
    skipped_items: list[SkippedResolveThreadItem] = []
    for item in candidates:
        thread_id = trim_required(item.thread_id)
        if thread_id in duplicate_thread_ids or thread_id not in decisions_by_thread:
            continue
        decision = decisions_by_thread[thread_id]
        decision_errors, payload_item, skipped_item = _validated_decision_item(
            batch_id=batch_id,
            batch_commit_sha=batch_commit_sha,
            plan_item=item,
            decision=decision,
        )
        errors.extend(decision_errors)
        if decision_errors:
            continue
        if payload_item is not None:
            payload_items.append(payload_item)
        if skipped_item is not None:
            skipped_items.append(skipped_item)

    review_thread_count = len(candidates)
    if errors:
        return _invalid_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            review_thread_count=review_thread_count,
            ignored_non_thread_items=ignored,
            errors=tuple(errors),
        )

    if not candidates:
        return _no_payload_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            review_thread_count=0,
            ignored_non_thread_items=ignored,
            skipped_items=(),
            warning=(
                "Selected batch has no review-thread items; "
                "do not call resolve-thread-batch for this batch."
            ),
        )

    if not payload_items:
        return _no_payload_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            review_thread_count=review_thread_count,
            ignored_non_thread_items=ignored,
            skipped_items=tuple(skipped_items),
            warning=(
                "All selected review-thread items were explicitly skipped; "
                "do not call resolve-thread-batch for this batch."
            ),
        )

    canonical_payload = ResolveThreadBatchPayload(
        commit_sha=batch_commit_sha,
        continue_on_error=request.continue_on_error,
        items=tuple(payload_items),
    )
    canonical_errors = _payload_cross_item_errors(
        payload=canonical_payload,
        batch_id=batch_id,
    )
    if canonical_errors:
        return _invalid_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            review_thread_count=review_thread_count,
            ignored_non_thread_items=ignored,
            errors=canonical_errors,
        )

    return BuildResolveThreadBatchPayloadResult(
        valid=True,
        payload_ready=True,
        batch_id=batch_id,
        commit_sha=batch_commit_sha,
        continue_on_error=request.continue_on_error,
        review_thread_count=review_thread_count,
        resolved_thread_count=len(payload_items),
        skipped_thread_count=len(skipped_items),
        ignored_non_thread_items=ignored,
        skipped_items=tuple(skipped_items),
        payload=canonical_payload,
    )


def _load_payload(
    request: BuildResolveThreadBatchPayloadRequest,
) -> BuildResolveThreadBatchPayloadInput:
    return load_json_input(
        option_value=request.payload_json,
        command_name="build-resolve-thread-batch-payload",
        input_description="JSON payload",
        option_name="--payload-json",
        parser=BuildResolveThreadBatchPayloadInput.model_validate_json,
    )


def _ignored_non_thread_items(
    items: tuple[FeedbackPlanActionItem, ...],
) -> tuple[IgnoredNonThreadItem, ...]:
    ignored: list[IgnoredNonThreadItem] = []
    for item in items:
        if item.source_kind == "review_thread":
            continue
        ignored.append(
            IgnoredNonThreadItem(
                source_kind=item.source_kind,
                review_id=item.review_id,
                discussion_comment_id=item.discussion_comment_id,
                summary=item.summary,
            )
        )
    return tuple(ignored)


def _other_batch_review_threads(
    *,
    plan: FeedbackPlanningResult,
    selected_batch_id: str,
) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for batch in plan.batches:
        if batch.batch_id == selected_batch_id:
            continue
        for item in batch.items:
            if item.source_kind != "review_thread":
                continue
            thread_id = trim_optional(item.thread_id)
            if thread_id is not None:
                lookup[thread_id] = batch.batch_id
    return lookup


def _validated_decision_item(
    *,
    batch_id: str,
    batch_commit_sha: str | None,
    plan_item: FeedbackPlanActionItem,
    decision: ResolveThreadBatchDecision,
) -> tuple[
    list[BuildResolveThreadBatchPayloadError],
    ResolveThreadBatchItem | None,
    SkippedResolveThreadItem | None,
]:
    thread_id = trim_required(plan_item.thread_id)
    errors: list[BuildResolveThreadBatchPayloadError] = []
    action = decision.action.strip()
    mode = trim_optional(decision.mode)
    message = trim_optional(decision.message)
    item_commit_sha = trim_optional(decision.commit_sha)
    skip_reason = trim_optional(decision.skip_reason)
    provenance = decision.provenance

    if action == "skip":
        if skip_reason is None:
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="missing_skip_reason",
                    message=(
                        f"Skip decision for thread {thread_id} requires a non-empty skip_reason."
                    ),
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )
        if (
            mode is not None
            or message is not None
            or item_commit_sha is not None
            or provenance is not None
        ):
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="skip_decision_has_resolution_fields",
                    message=(
                        f"Skip decision for thread {thread_id} must not include non-empty "
                        "mode, message, commit_sha, or provenance fields."
                    ),
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )
        if errors:
            return errors, None, None
        return (
            [],
            None,
            SkippedResolveThreadItem(
                thread_id=thread_id,
                skip_reason=trim_required(skip_reason),
                summary=plan_item.summary,
            ),
        )

    if action != "resolve":
        return (
            [
                BuildResolveThreadBatchPayloadError(
                    code="invalid_action",
                    message=(
                        f"Decision for thread {thread_id} must use action='resolve' or "
                        "action='skip'."
                    ),
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            ],
            None,
            None,
        )

    if mode not in VALID_RESOLUTION_MODES:
        errors.append(
            BuildResolveThreadBatchPayloadError(
                code="invalid_mode",
                message=(
                    "Resolve decision for thread "
                    f"{thread_id} must use one of: {valid_resolution_modes_text()}."
                ),
                batch_id=batch_id,
                thread_id=thread_id,
            )
        )
        return errors, None, None

    if mode in ("fixed", "explained", "planned") and message is None:
        errors.append(
            BuildResolveThreadBatchPayloadError(
                code="missing_message",
                message=(
                    f"mode='{mode}' decision for thread {thread_id} requires a non-empty message."
                ),
                batch_id=batch_id,
                thread_id=thread_id,
            )
        )
    if mode == "fixed" and item_commit_sha is None and batch_commit_sha is None:
        errors.append(
            BuildResolveThreadBatchPayloadError(
                code="missing_commit_sha",
                message=(
                    f"Decision for thread {thread_id} uses mode='fixed' but no batch or "
                    "item commit_sha was supplied."
                ),
                batch_id=batch_id,
                thread_id=thread_id,
            )
        )
    if mode == "planned":
        if provenance is None:
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="missing_provenance",
                    message=f"mode='planned' decision for thread {thread_id} requires provenance.",
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )
        if item_commit_sha is not None or batch_commit_sha is not None:
            errors.append(
                BuildResolveThreadBatchPayloadError(
                    code="planned_has_commit_sha",
                    message=(
                        f"mode='planned' decision for thread {thread_id} must not include batch or "
                        "item commit_sha fields."
                    ),
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )
        if provenance is not None:
            error_message = provenance_shape_error(provenance)
            if error_message is not None:
                errors.append(
                    BuildResolveThreadBatchPayloadError(
                        code="invalid_provenance_shape",
                        message=f"mode='planned' decision for thread {thread_id}: {error_message}.",
                        batch_id=batch_id,
                        thread_id=thread_id,
                    )
                )
    if mode == "pre_existing" and (
        message is not None or item_commit_sha is not None or provenance is not None
    ):
        errors.append(
            BuildResolveThreadBatchPayloadError(
                code="pre_existing_has_resolution_fields",
                message=(
                    f"mode='pre_existing' decision for thread {thread_id} must not include "
                    "non-empty message, commit_sha, or provenance fields."
                ),
                batch_id=batch_id,
                thread_id=thread_id,
            )
        )
    if errors:
        return errors, None, None

    resolution_mode = cast(ResolutionReplyMode, mode)
    if resolution_mode == "pre_existing":
        return (
            [],
            ResolveThreadBatchItem(
                thread_id=thread_id,
                mode=resolution_mode,
                message=None,
                commit_sha=None,
                provenance=None,
            ),
            None,
        )

    return (
        [],
        ResolveThreadBatchItem(
            thread_id=thread_id,
            mode=resolution_mode,
            message=message,
            commit_sha=item_commit_sha,
            provenance=provenance if resolution_mode == "planned" else None,
        ),
        None,
    )


def _payload_cross_item_errors(
    *,
    payload: ResolveThreadBatchPayload,
    batch_id: str,
) -> tuple[BuildResolveThreadBatchPayloadError, ...]:
    """Validate invariants spanning multiple constructed payload items.

    Per-item request normalization is already covered by `_validated_decision_item` and Pydantic
    construction. This remains as a resolver safety check for malformed plans that list the same
    review thread more than once in one batch.
    """
    seen_thread_ids: set[str] = set()
    for item in payload.items:
        if item.thread_id in seen_thread_ids:
            return (
                BuildResolveThreadBatchPayloadError(
                    code="canonical_payload_invalid",
                    message=(
                        f"Duplicate thread_id in resolve-thread-batch payload: {item.thread_id}"
                    ),
                    batch_id=batch_id,
                    thread_id=item.thread_id,
                ),
            )
        seen_thread_ids.add(item.thread_id)
    return ()


def _invalid_result(
    *,
    batch_id: str,
    commit_sha: str | None,
    continue_on_error: bool,
    errors: tuple[BuildResolveThreadBatchPayloadError, ...],
    review_thread_count: int = 0,
    ignored_non_thread_items: tuple[IgnoredNonThreadItem, ...] = (),
) -> BuildResolveThreadBatchPayloadResult:
    return BuildResolveThreadBatchPayloadResult(
        valid=False,
        payload_ready=False,
        batch_id=batch_id,
        commit_sha=commit_sha,
        continue_on_error=continue_on_error,
        review_thread_count=review_thread_count,
        resolved_thread_count=0,
        skipped_thread_count=0,
        ignored_non_thread_items=ignored_non_thread_items,
        payload=None,
        errors=errors,
    )


def _no_payload_result(
    *,
    batch_id: str,
    commit_sha: str | None,
    continue_on_error: bool,
    review_thread_count: int,
    ignored_non_thread_items: tuple[IgnoredNonThreadItem, ...],
    skipped_items: tuple[SkippedResolveThreadItem, ...],
    warning: str,
) -> BuildResolveThreadBatchPayloadResult:
    return BuildResolveThreadBatchPayloadResult(
        valid=True,
        payload_ready=False,
        batch_id=batch_id,
        commit_sha=commit_sha,
        continue_on_error=continue_on_error,
        review_thread_count=review_thread_count,
        resolved_thread_count=0,
        skipped_thread_count=len(skipped_items),
        ignored_non_thread_items=ignored_non_thread_items,
        skipped_items=skipped_items,
        payload=None,
        warnings=(warning,),
    )
