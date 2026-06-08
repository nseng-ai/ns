"""Compare a stack feedback plan with freshly fetched current stack feedback."""

from __future__ import annotations

from typing import Annotated, TypeAlias

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
    StackFeedbackPrepPrResult,
    StackFeedbackPrepResult,
)
from asdl_pr_address.cli.pr_address.string_values import trim_optional, trim_required

ThreadKey: TypeAlias = tuple[int, str]

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

    errors: list[StackFeedbackDiffCurrentError] = []
    warnings: list[str] = []
    if not stack_plan.valid:
        errors.append(
            StackFeedbackDiffCurrentError(
                code="invalid_stack_plan",
                message="stack_plan.valid must be true before diffing current stack feedback.",
            )
        )

    current_prs, current_pr_errors = _current_prs_by_number(current_prep)
    errors.extend(current_pr_errors)
    stack_pr_errors = _validate_stack_membership(
        stack_plan=stack_plan,
        current_pr_numbers=tuple(pr_result.pr_number for pr_result in current_prep.stack),
    )
    errors.extend(stack_pr_errors)

    planned_actionable = _planned_actionable_thread_items(stack_plan)
    planned_key_errors = _planned_thread_key_errors(planned_actionable)
    errors.extend(planned_key_errors)

    current_by_key, current_key_errors = _current_threads_by_key(current_prep)
    errors.extend(current_key_errors)

    if not current_prep.include_resolved:
        warnings.append(
            "current_prep was not fetched with include_resolved=true; already-resolved planned "
            "threads cannot be distinguished from missing threads."
        )

    if errors:
        return _result(
            valid=False,
            stack_plan=stack_plan,
            current_prep=current_prep,
            planned_actionable=planned_actionable,
            planned_known_keys=_planned_known_thread_keys(stack_plan),
            current_by_key=current_by_key,
            current_prs=current_prs,
            warnings=tuple(warnings),
            errors=tuple(errors),
        )

    return _result(
        valid=True,
        stack_plan=stack_plan,
        current_prep=current_prep,
        planned_actionable=planned_actionable,
        planned_known_keys=_planned_known_thread_keys(stack_plan),
        current_by_key=current_by_key,
        current_prs=current_prs,
        warnings=tuple(warnings),
        errors=(),
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


def _result(
    *,
    valid: bool,
    stack_plan: StackFeedbackPlanResult,
    current_prep: StackFeedbackPrepResult,
    planned_actionable: tuple[StackFeedbackPlanItem, ...],
    planned_known_keys: set[ThreadKey],
    current_by_key: dict[ThreadKey, ThreadManifestItem],
    current_prs: dict[int, StackFeedbackPrepPrResult],
    warnings: tuple[str, ...],
    errors: tuple[StackFeedbackDiffCurrentError, ...],
) -> StackFeedbackDiffCurrentResult:
    planned_still_unresolved: list[StackFeedbackDiffPlannedThread] = []
    planned_already_resolved: list[StackFeedbackDiffPlannedThread] = []
    missing_or_outdated: list[StackFeedbackDiffMissingOrOutdatedThread] = []

    for item in planned_actionable:
        key = _thread_key(item.pr_number, item.thread_id)
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
        current_prs=current_prs,
        planned_known_keys=planned_known_keys,
    )
    safe_to_resolve_planned = (
        valid
        and not planned_already_resolved
        and not new_unresolved
        and not missing_or_outdated
        and not warnings
        and not errors
    )

    return StackFeedbackDiffCurrentResult(
        valid=valid,
        safe_to_resolve_planned=safe_to_resolve_planned,
        planned_still_unresolved=tuple(planned_still_unresolved),
        planned_already_resolved=tuple(planned_already_resolved),
        new_unresolved_threads=new_unresolved,
        missing_or_outdated_planned_threads=tuple(missing_or_outdated),
        warnings=warnings,
        errors=errors,
        summary=StackFeedbackDiffCurrentSummary(
            pr_count=len(current_prep.stack),
            planned_actionable_review_threads=len(planned_actionable),
            planned_known_review_threads=len(planned_known_keys),
            current_unresolved_review_threads=sum(
                1
                for pr_result in current_prep.stack
                for thread in pr_result.manifest.review_threads
                if not thread.is_resolved
            ),
            planned_still_unresolved=len(planned_still_unresolved),
            planned_already_resolved=len(planned_already_resolved),
            new_unresolved_threads=len(new_unresolved),
            missing_or_outdated_planned_threads=len(missing_or_outdated),
        ),
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


def _planned_actionable_thread_items(
    stack_plan: StackFeedbackPlanResult,
) -> tuple[StackFeedbackPlanItem, ...]:
    return tuple(
        item
        for batch in stack_plan.batches
        for item in batch.items
        if item.source_kind == "review_thread"
    )


def _planned_known_thread_keys(stack_plan: StackFeedbackPlanResult) -> set[ThreadKey]:
    keys: set[ThreadKey] = set()
    for item in _planned_actionable_thread_items(stack_plan):
        key = _thread_key(item.pr_number, item.thread_id)
        if key is not None:
            keys.add(key)
    for item in stack_plan.informational:
        if item.source_kind != "review_thread":
            continue
        key = _thread_key(item.pr_number, item.thread_id)
        if key is not None:
            keys.add(key)
    return keys


def _planned_thread_key_errors(
    planned_actionable: tuple[StackFeedbackPlanItem, ...],
) -> tuple[StackFeedbackDiffCurrentError, ...]:
    errors: list[StackFeedbackDiffCurrentError] = []
    keys: list[ThreadKey] = []
    for item in planned_actionable:
        key = _thread_key(item.pr_number, item.thread_id)
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
    for key in _duplicate_keys(tuple(keys)):
        errors.append(
            StackFeedbackDiffCurrentError(
                code="duplicate_planned_thread",
                message=f"Stack plan contains duplicate PR #{key[0]} thread {key[1]}.",
                pr_number=key[0],
                thread_id=key[1],
            )
        )
    return tuple(errors)


def _current_prs_by_number(
    current_prep: StackFeedbackPrepResult,
) -> tuple[dict[int, StackFeedbackPrepPrResult], tuple[StackFeedbackDiffCurrentError, ...]]:
    pr_numbers = tuple(pr_result.pr_number for pr_result in current_prep.stack)
    duplicates = _duplicate_values(pr_numbers)
    errors = tuple(
        StackFeedbackDiffCurrentError(
            code="duplicate_current_pr",
            message=f"current_prep contains duplicate PR number {pr_number}.",
            pr_number=pr_number,
        )
        for pr_number in duplicates
    )
    if duplicates:
        return {}, errors
    return {pr_result.pr_number: pr_result for pr_result in current_prep.stack}, errors


def _current_threads_by_key(
    current_prep: StackFeedbackPrepResult,
) -> tuple[dict[ThreadKey, ThreadManifestItem], tuple[StackFeedbackDiffCurrentError, ...]]:
    current_by_key: dict[ThreadKey, ThreadManifestItem] = {}
    errors: list[StackFeedbackDiffCurrentError] = []
    for pr_result in current_prep.stack:
        for thread in pr_result.manifest.review_threads:
            thread_id = thread.thread_id.strip()
            if not thread_id:
                errors.append(
                    StackFeedbackDiffCurrentError(
                        code="invalid_current_thread",
                        message="current_prep review thread must include a non-empty thread_id.",
                        pr_number=pr_result.pr_number,
                    )
                )
                continue
            key = (pr_result.pr_number, thread_id)
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
    planned_pr_numbers = _planned_pr_numbers(stack_plan)
    if not planned_pr_numbers and stack_plan.pr_count > 0:
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
        pr_number for pr_number in planned_pr_numbers if pr_number not in current_pr_set
    )
    extra_prs = tuple(
        pr_number for pr_number in current_pr_numbers if pr_number not in planned_pr_numbers
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


def _planned_pr_numbers(stack_plan: StackFeedbackPlanResult) -> tuple[int, ...]:
    if stack_plan.validation.per_pr:
        return tuple(item.pr_number for item in stack_plan.validation.per_pr)
    pr_numbers: list[int] = []
    for batch in stack_plan.batches:
        for item in batch.items:
            pr_numbers.append(item.pr_number)
    for item in stack_plan.informational:
        pr_numbers.append(item.pr_number)
    return tuple(dict.fromkeys(pr_numbers))


def _thread_key(pr_number: int, thread_id: str | None) -> ThreadKey | None:
    trimmed = trim_optional(thread_id)
    if trimmed is None:
        return None
    return (pr_number, trimmed)


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
    current_prs: dict[int, StackFeedbackPrepPrResult],
    planned_known_keys: set[ThreadKey],
) -> tuple[StackFeedbackDiffCurrentThread, ...]:
    items: list[StackFeedbackDiffCurrentThread] = []
    for pr_result in current_prep.stack:
        pr_metadata = current_prs.get(pr_result.pr_number, pr_result)
        for thread in pr_result.manifest.review_threads:
            key = (pr_result.pr_number, thread.thread_id)
            if thread.is_resolved or key in planned_known_keys:
                continue
            items.append(
                StackFeedbackDiffCurrentThread(
                    pr_number=pr_result.pr_number,
                    branch=pr_metadata.branch,
                    title=pr_metadata.title,
                    url=pr_metadata.url,
                    thread_id=thread.thread_id,
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


def _duplicate_keys(keys: tuple[ThreadKey, ...]) -> tuple[ThreadKey, ...]:
    seen: set[ThreadKey] = set()
    duplicates: list[ThreadKey] = []
    for key in keys:
        if key in seen and key not in duplicates:
            duplicates.append(key)
        seen.add(key)
    return tuple(duplicates)
