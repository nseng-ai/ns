"""Record compact per-batch pr-address checkpoint evidence."""

from __future__ import annotations

from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Annotated, Literal, NoReturn, TypeAlias

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.models import PayloadReference
from asdl_core.payloads.store import PayloadStore
from asdl_pr_address.cli.pr_address.build_resolve_thread_batch_payload import (
    BuildResolveThreadBatchPayloadError,
    BuildResolveThreadBatchPayloadResult,
)
from asdl_pr_address.cli.pr_address.feedback_planning import (
    FeedbackPlanActionItem,
    FeedbackPlanBatch,
    FeedbackPlanningResult,
)
from asdl_pr_address.cli.pr_address.resolve_thread_batch import ResolveThreadBatchResult
from asdl_pr_address.cli.pr_address.string_values import trim_optional, trim_required

BatchValidationStatus: TypeAlias = Literal["passed", "failed", "skipped"]
BatchNonThreadSourceKind: TypeAlias = Literal["review", "discussion_comment"]
BatchNonThreadAction: TypeAlias = Literal["replied", "skipped", "no_reply_needed"]

_INCOMPLETE_ERROR_CODES = frozenset({"failed_validation_command", "thread_resolution_failed"})


class RecordBatchCheckpointRequest(ClinkrModel):
    payload_json: Annotated[
        str | None,
        click.Option(["--payload-json"], type=click.STRING, required=False),
    ] = None
    payload_file: Annotated[
        str | None,
        click.Option(["--payload-file"], type=click.STRING, required=False),
    ] = None


class BatchValidationCommandEvidence(ClinkrModel):
    command: str
    status: BatchValidationStatus
    exit_code: int | None = None
    summary: str | None = None


class BatchNonThreadOutcomeInput(ClinkrModel):
    source_kind: BatchNonThreadSourceKind
    review_id: str | None = None
    discussion_comment_id: int | None = None
    action: BatchNonThreadAction
    result_comment_id: int | None = None
    reaction_added: bool | None = None
    skip_reason: str | None = None
    summary: str | None = None


class RecordBatchCheckpointInput(ClinkrModel):
    plan: dict[str, object]
    batch_id: str
    commit_sha: str | None = None
    changed_files: tuple[str, ...] = ()
    validation_commands: tuple[BatchValidationCommandEvidence, ...] = ()
    thread_payload_build: dict[str, object] | None = None
    thread_resolution_result: dict[str, object] | None = None
    non_thread_outcomes: tuple[BatchNonThreadOutcomeInput, ...] = ()


class BatchCheckpointError(ClinkrModel):
    code: str
    message: str
    batch_id: str | None = None
    thread_id: str | None = None
    review_id: str | None = None
    discussion_comment_id: int | None = None
    path: str | None = None


class BatchCheckpointPlanItem(ClinkrModel):
    source_kind: str
    summary: str
    action_summary: str
    review_id: str | None = None
    thread_id: str | None = None
    discussion_comment_id: int | None = None
    path: str | None = None
    line: int | None = None
    start_line: int | None = None
    covered_comment_ids: tuple[int, ...] = ()
    needs_reply: bool | None = None
    pre_existing: bool = False
    author: str | None = None
    url: str | None = None


class BatchSkippedThreadSummary(ClinkrModel):
    thread_id: str
    skip_reason: str | None = None
    summary: str | None = None


class BatchThreadCheckpointSummary(ClinkrModel):
    review_thread_count: int
    payload_ready: bool | None = None
    resolved_thread_ids: tuple[str, ...] = ()
    failed_thread_ids: tuple[str, ...] = ()
    skipped_thread_ids: tuple[str, ...] = ()
    skipped_threads: tuple[BatchSkippedThreadSummary, ...] = ()
    ignored_non_thread_count: int = 0
    all_succeeded: bool | None = None


class BatchNonThreadOutcomeSummary(ClinkrModel):
    source_kind: BatchNonThreadSourceKind
    review_id: str | None = None
    discussion_comment_id: int | None = None
    action: BatchNonThreadAction
    result_comment_id: int | None = None
    reaction_added: bool | None = None
    skip_reason: str | None = None
    summary: str | None = None


class BatchCheckpointArtifact(ClinkrModel):
    pr_number: int | None = None
    payload_path: str | None = None
    batch_id: str
    complexity: str
    approval_required: bool
    commit_sha: str | None = None
    changed_files: tuple[str, ...] = ()
    validation_commands: tuple[BatchValidationCommandEvidence, ...] = ()
    selected_items: tuple[BatchCheckpointPlanItem, ...] = ()
    thread_summary: BatchThreadCheckpointSummary | None = None
    non_thread_outcomes: tuple[BatchNonThreadOutcomeSummary, ...] = ()
    warnings: tuple[str, ...] = ()


class RecordBatchCheckpointResult(ClinkrModel):
    valid: bool
    batch_complete: bool
    batch_id: str
    complexity: str | None = None
    approval_required: bool | None = None
    pr_number: int | None = None
    payload_path: str | None = None
    checkpoint_reference: PayloadReference | None = None
    commit_sha: str | None = None
    changed_files: tuple[str, ...] = ()
    validation_commands: tuple[BatchValidationCommandEvidence, ...] = ()
    selected_items: tuple[BatchCheckpointPlanItem, ...] = ()
    thread_summary: BatchThreadCheckpointSummary | None = None
    non_thread_outcomes: tuple[BatchNonThreadOutcomeSummary, ...] = ()
    errors: tuple[BatchCheckpointError, ...] = ()
    warnings: tuple[str, ...] = ()


@clinkr_operation(
    name="record-batch-checkpoint",
    help="Validate and record compact evidence for one pr-address plan-feedback batch.",
)
def run_record_batch_checkpoint(
    ctx: click.Context,
    request: RecordBatchCheckpointRequest,
) -> ClinkrExit[RecordBatchCheckpointResult]:
    del ctx
    checkpoint_input = _load_payload(request)
    result = record_batch_checkpoint(checkpoint_input)
    if result.valid and result.payload_path is not None:
        reference = _write_checkpoint_artifact(result)
        result = result.model_copy(update={"checkpoint_reference": reference})

    if result.valid and result.batch_complete:
        return ClinkrExit.ok(result)
    return ClinkrExit.negative(
        result,
        message=(
            "Batch checkpoint evidence is incomplete or failed; "
            "do not treat this batch as complete."
        ),
    )


def record_batch_checkpoint(
    request: RecordBatchCheckpointInput,
) -> RecordBatchCheckpointResult:
    plan = FeedbackPlanningResult.model_validate(request.plan)
    batch_id = request.batch_id.strip()
    commit_sha = trim_optional(request.commit_sha)

    if not plan.valid:
        return _result(
            valid=False,
            batch_complete=False,
            batch_id=batch_id,
            commit_sha=commit_sha,
            errors=(
                BatchCheckpointError(
                    code="invalid_plan",
                    message="plan.valid must be true before recording batch checkpoint evidence.",
                    batch_id=batch_id,
                ),
            ),
        )
    if not batch_id:
        return _result(
            valid=False,
            batch_complete=False,
            batch_id=batch_id,
            commit_sha=commit_sha,
            errors=(
                BatchCheckpointError(
                    code="empty_batch_id",
                    message="batch_id must be non-empty.",
                ),
            ),
        )

    selected_batch = _selected_batch(plan=plan, batch_id=batch_id)
    if selected_batch is None:
        return _result(
            valid=False,
            batch_complete=False,
            batch_id=batch_id,
            pr_number=plan.pr_number,
            payload_path=plan.payload_path,
            commit_sha=commit_sha,
            errors=(
                BatchCheckpointError(
                    code="unknown_batch",
                    message=f"No plan batch found for batch_id '{batch_id}'.",
                    batch_id=batch_id,
                ),
            ),
        )

    errors: list[BatchCheckpointError] = []
    warnings: list[str] = []
    selected_items = _checkpoint_plan_items(selected_batch.items)
    changed_files = _validated_changed_files(
        request.changed_files,
        batch_id=batch_id,
        errors=errors,
    )
    if changed_files and commit_sha is None:
        errors.append(
            BatchCheckpointError(
                code="missing_commit_sha_for_changed_files",
                message="commit_sha is required when changed_files is non-empty.",
                batch_id=batch_id,
            )
        )

    validation_commands = _validated_validation_commands(
        request.validation_commands,
        batch_id=batch_id,
        errors=errors,
    )
    thread_summary = _thread_summary(
        request=request,
        selected_batch=selected_batch,
        errors=errors,
        warnings=warnings,
    )
    non_thread_outcomes = _non_thread_outcomes(
        outcomes=request.non_thread_outcomes,
        selected_batch=selected_batch,
        batch_id=batch_id,
        errors=errors,
    )

    if plan.payload_path is None and not _has_invalid_errors(errors):
        warnings.append("plan.payload_path is null; checkpoint artifact was not written.")

    valid = not _has_invalid_errors(errors)
    batch_complete = valid and not errors
    return _result(
        valid=valid,
        batch_complete=batch_complete,
        batch_id=batch_id,
        complexity=selected_batch.complexity,
        approval_required=selected_batch.approval_required,
        pr_number=plan.pr_number,
        payload_path=plan.payload_path,
        commit_sha=commit_sha,
        changed_files=changed_files,
        validation_commands=validation_commands,
        selected_items=selected_items,
        thread_summary=thread_summary,
        non_thread_outcomes=non_thread_outcomes,
        errors=tuple(errors),
        warnings=tuple(warnings),
    )


def _load_payload(request: RecordBatchCheckpointRequest) -> RecordBatchCheckpointInput:
    return load_json_input(
        option_value=request.payload_json,
        file_path=request.payload_file,
        command_name="record-batch-checkpoint",
        input_description="checkpoint JSON",
        option_name="--payload-json",
        file_option_name="--payload-file",
        parser=RecordBatchCheckpointInput.model_validate_json,
    )


def _selected_batch(
    *,
    plan: FeedbackPlanningResult,
    batch_id: str,
) -> FeedbackPlanBatch | None:
    for batch in plan.batches:
        if batch.batch_id == batch_id:
            return batch
    return None


def _checkpoint_plan_items(
    items: tuple[FeedbackPlanActionItem, ...],
) -> tuple[BatchCheckpointPlanItem, ...]:
    return tuple(
        BatchCheckpointPlanItem(
            source_kind=item.source_kind,
            summary=item.summary,
            action_summary=item.action_summary,
            review_id=item.review_id,
            thread_id=item.thread_id,
            discussion_comment_id=item.discussion_comment_id,
            path=item.path,
            line=item.line,
            start_line=item.start_line,
            covered_comment_ids=item.covered_comment_ids,
            needs_reply=item.needs_reply,
            pre_existing=item.pre_existing,
            author=item.author,
            url=item.url,
        )
        for item in items
    )


def _validated_changed_files(
    changed_files: tuple[str, ...],
    *,
    batch_id: str,
    errors: list[BatchCheckpointError],
) -> tuple[str, ...]:
    seen: set[str] = set()
    validated: list[str] = []
    for raw_path in changed_files:
        path = raw_path.strip()
        if not path:
            errors.append(
                BatchCheckpointError(
                    code="empty_changed_file",
                    message="changed_files entries must be non-empty.",
                    batch_id=batch_id,
                )
            )
            continue
        if path.startswith("/") or PureWindowsPath(path).is_absolute():
            errors.append(
                BatchCheckpointError(
                    code="absolute_changed_file",
                    message=f"changed_files entries must be relative paths: {path}",
                    batch_id=batch_id,
                    path=path,
                )
            )
            continue
        if ".." in PurePosixPath(path).parts:
            errors.append(
                BatchCheckpointError(
                    code="unsafe_changed_file",
                    message=f"changed_files entries must not contain traversal segments: {path}",
                    batch_id=batch_id,
                    path=path,
                )
            )
            continue
        if path in seen:
            errors.append(
                BatchCheckpointError(
                    code="duplicate_changed_file",
                    message=f"Duplicate changed file path: {path}",
                    batch_id=batch_id,
                    path=path,
                )
            )
            continue
        seen.add(path)
        validated.append(path)
    return tuple(validated)


def _validated_validation_commands(
    commands: tuple[BatchValidationCommandEvidence, ...],
    *,
    batch_id: str,
    errors: list[BatchCheckpointError],
) -> tuple[BatchValidationCommandEvidence, ...]:
    validated: list[BatchValidationCommandEvidence] = []
    for index, command in enumerate(commands):
        command_text = command.command.strip()
        summary = trim_optional(command.summary)
        if not command_text:
            errors.append(
                BatchCheckpointError(
                    code="empty_validation_command",
                    message=f"validation_commands[{index}].command must be non-empty.",
                    batch_id=batch_id,
                )
            )
            continue
        if command.summary is not None and summary is None:
            errors.append(
                BatchCheckpointError(
                    code="empty_validation_summary",
                    message=f"validation_commands[{index}].summary must be non-empty when set.",
                    batch_id=batch_id,
                )
            )
            continue
        if command.status == "failed":
            errors.append(
                BatchCheckpointError(
                    code="failed_validation_command",
                    message=f"Validation command failed: {command_text}",
                    batch_id=batch_id,
                )
            )
        validated.append(
            BatchValidationCommandEvidence(
                command=command_text,
                status=command.status,
                exit_code=command.exit_code,
                summary=summary,
            )
        )
    return tuple(validated)


def _thread_summary(
    *,
    request: RecordBatchCheckpointInput,
    selected_batch: FeedbackPlanBatch,
    errors: list[BatchCheckpointError],
    warnings: list[str],
) -> BatchThreadCheckpointSummary:
    selected_thread_ids = _selected_thread_ids(selected_batch)
    batch_id = selected_batch.batch_id
    if not selected_thread_ids:
        return _no_selected_thread_summary(
            request=request,
            batch_id=batch_id,
            errors=errors,
            warnings=warnings,
        )

    if request.thread_payload_build is None:
        errors.append(
            BatchCheckpointError(
                code="missing_thread_payload_build",
                message="thread_payload_build is required for batches with review-thread items.",
                batch_id=batch_id,
            )
        )
        return BatchThreadCheckpointSummary(review_thread_count=len(selected_thread_ids))

    build = BuildResolveThreadBatchPayloadResult.model_validate(request.thread_payload_build)
    build_summary = _summary_from_payload_build(build)
    if build.batch_id != batch_id:
        errors.append(
            BatchCheckpointError(
                code="thread_payload_build_batch_mismatch",
                message=(
                    f"thread_payload_build.batch_id '{build.batch_id}' does not match selected "
                    f"batch_id '{batch_id}'."
                ),
                batch_id=batch_id,
            )
        )
    if not build.valid:
        for build_error in build.errors:
            errors.append(_error_from_payload_build_error(build_error, fallback_batch_id=batch_id))

    _validate_payload_build_threads(
        build=build,
        selected_thread_ids=selected_thread_ids,
        batch_id=batch_id,
        errors=errors,
    )

    if build.payload_ready:
        build_summary = _validate_thread_resolution_result(
            request=request,
            build=build,
            summary=build_summary,
            batch_id=batch_id,
            errors=errors,
        )
    elif request.thread_resolution_result is not None:
        errors.append(
            BatchCheckpointError(
                code="unexpected_thread_resolution_result",
                message=(
                    "thread_resolution_result must be omitted when "
                    "thread_payload_build.payload_ready is false."
                ),
                batch_id=batch_id,
            )
        )
    return build_summary


def _selected_thread_ids(selected_batch: FeedbackPlanBatch) -> tuple[str, ...]:
    thread_ids: list[str] = []
    for item in selected_batch.items:
        if item.source_kind != "review_thread":
            continue
        thread_id = trim_optional(item.thread_id)
        if thread_id is not None:
            thread_ids.append(thread_id)
    return tuple(thread_ids)


def _no_selected_thread_summary(
    *,
    request: RecordBatchCheckpointInput,
    batch_id: str,
    errors: list[BatchCheckpointError],
    warnings: list[str],
) -> BatchThreadCheckpointSummary:
    if request.thread_resolution_result is not None:
        errors.append(
            BatchCheckpointError(
                code="unexpected_thread_resolution_result",
                message=(
                    "thread_resolution_result must be omitted for batches without "
                    "review-thread items."
                ),
                batch_id=batch_id,
            )
        )
    if request.thread_payload_build is None:
        return BatchThreadCheckpointSummary(review_thread_count=0)

    build = BuildResolveThreadBatchPayloadResult.model_validate(request.thread_payload_build)
    summary = _summary_from_payload_build(build)
    if build.review_thread_count == 0 and not build.payload_ready:
        warnings.append(
            "thread_payload_build was supplied for a batch without review-thread items; "
            "it was summarized but not required."
        )
        return summary

    errors.append(
        BatchCheckpointError(
            code="unexpected_thread_payload_build",
            message="thread_payload_build must be omitted for batches without review-thread items.",
            batch_id=batch_id,
        )
    )
    return summary


def _summary_from_payload_build(
    build: BuildResolveThreadBatchPayloadResult,
) -> BatchThreadCheckpointSummary:
    payload_thread_ids: tuple[str, ...] = ()
    if build.payload is not None:
        payload_thread_ids = tuple(item.thread_id for item in build.payload.items)
    return BatchThreadCheckpointSummary(
        review_thread_count=build.review_thread_count,
        payload_ready=build.payload_ready,
        resolved_thread_ids=payload_thread_ids,
        skipped_thread_ids=tuple(item.thread_id for item in build.skipped_items),
        skipped_threads=tuple(
            BatchSkippedThreadSummary(
                thread_id=item.thread_id,
                skip_reason=item.skip_reason,
                summary=item.summary,
            )
            for item in build.skipped_items
        ),
        ignored_non_thread_count=len(build.ignored_non_thread_items),
    )


def _validate_payload_build_threads(
    *,
    build: BuildResolveThreadBatchPayloadResult,
    selected_thread_ids: tuple[str, ...],
    batch_id: str,
    errors: list[BatchCheckpointError],
) -> None:
    selected_set = set(selected_thread_ids)
    if len(selected_set) != len(selected_thread_ids):
        errors.append(
            BatchCheckpointError(
                code="duplicate_plan_thread",
                message="Selected batch contains duplicate review-thread IDs.",
                batch_id=batch_id,
            )
        )
    payload_thread_ids: set[str] = set()
    if build.payload is not None:
        payload_thread_ids = {item.thread_id for item in build.payload.items}
    skipped_thread_ids = {item.thread_id for item in build.skipped_items}
    evidenced_thread_ids = payload_thread_ids | skipped_thread_ids

    for thread_id in selected_set - evidenced_thread_ids:
        errors.append(
            BatchCheckpointError(
                code="missing_thread_evidence",
                message=f"Selected thread {thread_id} is missing resolve or skip evidence.",
                batch_id=batch_id,
                thread_id=thread_id,
            )
        )
    for thread_id in evidenced_thread_ids - selected_set:
        errors.append(
            BatchCheckpointError(
                code="thread_not_in_selected_batch",
                message=f"Thread evidence references thread {thread_id} outside selected batch.",
                batch_id=batch_id,
                thread_id=thread_id,
            )
        )


def _validate_thread_resolution_result(
    *,
    request: RecordBatchCheckpointInput,
    build: BuildResolveThreadBatchPayloadResult,
    summary: BatchThreadCheckpointSummary,
    batch_id: str,
    errors: list[BatchCheckpointError],
) -> BatchThreadCheckpointSummary:
    if build.payload is None:
        errors.append(
            BatchCheckpointError(
                code="missing_thread_payload",
                message="thread_payload_build.payload_ready is true but payload is missing.",
                batch_id=batch_id,
            )
        )
        return summary
    if request.thread_resolution_result is None:
        errors.append(
            BatchCheckpointError(
                code="missing_thread_resolution_result",
                message=(
                    "thread_resolution_result is required when "
                    "thread_payload_build.payload_ready is true."
                ),
                batch_id=batch_id,
            )
        )
        return summary

    resolution = ResolveThreadBatchResult.model_validate(request.thread_resolution_result)
    expected_thread_ids = {item.thread_id for item in build.payload.items}
    actual_thread_ids = {item.thread_id for item in resolution.results}
    for thread_id in expected_thread_ids - actual_thread_ids:
        errors.append(
            BatchCheckpointError(
                code="missing_thread_resolution_result",
                message=f"thread_resolution_result is missing thread {thread_id}.",
                batch_id=batch_id,
                thread_id=thread_id,
            )
        )
    for thread_id in actual_thread_ids - expected_thread_ids:
        errors.append(
            BatchCheckpointError(
                code="unknown_thread_resolution_result",
                message=f"thread_resolution_result includes unexpected thread {thread_id}.",
                batch_id=batch_id,
                thread_id=thread_id,
            )
        )

    resolved = tuple(item.thread_id for item in resolution.results if item.status == "resolved")
    failed = tuple(item.thread_id for item in resolution.results if item.status == "failed")
    skipped = tuple(item.thread_id for item in resolution.results if item.status == "skipped")
    summary = summary.model_copy(
        update={
            "resolved_thread_ids": resolved,
            "failed_thread_ids": failed,
            "skipped_thread_ids": summary.skipped_thread_ids + skipped,
            "all_succeeded": resolution.all_succeeded,
        }
    )
    if not resolution.all_succeeded:
        for thread_id in failed + skipped:
            errors.append(
                BatchCheckpointError(
                    code="thread_resolution_failed",
                    message=f"Thread resolution did not succeed for {thread_id}.",
                    batch_id=batch_id,
                    thread_id=thread_id,
                )
            )
    return summary


def _error_from_payload_build_error(
    error: BuildResolveThreadBatchPayloadError,
    *,
    fallback_batch_id: str,
) -> BatchCheckpointError:
    return BatchCheckpointError(
        code=error.code,
        message=error.message,
        batch_id=error.batch_id or fallback_batch_id,
        thread_id=error.thread_id,
    )


def _non_thread_outcomes(
    *,
    outcomes: tuple[BatchNonThreadOutcomeInput, ...],
    selected_batch: FeedbackPlanBatch,
    batch_id: str,
    errors: list[BatchCheckpointError],
) -> tuple[BatchNonThreadOutcomeSummary, ...]:
    selected = _selected_non_thread_items(selected_batch)
    seen: set[tuple[BatchNonThreadSourceKind, str | int]] = set()
    summaries: list[BatchNonThreadOutcomeSummary] = []

    for outcome in outcomes:
        key = _non_thread_outcome_key(outcome=outcome, batch_id=batch_id, errors=errors)
        if key is None:
            continue
        if key in seen:
            errors.append(
                BatchCheckpointError(
                    code="duplicate_non_thread_outcome",
                    message=f"Duplicate non-thread outcome for {key[0]} {key[1]}.",
                    batch_id=batch_id,
                    review_id=str(key[1]) if key[0] == "review" else None,
                    discussion_comment_id=int(key[1]) if key[0] == "discussion_comment" else None,
                )
            )
            continue
        seen.add(key)
        if key not in selected:
            errors.append(
                BatchCheckpointError(
                    code="non_thread_outcome_not_in_selected_batch",
                    message=(
                        f"Non-thread outcome references {key[0]} {key[1]} outside selected batch."
                    ),
                    batch_id=batch_id,
                    review_id=str(key[1]) if key[0] == "review" else None,
                    discussion_comment_id=int(key[1]) if key[0] == "discussion_comment" else None,
                )
            )
            continue
        summary = _validated_non_thread_outcome(
            outcome=outcome,
            key=key,
            batch_id=batch_id,
            errors=errors,
        )
        if summary is not None:
            summaries.append(summary)

    for key in selected:
        if key not in seen:
            errors.append(
                BatchCheckpointError(
                    code="missing_non_thread_outcome",
                    message=f"Missing explicit non-thread outcome for {key[0]} {key[1]}.",
                    batch_id=batch_id,
                    review_id=str(key[1]) if key[0] == "review" else None,
                    discussion_comment_id=int(key[1]) if key[0] == "discussion_comment" else None,
                )
            )
    return tuple(summaries)


def _selected_non_thread_items(
    selected_batch: FeedbackPlanBatch,
) -> set[tuple[BatchNonThreadSourceKind, str | int]]:
    selected: set[tuple[BatchNonThreadSourceKind, str | int]] = set()
    for item in selected_batch.items:
        if item.source_kind == "review":
            review_id = trim_optional(item.review_id)
            if review_id is not None:
                selected.add(("review", review_id))
        elif item.source_kind == "discussion_comment" and item.discussion_comment_id is not None:
            selected.add(("discussion_comment", item.discussion_comment_id))
    return selected


def _non_thread_outcome_key(
    *,
    outcome: BatchNonThreadOutcomeInput,
    batch_id: str,
    errors: list[BatchCheckpointError],
) -> tuple[BatchNonThreadSourceKind, str | int] | None:
    review_id = trim_optional(outcome.review_id)
    if outcome.source_kind == "review":
        if review_id is None:
            errors.append(
                BatchCheckpointError(
                    code="missing_review_id",
                    message="review non-thread outcomes require review_id.",
                    batch_id=batch_id,
                )
            )
            return None
        if outcome.discussion_comment_id is not None:
            errors.append(
                BatchCheckpointError(
                    code="unexpected_discussion_comment_id",
                    message="review non-thread outcomes must not include discussion_comment_id.",
                    batch_id=batch_id,
                    review_id=review_id,
                    discussion_comment_id=outcome.discussion_comment_id,
                )
            )
            return None
        return ("review", review_id)

    if outcome.discussion_comment_id is None:
        errors.append(
            BatchCheckpointError(
                code="missing_discussion_comment_id",
                message="discussion_comment outcomes require discussion_comment_id.",
                batch_id=batch_id,
            )
        )
        return None
    if review_id is not None:
        errors.append(
            BatchCheckpointError(
                code="unexpected_review_id",
                message="discussion_comment outcomes must not include review_id.",
                batch_id=batch_id,
                review_id=review_id,
                discussion_comment_id=outcome.discussion_comment_id,
            )
        )
        return None
    return ("discussion_comment", outcome.discussion_comment_id)


def _validated_non_thread_outcome(
    *,
    outcome: BatchNonThreadOutcomeInput,
    key: tuple[BatchNonThreadSourceKind, str | int],
    batch_id: str,
    errors: list[BatchCheckpointError],
) -> BatchNonThreadOutcomeSummary | None:
    skip_reason = trim_optional(outcome.skip_reason)
    summary = trim_optional(outcome.summary)
    key_errors: list[BatchCheckpointError] = []
    if outcome.action == "replied":
        if outcome.result_comment_id is None:
            key_errors.append(
                _non_thread_key_error(
                    code="missing_result_comment_id",
                    message=f"replied outcome for {key[0]} {key[1]} requires result_comment_id.",
                    key=key,
                    batch_id=batch_id,
                )
            )
        if skip_reason is not None:
            key_errors.append(
                _non_thread_key_error(
                    code="replied_outcome_has_skip_reason",
                    message=f"replied outcome for {key[0]} {key[1]} must not include skip_reason.",
                    key=key,
                    batch_id=batch_id,
                )
            )
    elif outcome.action == "skipped":
        if skip_reason is None:
            key_errors.append(
                _non_thread_key_error(
                    code="missing_skip_reason",
                    message=f"skipped outcome for {key[0]} {key[1]} requires skip_reason.",
                    key=key,
                    batch_id=batch_id,
                )
            )
        if outcome.result_comment_id is not None:
            key_errors.append(
                _non_thread_key_error(
                    code="skipped_outcome_has_result_comment_id",
                    message=(
                        f"skipped outcome for {key[0]} {key[1]} must not include result_comment_id."
                    ),
                    key=key,
                    batch_id=batch_id,
                )
            )
    elif summary is None:
        key_errors.append(
            _non_thread_key_error(
                code="missing_no_reply_summary",
                message=f"no_reply_needed outcome for {key[0]} {key[1]} requires summary.",
                key=key,
                batch_id=batch_id,
            )
        )

    if key[0] == "review" and outcome.reaction_added is not None:
        key_errors.append(
            _non_thread_key_error(
                code="review_outcome_has_reaction_added",
                message="reaction_added is only valid for discussion_comment outcomes.",
                key=key,
                batch_id=batch_id,
            )
        )
    if key_errors:
        errors.extend(key_errors)
        return None

    return BatchNonThreadOutcomeSummary(
        source_kind=key[0],
        review_id=str(key[1]) if key[0] == "review" else None,
        discussion_comment_id=int(key[1]) if key[0] == "discussion_comment" else None,
        action=outcome.action,
        result_comment_id=outcome.result_comment_id,
        reaction_added=outcome.reaction_added,
        skip_reason=skip_reason,
        summary=summary,
    )


def _non_thread_key_error(
    *,
    code: str,
    message: str,
    key: tuple[BatchNonThreadSourceKind, str | int],
    batch_id: str,
) -> BatchCheckpointError:
    return BatchCheckpointError(
        code=code,
        message=message,
        batch_id=batch_id,
        review_id=str(key[1]) if key[0] == "review" else None,
        discussion_comment_id=int(key[1]) if key[0] == "discussion_comment" else None,
    )


def _has_invalid_errors(errors: list[BatchCheckpointError]) -> bool:
    return any(error.code not in _INCOMPLETE_ERROR_CODES for error in errors)


def _result(
    *,
    valid: bool,
    batch_complete: bool,
    batch_id: str,
    complexity: str | None = None,
    approval_required: bool | None = None,
    pr_number: int | None = None,
    payload_path: str | None = None,
    commit_sha: str | None = None,
    changed_files: tuple[str, ...] = (),
    validation_commands: tuple[BatchValidationCommandEvidence, ...] = (),
    selected_items: tuple[BatchCheckpointPlanItem, ...] = (),
    thread_summary: BatchThreadCheckpointSummary | None = None,
    non_thread_outcomes: tuple[BatchNonThreadOutcomeSummary, ...] = (),
    errors: tuple[BatchCheckpointError, ...] = (),
    warnings: tuple[str, ...] = (),
) -> RecordBatchCheckpointResult:
    return RecordBatchCheckpointResult(
        valid=valid,
        batch_complete=batch_complete,
        batch_id=batch_id,
        complexity=complexity,
        approval_required=approval_required,
        pr_number=pr_number,
        payload_path=payload_path,
        commit_sha=commit_sha,
        changed_files=changed_files,
        validation_commands=validation_commands,
        selected_items=selected_items,
        thread_summary=thread_summary,
        non_thread_outcomes=non_thread_outcomes,
        errors=errors,
        warnings=warnings,
    )


def _write_checkpoint_artifact(result: RecordBatchCheckpointResult) -> PayloadReference:
    artifact = BatchCheckpointArtifact(
        pr_number=result.pr_number,
        payload_path=result.payload_path,
        batch_id=result.batch_id,
        complexity=trim_required(result.complexity),
        approval_required=bool(result.approval_required),
        commit_sha=result.commit_sha,
        changed_files=result.changed_files,
        validation_commands=result.validation_commands,
        selected_items=result.selected_items,
        thread_summary=result.thread_summary,
        non_thread_outcomes=result.non_thread_outcomes,
        warnings=result.warnings,
    )
    try:
        store = PayloadStore.open_containing_artifact(Path(trim_required(result.payload_path)))
        return store.write_json_artifact(
            descriptor="pr-address-batch-checkpoint",
            role="summary",
            payload=artifact.model_dump(mode="json"),
        )
    except PayloadError as error:
        _raise_clinkr_failure_for_payload_error(error)


def _raise_clinkr_failure_for_payload_error(error: PayloadError) -> NoReturn:
    raise ClinkrFailure(error_type=error.error_type, message=error.message) from error
