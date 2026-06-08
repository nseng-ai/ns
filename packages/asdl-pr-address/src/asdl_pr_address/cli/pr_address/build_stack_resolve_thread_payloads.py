"""Build per-PR resolve-thread-batch payloads from stack feedback decisions."""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Annotated

import click
from pydantic import ValidationError

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.resolve_thread_batch import (
    ResolveThreadBatchItem,
    ResolveThreadBatchPayload,
    first_duplicate_payload_thread_id,
)
from asdl_pr_address.cli.pr_address.resolve_thread_payload_decisions import (
    ThreadResolutionDecisionFields,
    build_thread_resolution_decision,
)
from asdl_pr_address.cli.pr_address.stack_feedback import (
    StackFeedbackPlanBatch,
    StackFeedbackPlanItem,
    StackFeedbackPlanResult,
)
from asdl_pr_address.cli.pr_address.string_values import trim_optional, trim_required

INVALID_STACK_PLAN_SHAPE_MESSAGE = (
    "stack_plan must be the data object returned by stack-feedback-plan."
)


class BuildStackResolveThreadPayloadsRequest(ClinkrModel):
    payload_json: Annotated[
        str | None,
        click.Option(["--payload-json"], type=click.STRING, required=False),
    ] = None


class StackResolveThreadDecision(ThreadResolutionDecisionFields):
    pr_number: int
    thread_id: str


class BuildStackResolveThreadPayloadsInput(ClinkrModel):
    stack_plan: dict[str, object]
    batch_id: str
    commit_sha: str | None = None
    continue_on_error: bool = False
    decisions: tuple[StackResolveThreadDecision, ...]


class BuildStackResolveThreadPayloadsError(ClinkrModel):
    code: str
    message: str
    batch_id: str | None = None
    pr_number: int | None = None
    thread_id: str | None = None
    actual_pr_number: int | None = None
    actual_batch_id: str | None = None


class StackIgnoredNonThreadItem(ClinkrModel):
    pr_number: int
    branch: str
    source_kind: str
    review_id: str | None = None
    discussion_comment_id: int | None = None
    summary: str


class StackSkippedResolveThreadItem(ClinkrModel):
    pr_number: int
    branch: str
    thread_id: str
    skip_reason: str
    summary: str


class StackResolveThreadPayloadEntry(ClinkrModel):
    pr_number: int
    branch: str
    title: str | None = None
    url: str | None = None
    batch_id: str
    source_batch_id: str | None = None
    payload_ready: bool
    review_thread_count: int
    resolved_thread_count: int
    skipped_thread_count: int
    ignored_non_thread_items: tuple[StackIgnoredNonThreadItem, ...] = ()
    skipped_items: tuple[StackSkippedResolveThreadItem, ...] = ()
    payload: ResolveThreadBatchPayload | None = None
    warnings: tuple[str, ...] = ()


class BuildStackResolveThreadPayloadsResult(ClinkrModel):
    valid: bool
    payloads_ready: bool
    batch_id: str
    commit_sha: str | None = None
    continue_on_error: bool = False
    review_thread_count: int
    resolved_thread_count: int
    skipped_thread_count: int
    ignored_non_thread_items: tuple[StackIgnoredNonThreadItem, ...] = ()
    skipped_items: tuple[StackSkippedResolveThreadItem, ...] = ()
    payloads: tuple[StackResolveThreadPayloadEntry, ...] = ()
    errors: tuple[BuildStackResolveThreadPayloadsError, ...] = ()
    warnings: tuple[str, ...] = ()


@clinkr_operation(
    name="build-stack-resolve-thread-payloads",
    help="Build non-mutating per-PR resolve-thread-batch payloads from stack decisions.",
)
def run_build_stack_resolve_thread_payloads(
    ctx: click.Context,
    request: BuildStackResolveThreadPayloadsRequest,
) -> ClinkrExit[BuildStackResolveThreadPayloadsResult]:
    del ctx
    payload = _load_payload(request)
    result = build_stack_resolve_thread_payloads(payload)
    if result.valid:
        return ClinkrExit.ok(result)
    return ClinkrExit.negative(
        result,
        message="Stack resolve-thread payload decisions failed validation; no payloads produced.",
    )


def build_stack_resolve_thread_payloads(
    request: BuildStackResolveThreadPayloadsInput,
) -> BuildStackResolveThreadPayloadsResult:
    batch_id = request.batch_id.strip()
    batch_commit_sha = trim_optional(request.commit_sha)

    try:
        stack_plan = StackFeedbackPlanResult.model_validate(request.stack_plan)
    except ValidationError:
        return _invalid_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            errors=(
                BuildStackResolveThreadPayloadsError(
                    code="invalid_stack_plan_shape",
                    message=INVALID_STACK_PLAN_SHAPE_MESSAGE,
                    batch_id=batch_id,
                ),
            ),
        )

    if not stack_plan.valid:
        return _invalid_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            errors=(
                BuildStackResolveThreadPayloadsError(
                    code="invalid_stack_plan",
                    message=(
                        "stack_plan.valid must be true before building stack resolve-thread "
                        "payloads."
                    ),
                    batch_id=batch_id,
                ),
            ),
        )

    selected_batch = _selected_batch(stack_plan.batches, batch_id)
    if selected_batch is None:
        return _invalid_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            errors=(
                BuildStackResolveThreadPayloadsError(
                    code="unknown_stack_batch",
                    message=f"No stack plan batch found for batch_id '{batch_id}'.",
                    batch_id=batch_id,
                ),
            ),
        )

    errors: list[BuildStackResolveThreadPayloadsError] = []
    candidates = _review_thread_candidates(selected_batch)
    ignored = _ignored_non_thread_items(selected_batch.items)
    for item in candidates:
        if trim_optional(item.thread_id) is None:
            errors.append(
                BuildStackResolveThreadPayloadsError(
                    code="invalid_stack_plan_thread_item",
                    message=(
                        "Selected stack batch contains a review-thread item without a thread_id."
                    ),
                    batch_id=batch_id,
                    pr_number=item.pr_number,
                )
            )

    candidates = tuple(item for item in candidates if trim_optional(item.thread_id) is not None)
    selected_keys = {(item.pr_number, trim_required(item.thread_id)) for item in candidates}
    selected_by_thread = _items_by_thread(candidates)
    other_batch_by_key = _other_batch_review_threads(
        plan=stack_plan,
        selected_batch_id=batch_id,
    )
    informational_keys = _informational_review_threads(stack_plan)

    decisions_by_key, duplicate_keys = _validate_decision_references(
        request=request,
        batch_id=batch_id,
        selected_keys=selected_keys,
        selected_by_thread=selected_by_thread,
        other_batch_by_key=other_batch_by_key,
        informational_keys=informational_keys,
        errors=errors,
    )

    for item in candidates:
        key = (item.pr_number, trim_required(item.thread_id))
        if key not in decisions_by_key:
            errors.append(
                BuildStackResolveThreadPayloadsError(
                    code="missing_thread_decision",
                    message=(
                        "Missing explicit resolve or skip decision for PR "
                        f"#{item.pr_number} thread {key[1]}."
                    ),
                    batch_id=batch_id,
                    pr_number=item.pr_number,
                    thread_id=key[1],
                )
            )

    payload_items_by_pr: dict[int, list[ResolveThreadBatchItem]] = defaultdict(list)
    skipped_by_pr: dict[int, list[StackSkippedResolveThreadItem]] = defaultdict(list)
    for item in candidates:
        thread_id = trim_required(item.thread_id)
        key = (item.pr_number, thread_id)
        if key in duplicate_keys or key not in decisions_by_key:
            continue
        decision_errors, payload_item, skipped_item = _validated_decision_item(
            batch_id=batch_id,
            batch_commit_sha=batch_commit_sha,
            plan_item=item,
            decision=decisions_by_key[key],
        )
        errors.extend(decision_errors)
        if decision_errors:
            continue
        if payload_item is not None:
            payload_items_by_pr[item.pr_number].append(payload_item)
        if skipped_item is not None:
            skipped_by_pr[item.pr_number].append(skipped_item)

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
                "Selected stack batch has no review-thread items; do not call "
                "resolve-thread-batch for this batch."
            ),
        )

    payloads, payload_errors = _payload_entries(
        batch_id=batch_id,
        commit_sha=batch_commit_sha,
        continue_on_error=request.continue_on_error,
        candidates=candidates,
        ignored=ignored,
        payload_items_by_pr=payload_items_by_pr,
        skipped_by_pr=skipped_by_pr,
    )
    if payload_errors:
        return _invalid_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            review_thread_count=review_thread_count,
            ignored_non_thread_items=ignored,
            errors=payload_errors,
        )

    skipped_items = tuple(item for items in skipped_by_pr.values() for item in items)
    if not any(entry.payload_ready for entry in payloads):
        return _no_payload_result(
            batch_id=batch_id,
            commit_sha=batch_commit_sha,
            continue_on_error=request.continue_on_error,
            review_thread_count=review_thread_count,
            ignored_non_thread_items=ignored,
            skipped_items=skipped_items,
            payloads=payloads,
            warning=(
                "All selected stack review-thread items were explicitly skipped; do not call "
                "resolve-thread-batch for this batch."
            ),
        )

    return BuildStackResolveThreadPayloadsResult(
        valid=True,
        payloads_ready=True,
        batch_id=batch_id,
        commit_sha=batch_commit_sha,
        continue_on_error=request.continue_on_error,
        review_thread_count=review_thread_count,
        resolved_thread_count=sum(entry.resolved_thread_count for entry in payloads),
        skipped_thread_count=sum(entry.skipped_thread_count for entry in payloads),
        ignored_non_thread_items=ignored,
        skipped_items=skipped_items,
        payloads=payloads,
    )


def _load_payload(
    request: BuildStackResolveThreadPayloadsRequest,
) -> BuildStackResolveThreadPayloadsInput:
    return load_json_input(
        option_value=request.payload_json,
        command_name="build-stack-resolve-thread-payloads",
        input_description="JSON payload",
        option_name="--payload-json",
        parser=_parse_payload,
    )


def _parse_payload(raw_payload: str) -> BuildStackResolveThreadPayloadsInput:
    return BuildStackResolveThreadPayloadsInput.model_validate(json.loads(raw_payload))


def _selected_batch(
    batches: tuple[StackFeedbackPlanBatch, ...],
    batch_id: str,
) -> StackFeedbackPlanBatch | None:
    for batch in batches:
        if batch.batch_id == batch_id:
            return batch
    return None


def _review_thread_candidates(
    selected_batch: StackFeedbackPlanBatch,
) -> tuple[StackFeedbackPlanItem, ...]:
    return tuple(item for item in selected_batch.items if item.source_kind == "review_thread")


def _ignored_non_thread_items(
    items: tuple[StackFeedbackPlanItem, ...],
) -> tuple[StackIgnoredNonThreadItem, ...]:
    ignored: list[StackIgnoredNonThreadItem] = []
    for item in items:
        if item.source_kind == "review_thread":
            continue
        ignored.append(
            StackIgnoredNonThreadItem(
                pr_number=item.pr_number,
                branch=item.branch,
                source_kind=item.source_kind,
                review_id=item.review_id,
                discussion_comment_id=item.discussion_comment_id,
                summary=item.summary,
            )
        )
    return tuple(ignored)


def _items_by_thread(
    items: tuple[StackFeedbackPlanItem, ...],
) -> dict[str, tuple[StackFeedbackPlanItem, ...]]:
    grouped: dict[str, list[StackFeedbackPlanItem]] = defaultdict(list)
    for item in items:
        thread_id = trim_optional(item.thread_id)
        if thread_id is not None:
            grouped[thread_id].append(item)
    return {thread_id: tuple(thread_items) for thread_id, thread_items in grouped.items()}


def _other_batch_review_threads(
    *,
    plan: StackFeedbackPlanResult,
    selected_batch_id: str,
) -> dict[tuple[int, str], str]:
    lookup: dict[tuple[int, str], str] = {}
    for batch in plan.batches:
        if batch.batch_id == selected_batch_id:
            continue
        for item in batch.items:
            if item.source_kind != "review_thread":
                continue
            thread_id = trim_optional(item.thread_id)
            if thread_id is not None:
                lookup[(item.pr_number, thread_id)] = batch.batch_id
    return lookup


def _informational_review_threads(plan: StackFeedbackPlanResult) -> set[tuple[int, str]]:
    lookup: set[tuple[int, str]] = set()
    for item in plan.informational:
        if item.source_kind != "review_thread":
            continue
        thread_id = trim_optional(item.thread_id)
        if thread_id is not None:
            lookup.add((item.pr_number, thread_id))
    return lookup


def _validate_decision_references(
    *,
    request: BuildStackResolveThreadPayloadsInput,
    batch_id: str,
    selected_keys: set[tuple[int, str]],
    selected_by_thread: dict[str, tuple[StackFeedbackPlanItem, ...]],
    other_batch_by_key: dict[tuple[int, str], str],
    informational_keys: set[tuple[int, str]],
    errors: list[BuildStackResolveThreadPayloadsError],
) -> tuple[dict[tuple[int, str], StackResolveThreadDecision], set[tuple[int, str]]]:
    decisions_by_key: dict[tuple[int, str], StackResolveThreadDecision] = {}
    duplicate_keys: set[tuple[int, str]] = set()
    for index, decision in enumerate(request.decisions):
        thread_id = decision.thread_id.strip()
        if not thread_id:
            errors.append(
                BuildStackResolveThreadPayloadsError(
                    code="empty_thread_decision",
                    message=f"decisions[{index}].thread_id must be non-empty.",
                    batch_id=batch_id,
                    pr_number=decision.pr_number,
                )
            )
            continue
        key = (decision.pr_number, thread_id)
        if key in decisions_by_key:
            duplicate_keys.add(key)
            errors.append(
                BuildStackResolveThreadPayloadsError(
                    code="duplicate_thread_decision",
                    message=(
                        f"Duplicate decision supplied for PR #{decision.pr_number} thread "
                        f"{thread_id}."
                    ),
                    batch_id=batch_id,
                    pr_number=decision.pr_number,
                    thread_id=thread_id,
                )
            )
            continue
        decisions_by_key[key] = decision

        if key in selected_keys:
            continue
        if thread_id in selected_by_thread:
            actual_item = selected_by_thread[thread_id][0]
            errors.append(
                BuildStackResolveThreadPayloadsError(
                    code="thread_pr_mismatch",
                    message=(
                        f"Decision references PR #{decision.pr_number} for thread {thread_id}, "
                        f"but selected batch has that thread on PR #{actual_item.pr_number}."
                    ),
                    batch_id=batch_id,
                    pr_number=decision.pr_number,
                    thread_id=thread_id,
                    actual_pr_number=actual_item.pr_number,
                )
            )
        elif key in other_batch_by_key:
            actual_batch_id = other_batch_by_key[key]
            errors.append(
                BuildStackResolveThreadPayloadsError(
                    code="thread_not_in_selected_batch",
                    message=(
                        f"Decision for PR #{decision.pr_number} thread {thread_id} belongs to "
                        f"batch '{actual_batch_id}', not selected batch '{batch_id}'."
                    ),
                    batch_id=batch_id,
                    pr_number=decision.pr_number,
                    thread_id=thread_id,
                    actual_batch_id=actual_batch_id,
                )
            )
        elif key in informational_keys:
            errors.append(
                BuildStackResolveThreadPayloadsError(
                    code="informational_thread_not_in_batch",
                    message=(
                        f"Decision for informational PR #{decision.pr_number} thread {thread_id} "
                        "cannot be converted into a resolve-thread-batch payload item."
                    ),
                    batch_id=batch_id,
                    pr_number=decision.pr_number,
                    thread_id=thread_id,
                )
            )
        else:
            errors.append(
                BuildStackResolveThreadPayloadsError(
                    code="unknown_thread_decision",
                    message=(
                        f"Decision references unknown PR #{decision.pr_number} thread {thread_id}."
                    ),
                    batch_id=batch_id,
                    pr_number=decision.pr_number,
                    thread_id=thread_id,
                )
            )
    return decisions_by_key, duplicate_keys


def _validated_decision_item(
    *,
    batch_id: str,
    batch_commit_sha: str | None,
    plan_item: StackFeedbackPlanItem,
    decision: StackResolveThreadDecision,
) -> tuple[
    list[BuildStackResolveThreadPayloadsError],
    ResolveThreadBatchItem | None,
    StackSkippedResolveThreadItem | None,
]:
    thread_id = trim_required(plan_item.thread_id)
    built = build_thread_resolution_decision(
        thread_id=thread_id,
        subject_label=f"PR #{plan_item.pr_number} thread {thread_id}",
        batch_commit_sha=batch_commit_sha,
        decision=decision,
    )
    errors = [
        BuildStackResolveThreadPayloadsError(
            code=issue.code,
            message=issue.message,
            batch_id=batch_id,
            pr_number=plan_item.pr_number,
            thread_id=thread_id,
        )
        for issue in built.errors
    ]
    if errors:
        return errors, None, None
    if built.skip_reason is not None:
        return (
            [],
            None,
            StackSkippedResolveThreadItem(
                pr_number=plan_item.pr_number,
                branch=plan_item.branch,
                thread_id=thread_id,
                skip_reason=built.skip_reason,
                summary=plan_item.summary,
            ),
        )
    return [], built.payload_item, None


def _payload_entries(
    *,
    batch_id: str,
    commit_sha: str | None,
    continue_on_error: bool,
    candidates: tuple[StackFeedbackPlanItem, ...],
    ignored: tuple[StackIgnoredNonThreadItem, ...],
    payload_items_by_pr: dict[int, list[ResolveThreadBatchItem]],
    skipped_by_pr: dict[int, list[StackSkippedResolveThreadItem]],
) -> tuple[
    tuple[StackResolveThreadPayloadEntry, ...],
    tuple[BuildStackResolveThreadPayloadsError, ...],
]:
    entries: list[StackResolveThreadPayloadEntry] = []
    errors: list[BuildStackResolveThreadPayloadsError] = []
    candidates_by_pr = _candidates_by_pr(candidates)
    for pr_number, pr_candidates in candidates_by_pr.items():
        representative = pr_candidates[0]
        payload_items = tuple(payload_items_by_pr.get(pr_number, []))
        payload = None
        payload_ready = bool(payload_items)
        if payload_items:
            payload = ResolveThreadBatchPayload(
                commit_sha=commit_sha,
                continue_on_error=continue_on_error,
                items=payload_items,
            )
            errors.extend(
                _payload_cross_item_errors(
                    payload=payload,
                    batch_id=batch_id,
                    pr_number=pr_number,
                )
            )
        skipped_items = tuple(skipped_by_pr.get(pr_number, []))
        entries.append(
            StackResolveThreadPayloadEntry(
                pr_number=pr_number,
                branch=representative.branch,
                title=representative.title,
                url=representative.url,
                batch_id=batch_id,
                source_batch_id=representative.source_batch_id,
                payload_ready=payload_ready,
                review_thread_count=len(pr_candidates),
                resolved_thread_count=len(payload_items),
                skipped_thread_count=len(skipped_items),
                ignored_non_thread_items=tuple(
                    item for item in ignored if item.pr_number == pr_number
                ),
                skipped_items=skipped_items,
                payload=payload,
                warnings=()
                if payload_ready
                else ("No resolve-thread-batch payload is needed for this PR.",),
            )
        )
    return tuple(entries), tuple(errors)


def _candidates_by_pr(
    candidates: tuple[StackFeedbackPlanItem, ...],
) -> dict[int, tuple[StackFeedbackPlanItem, ...]]:
    grouped: dict[int, list[StackFeedbackPlanItem]] = defaultdict(list)
    for item in candidates:
        grouped[item.pr_number].append(item)
    return {pr_number: tuple(items) for pr_number, items in grouped.items()}


def _payload_cross_item_errors(
    *,
    payload: ResolveThreadBatchPayload,
    batch_id: str,
    pr_number: int,
) -> tuple[BuildStackResolveThreadPayloadsError, ...]:
    duplicate_thread_id = first_duplicate_payload_thread_id(payload)
    if duplicate_thread_id is None:
        return ()
    return (
        BuildStackResolveThreadPayloadsError(
            code="canonical_payload_invalid",
            message=(
                f"Duplicate thread_id in PR #{pr_number} resolve-thread-batch payload: "
                f"{duplicate_thread_id}"
            ),
            batch_id=batch_id,
            pr_number=pr_number,
            thread_id=duplicate_thread_id,
        ),
    )


def _invalid_result(
    *,
    batch_id: str,
    commit_sha: str | None,
    continue_on_error: bool,
    errors: tuple[BuildStackResolveThreadPayloadsError, ...],
    review_thread_count: int = 0,
    ignored_non_thread_items: tuple[StackIgnoredNonThreadItem, ...] = (),
) -> BuildStackResolveThreadPayloadsResult:
    return BuildStackResolveThreadPayloadsResult(
        valid=False,
        payloads_ready=False,
        batch_id=batch_id,
        commit_sha=commit_sha,
        continue_on_error=continue_on_error,
        review_thread_count=review_thread_count,
        resolved_thread_count=0,
        skipped_thread_count=0,
        ignored_non_thread_items=ignored_non_thread_items,
        payloads=(),
        errors=errors,
    )


def _no_payload_result(
    *,
    batch_id: str,
    commit_sha: str | None,
    continue_on_error: bool,
    review_thread_count: int,
    ignored_non_thread_items: tuple[StackIgnoredNonThreadItem, ...],
    skipped_items: tuple[StackSkippedResolveThreadItem, ...],
    warning: str,
    payloads: tuple[StackResolveThreadPayloadEntry, ...] = (),
) -> BuildStackResolveThreadPayloadsResult:
    return BuildStackResolveThreadPayloadsResult(
        valid=True,
        payloads_ready=False,
        batch_id=batch_id,
        commit_sha=commit_sha,
        continue_on_error=continue_on_error,
        review_thread_count=review_thread_count,
        resolved_thread_count=0,
        skipped_thread_count=len(skipped_items),
        ignored_non_thread_items=ignored_non_thread_items,
        skipped_items=skipped_items,
        payloads=payloads,
        warnings=(warning,),
    )
