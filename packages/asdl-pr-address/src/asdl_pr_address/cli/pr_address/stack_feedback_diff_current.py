"""Compare a stack feedback plan with freshly fetched current stack feedback."""

from __future__ import annotations

from typing import Annotated

import click
from pydantic import ValidationError

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.feedback_payload import ThreadManifestItem
from asdl_pr_address.cli.pr_address.stack_feedback import (
    StackFeedbackPlanItem,
    StackFeedbackPlanResult,
    StackFeedbackPrepResult,
)
from asdl_pr_address.cli.pr_address.stack_feedback_thread_index import (
    ThreadKey,
    actionable_review_thread_items,
    duplicate_thread_keys,
    known_review_thread_keys,
    planned_pr_numbers,
    thread_key,
)
from asdl_pr_address.cli.pr_address.string_values import trim_required

INVALID_STACK_PLAN_SHAPE_MESSAGE = (
    "stack_plan must be the data object returned by stack-feedback-plan."
)
INVALID_CURRENT_PREP_SHAPE_MESSAGE = (
    "current_prep must be the data object returned by stack-feedback-prep."
)


class StackFeedbackDiffCurrentRequest(ClinkrModel):
    payload_json: Annotated[
        str | None,
        click.Option(["--payload-json"], type=click.STRING, required=False),
    ] = None
    payload_file: Annotated[
        str | None,
        click.Option(["--payload-file"], type=click.STRING, required=False),
    ] = None


class StackFeedbackDiffCurrentInput(ClinkrModel):
    stack_plan: dict[str, object]
    current_prep: dict[str, object]


class StackFeedbackDiffPlannedThread(ClinkrModel):
    pr_number: int
    branch: str
    title: str | None = None
    url: str | None = None
    thread_id: str
    source_batch_id: str | None = None
    summary: str
    path: str | None = None
    line: int | None = None
    start_line: int | None = None
    is_outdated: bool | None = None


class StackFeedbackDiffCurrentThread(ClinkrModel):
    pr_number: int
    branch: str
    title: str | None = None
    url: str | None = None
    thread_id: str
    path: str
    line: int | None = None
    start_line: int | None = None
    is_outdated: bool
    comment_count: int


class StackFeedbackDiffMissingOrOutdatedThread(StackFeedbackDiffPlannedThread):
    reason: str
    changed_fields: tuple[str, ...] = ()


class StackFeedbackDiffCurrentError(ClinkrModel):
    code: str
    message: str
    pr_number: int | None = None
    thread_id: str | None = None


class StackFeedbackDiffCurrentSummary(ClinkrModel):
    pr_count: int
    planned_actionable_review_threads: int
    planned_known_review_threads: int
    current_unresolved_review_threads: int
    planned_still_unresolved: int
    planned_already_resolved: int
    new_unresolved_threads: int
    missing_or_outdated_planned_threads: int


class StackFeedbackDiffCurrentResult(ClinkrModel):
    valid: bool
    safe_to_resolve_planned: bool
    planned_still_unresolved: tuple[StackFeedbackDiffPlannedThread, ...] = ()
    planned_already_resolved: tuple[StackFeedbackDiffPlannedThread, ...] = ()
    new_unresolved_threads: tuple[StackFeedbackDiffCurrentThread, ...] = ()
    missing_or_outdated_planned_threads: tuple[StackFeedbackDiffMissingOrOutdatedThread, ...] = ()
    warnings: tuple[str, ...] = ()
    errors: tuple[StackFeedbackDiffCurrentError, ...] = ()
    summary: StackFeedbackDiffCurrentSummary


@clinkr_operation(
    name="stack-feedback-diff-current",
    help="Compare a stack-feedback-plan against freshly fetched current stack feedback.",
)
def run_stack_feedback_diff_current(
    ctx: click.Context,
    request: StackFeedbackDiffCurrentRequest,
) -> ClinkrExit[StackFeedbackDiffCurrentResult]:
    del ctx
    payload = _load_payload(request)
    result = diff_stack_feedback_current(payload)
    if result.valid and result.safe_to_resolve_planned:
        return ClinkrExit.ok(result)
    return ClinkrExit.negative(
        result,
        message=(
            "Current stack feedback differs from the validated stack plan; "
            "do not resolve planned threads without reviewing the drift."
        ),
    )


def diff_stack_feedback_current(
    request: StackFeedbackDiffCurrentInput,
) -> StackFeedbackDiffCurrentResult:
    try:
        stack_plan = StackFeedbackPlanResult.model_validate(request.stack_plan)
    except ValidationError:
        return _invalid_result(
            errors=(
                StackFeedbackDiffCurrentError(
                    code="invalid_stack_plan_shape",
                    message=INVALID_STACK_PLAN_SHAPE_MESSAGE,
                ),
            )
        )

    try:
        current_prep = StackFeedbackPrepResult.model_validate(request.current_prep)
    except ValidationError:
        return _invalid_result(
            errors=(
                StackFeedbackDiffCurrentError(
                    code="invalid_current_prep_shape",
                    message=INVALID_CURRENT_PREP_SHAPE_MESSAGE,
                ),
            )
        )

    warnings = _current_prep_warnings(current_prep)
    planned_actionable = actionable_review_thread_items(stack_plan)
    planned_known_keys = known_review_thread_keys(stack_plan)
    current_by_key, current_thread_errors = _current_threads_by_key(current_prep)
    errors = _validation_errors(
        stack_plan=stack_plan,
        current_prep=current_prep,
        planned_actionable=planned_actionable,
        current_thread_errors=current_thread_errors,
    )

    if errors:
        return _semantic_invalid_result(
            current_prep=current_prep,
            planned_actionable=planned_actionable,
            planned_known_keys=planned_known_keys,
            warnings=warnings,
            errors=errors,
        )

    return _diff_valid_stack_feedback(
        current_prep=current_prep,
        planned_actionable=planned_actionable,
        planned_known_keys=planned_known_keys,
        current_by_key=current_by_key,
        warnings=warnings,
    )


def _load_payload(request: StackFeedbackDiffCurrentRequest) -> StackFeedbackDiffCurrentInput:
    return load_json_input(
        option_value=request.payload_json,
        file_path=request.payload_file,
        command_name="stack-feedback-diff-current",
        input_description="stack feedback diff JSON payload",
        option_name="--payload-json",
        file_option_name="--payload-file",
        parser=StackFeedbackDiffCurrentInput.model_validate_json,
    )


def _diff_valid_stack_feedback(
    *,
    current_prep: StackFeedbackPrepResult,
    planned_actionable: tuple[StackFeedbackPlanItem, ...],
    planned_known_keys: set[ThreadKey],
    current_by_key: dict[ThreadKey, ThreadManifestItem],
    warnings: tuple[str, ...],
) -> StackFeedbackDiffCurrentResult:
    planned_still_unresolved: list[StackFeedbackDiffPlannedThread] = []
    planned_already_resolved: list[StackFeedbackDiffPlannedThread] = []
    missing_or_outdated: list[StackFeedbackDiffMissingOrOutdatedThread] = []

    for item in planned_actionable:
        key = thread_key(item.pr_number, item.thread_id)
        if key is None:
            continue
        if key not in current_by_key:
            missing_or_outdated.append(
                _missing_or_outdated_thread(item, reason="missing_current_thread")
            )
            continue
        current_thread = current_by_key[key]
        if current_thread.is_resolved:
            planned_already_resolved.append(_planned_thread(item))
            continue
        changed_fields = _material_metadata_mismatch(item, current_thread)
        if changed_fields:
            reason = "outdated_changed" if "is_outdated" in changed_fields else "metadata_changed"
            missing_or_outdated.append(
                _missing_or_outdated_thread(
                    item,
                    reason=reason,
                    changed_fields=changed_fields,
                )
            )
            continue
        planned_still_unresolved.append(_planned_thread(item))

    new_unresolved = _new_unresolved_threads(
        current_prep=current_prep,
        planned_known_keys=planned_known_keys,
    )
    safe_to_resolve_planned = (
        not planned_already_resolved
        and not new_unresolved
        and not missing_or_outdated
        and not warnings
    )

    return StackFeedbackDiffCurrentResult(
        valid=True,
        safe_to_resolve_planned=safe_to_resolve_planned,
        planned_still_unresolved=tuple(planned_still_unresolved),
        planned_already_resolved=tuple(planned_already_resolved),
        new_unresolved_threads=new_unresolved,
        missing_or_outdated_planned_threads=tuple(missing_or_outdated),
        warnings=warnings,
        errors=(),
        summary=_summary(
            current_prep=current_prep,
            planned_actionable=planned_actionable,
            planned_known_keys=planned_known_keys,
            planned_still_unresolved=len(planned_still_unresolved),
            planned_already_resolved=len(planned_already_resolved),
            new_unresolved_threads=len(new_unresolved),
            missing_or_outdated_planned_threads=len(missing_or_outdated),
        ),
    )


def _semantic_invalid_result(
    *,
    current_prep: StackFeedbackPrepResult,
    planned_actionable: tuple[StackFeedbackPlanItem, ...],
    planned_known_keys: set[ThreadKey],
    warnings: tuple[str, ...],
    errors: tuple[StackFeedbackDiffCurrentError, ...],
) -> StackFeedbackDiffCurrentResult:
    return StackFeedbackDiffCurrentResult(
        valid=False,
        safe_to_resolve_planned=False,
        warnings=warnings,
        errors=errors,
        summary=_summary(
            current_prep=current_prep,
            planned_actionable=planned_actionable,
            planned_known_keys=planned_known_keys,
            planned_still_unresolved=0,
            planned_already_resolved=0,
            new_unresolved_threads=0,
            missing_or_outdated_planned_threads=0,
        ),
    )


def _summary(
    *,
    current_prep: StackFeedbackPrepResult,
    planned_actionable: tuple[StackFeedbackPlanItem, ...],
    planned_known_keys: set[ThreadKey],
    planned_still_unresolved: int,
    planned_already_resolved: int,
    new_unresolved_threads: int,
    missing_or_outdated_planned_threads: int,
) -> StackFeedbackDiffCurrentSummary:
    return StackFeedbackDiffCurrentSummary(
        pr_count=len(current_prep.stack),
        planned_actionable_review_threads=len(planned_actionable),
        planned_known_review_threads=len(planned_known_keys),
        current_unresolved_review_threads=sum(
            1
            for pr_result in current_prep.stack
            for thread in pr_result.manifest.review_threads
            if not thread.is_resolved
        ),
        planned_still_unresolved=planned_still_unresolved,
        planned_already_resolved=planned_already_resolved,
        new_unresolved_threads=new_unresolved_threads,
        missing_or_outdated_planned_threads=missing_or_outdated_planned_threads,
    )


def _invalid_result(
    *, errors: tuple[StackFeedbackDiffCurrentError, ...]
) -> StackFeedbackDiffCurrentResult:
    return StackFeedbackDiffCurrentResult(
        valid=False,
        safe_to_resolve_planned=False,
        errors=errors,
        summary=StackFeedbackDiffCurrentSummary(
            pr_count=0,
            planned_actionable_review_threads=0,
            planned_known_review_threads=0,
            current_unresolved_review_threads=0,
            planned_still_unresolved=0,
            planned_already_resolved=0,
            new_unresolved_threads=0,
            missing_or_outdated_planned_threads=0,
        ),
    )


def _current_prep_warnings(
    current_prep: StackFeedbackPrepResult,
) -> tuple[str, ...]:
    if current_prep.include_resolved:
        return ()
    return (
        "current_prep was not fetched with include_resolved=true; already-resolved planned "
        "threads cannot be distinguished from missing threads.",
    )


def _validation_errors(
    *,
    stack_plan: StackFeedbackPlanResult,
    current_prep: StackFeedbackPrepResult,
    planned_actionable: tuple[StackFeedbackPlanItem, ...],
    current_thread_errors: tuple[StackFeedbackDiffCurrentError, ...],
) -> tuple[StackFeedbackDiffCurrentError, ...]:
    errors: list[StackFeedbackDiffCurrentError] = []
    if not stack_plan.valid:
        errors.append(
            StackFeedbackDiffCurrentError(
                code="invalid_stack_plan",
                message="stack_plan.valid must be true before diffing current stack feedback.",
            )
        )
    errors.extend(_current_pr_errors(current_prep))
    errors.extend(
        _validate_stack_membership(
            stack_plan=stack_plan,
            current_pr_numbers=tuple(pr_result.pr_number for pr_result in current_prep.stack),
        )
    )
    errors.extend(_planned_thread_key_errors(planned_actionable))
    errors.extend(current_thread_errors)
    return tuple(errors)


def _current_pr_errors(
    current_prep: StackFeedbackPrepResult,
) -> tuple[StackFeedbackDiffCurrentError, ...]:
    return tuple(
        StackFeedbackDiffCurrentError(
            code="duplicate_current_pr",
            message=f"current_prep contains duplicate PR number {pr_number}.",
            pr_number=pr_number,
        )
        for pr_number in _duplicate_values(
            tuple(pr_result.pr_number for pr_result in current_prep.stack)
        )
    )


def _planned_thread_key_errors(
    planned_actionable: tuple[StackFeedbackPlanItem, ...],
) -> tuple[StackFeedbackDiffCurrentError, ...]:
    errors: list[StackFeedbackDiffCurrentError] = []
    keys: list[ThreadKey] = []
    for item in planned_actionable:
        key = thread_key(item.pr_number, item.thread_id)
        if key is None:
            errors.append(
                StackFeedbackDiffCurrentError(
                    code="invalid_planned_thread_item",
                    message="Stack plan review-thread item must include a non-empty thread_id.",
                    pr_number=item.pr_number,
                )
            )
            continue
        keys.append(key)
    for key in duplicate_thread_keys(tuple(keys)):
        errors.append(
            StackFeedbackDiffCurrentError(
                code="duplicate_planned_thread",
                message=f"Stack plan contains duplicate PR #{key[0]} thread {key[1]}.",
                pr_number=key[0],
                thread_id=key[1],
            )
        )
    return tuple(errors)


def _current_threads_by_key(
    current_prep: StackFeedbackPrepResult,
) -> tuple[dict[ThreadKey, ThreadManifestItem], tuple[StackFeedbackDiffCurrentError, ...]]:
    current_by_key: dict[ThreadKey, ThreadManifestItem] = {}
    errors: list[StackFeedbackDiffCurrentError] = []
    for pr_result in current_prep.stack:
        for thread in pr_result.manifest.review_threads:
            key = thread_key(pr_result.pr_number, thread.thread_id)
            if key is None:
                errors.append(
                    StackFeedbackDiffCurrentError(
                        code="invalid_current_thread",
                        message="current_prep review thread must include a non-empty thread_id.",
                        pr_number=pr_result.pr_number,
                    )
                )
                continue
            if key in current_by_key:
                errors.append(
                    StackFeedbackDiffCurrentError(
                        code="duplicate_current_thread",
                        message=f"current_prep contains duplicate PR #{key[0]} thread {key[1]}.",
                        pr_number=key[0],
                        thread_id=key[1],
                    )
                )
                continue
            current_by_key[key] = thread
    return current_by_key, tuple(errors)


def _validate_stack_membership(
    *,
    stack_plan: StackFeedbackPlanResult,
    current_pr_numbers: tuple[int, ...],
) -> tuple[StackFeedbackDiffCurrentError, ...]:
    planned_numbers = planned_pr_numbers(stack_plan)
    if not planned_numbers and stack_plan.pr_count > 0:
        return (
            StackFeedbackDiffCurrentError(
                code="stack_plan_pr_numbers_unavailable",
                message=(
                    "stack_plan does not expose PR numbers needed for stack membership diffing."
                ),
            ),
        )

    current_pr_set = set(current_pr_numbers)
    errors: list[StackFeedbackDiffCurrentError] = []
    if len(current_pr_set) != len(current_pr_numbers):
        return tuple(errors)
    missing_prs = tuple(
        pr_number for pr_number in planned_numbers if pr_number not in current_pr_set
    )
    extra_prs = tuple(
        pr_number for pr_number in current_pr_numbers if pr_number not in planned_numbers
    )
    for pr_number in missing_prs:
        errors.append(
            StackFeedbackDiffCurrentError(
                code="missing_current_pr",
                message=f"current_prep is missing planned PR #{pr_number}.",
                pr_number=pr_number,
            )
        )
    for pr_number in extra_prs:
        errors.append(
            StackFeedbackDiffCurrentError(
                code="unknown_current_pr",
                message=f"current_prep contains PR #{pr_number} not present in stack_plan.",
                pr_number=pr_number,
            )
        )
    return tuple(errors)


def _material_metadata_mismatch(
    planned_item: StackFeedbackPlanItem,
    current_thread: ThreadManifestItem,
) -> tuple[str, ...]:
    changed: list[str] = []
    if planned_item.path != current_thread.path:
        changed.append("path")
    if planned_item.line != current_thread.line:
        changed.append("line")
    if planned_item.start_line != current_thread.start_line:
        changed.append("start_line")
    if planned_item.is_outdated != current_thread.is_outdated:
        changed.append("is_outdated")
    return tuple(changed)


def _planned_thread(item: StackFeedbackPlanItem) -> StackFeedbackDiffPlannedThread:
    return StackFeedbackDiffPlannedThread(
        pr_number=item.pr_number,
        branch=item.branch,
        title=item.title,
        url=item.url,
        thread_id=trim_required(item.thread_id),
        source_batch_id=item.source_batch_id,
        summary=item.summary,
        path=item.path,
        line=item.line,
        start_line=item.start_line,
        is_outdated=item.is_outdated,
    )


def _missing_or_outdated_thread(
    item: StackFeedbackPlanItem,
    *,
    reason: str,
    changed_fields: tuple[str, ...] = (),
) -> StackFeedbackDiffMissingOrOutdatedThread:
    planned = _planned_thread(item)
    return StackFeedbackDiffMissingOrOutdatedThread(
        pr_number=planned.pr_number,
        branch=planned.branch,
        title=planned.title,
        url=planned.url,
        thread_id=planned.thread_id,
        source_batch_id=planned.source_batch_id,
        summary=planned.summary,
        path=planned.path,
        line=planned.line,
        start_line=planned.start_line,
        is_outdated=planned.is_outdated,
        reason=reason,
        changed_fields=changed_fields,
    )


def _new_unresolved_threads(
    *,
    current_prep: StackFeedbackPrepResult,
    planned_known_keys: set[ThreadKey],
) -> tuple[StackFeedbackDiffCurrentThread, ...]:
    items: list[StackFeedbackDiffCurrentThread] = []
    for pr_result in current_prep.stack:
        for thread in pr_result.manifest.review_threads:
            key = thread_key(pr_result.pr_number, thread.thread_id)
            if key is None or thread.is_resolved or key in planned_known_keys:
                continue
            items.append(
                StackFeedbackDiffCurrentThread(
                    pr_number=pr_result.pr_number,
                    branch=pr_result.branch,
                    title=pr_result.title,
                    url=pr_result.url,
                    thread_id=key[1],
                    path=thread.path,
                    line=thread.line,
                    start_line=thread.start_line,
                    is_outdated=thread.is_outdated,
                    comment_count=thread.comment_count,
                )
            )
    return tuple(items)


def _duplicate_values(values: tuple[int, ...]) -> tuple[int, ...]:
    seen: set[int] = set()
    duplicates: list[int] = []
    for value in values:
        if value in seen and value not in duplicates:
            duplicates.append(value)
        seen.add(value)
    return tuple(duplicates)
