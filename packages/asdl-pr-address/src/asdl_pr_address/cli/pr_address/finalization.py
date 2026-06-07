"""Pure final verification for pr-address runs."""

from __future__ import annotations

from collections import Counter

from asdl_pr_address.cli.pr_address.batch_checkpoint_models import RecordBatchCheckpointResult
from asdl_pr_address.cli.pr_address.feedback_payload import ThreadManifestItem
from asdl_pr_address.cli.pr_address.finalization_models import (
    FinalizeRunCheckpointSummary,
    FinalizeRunCounts,
    FinalizeRunError,
    FinalizeRunInput,
    FinalizeRunResult,
    FinalizeRunSkippedItem,
    FinalizeRunThreadSummary,
)


def finalize_run(request: FinalizeRunInput) -> FinalizeRunResult:
    """Summarize final unresolved, skipped, and checkpoint evidence."""
    errors: list[FinalizeRunError] = []
    warnings: list[str] = []
    invalid_error_count = 0

    if not request.checkpoints:
        warnings.append("No batch checkpoint evidence supplied.")

    invalid_error_count += _validate_pr_numbers(request=request, errors=errors)
    invalid_error_count += _validate_unique_batch_ids(request=request, errors=errors)

    checkpoint_summaries = _checkpoint_summaries(request.checkpoints)
    skipped_items = _skipped_items(request.checkpoints)
    skipped_thread_ids = {item.thread_id for item in skipped_items if item.thread_id is not None}

    unresolved_threads = tuple(
        _thread_summary(thread)
        for thread in request.feedback.review_threads
        if not thread.is_resolved
    )
    unresolved_by_id = {thread.thread_id: thread for thread in unresolved_threads}
    unresolved_unskipped_threads = tuple(
        thread for thread in unresolved_threads if thread.thread_id not in skipped_thread_ids
    )

    resolved_thread_ids = _checkpoint_thread_ids(
        request.checkpoints,
        field_name="resolved_thread_ids",
    )
    failed_thread_ids = _checkpoint_thread_ids(
        request.checkpoints,
        field_name="failed_thread_ids",
    )

    for thread_id in sorted(resolved_thread_ids & unresolved_by_id.keys()):
        errors.append(
            FinalizeRunError(
                code="checkpointed_thread_still_unresolved",
                message=(
                    f"Checkpoint evidence says thread {thread_id} was resolved, but fresh "
                    "feedback still reports it unresolved."
                ),
                thread_id=thread_id,
            )
        )

    for checkpoint in request.checkpoints:
        errors.extend(_checkpoint_errors(checkpoint))

    has_incomplete_checkpoint = any(
        not checkpoint.valid or not checkpoint.batch_complete for checkpoint in request.checkpoints
    )
    has_failed_threads = bool(failed_thread_ids)
    has_failed_validation = any(
        command.status == "failed"
        for checkpoint in request.checkpoints
        for command in checkpoint.validation_commands
    )
    valid = invalid_error_count == 0
    ready_to_stop = (
        valid
        and not has_incomplete_checkpoint
        and not has_failed_threads
        and not has_failed_validation
        and not unresolved_unskipped_threads
        and not any(error.code == "checkpointed_thread_still_unresolved" for error in errors)
    )
    all_feedback_addressed = ready_to_stop and not skipped_items and not unresolved_threads

    return FinalizeRunResult(
        valid=valid,
        ready_to_stop=ready_to_stop,
        all_feedback_addressed=all_feedback_addressed,
        pr_number=request.feedback.pr_number,
        payload_path=request.feedback.payload_reference.payload_path,
        counts=FinalizeRunCounts(
            checkpoint_batches=len(request.checkpoints),
            complete_batches=sum(
                1
                for checkpoint in request.checkpoints
                if checkpoint.valid and checkpoint.batch_complete
            ),
            incomplete_batches=sum(
                1
                for checkpoint in request.checkpoints
                if not checkpoint.valid or not checkpoint.batch_complete
            ),
            unresolved_threads=len(unresolved_threads),
            unresolved_unskipped_threads=len(unresolved_unskipped_threads),
            resolved_threads_from_checkpoints=len(resolved_thread_ids),
            failed_threads_from_checkpoints=len(failed_thread_ids),
            skipped_threads=len(skipped_thread_ids),
            skipped_non_thread_items=sum(
                1 for item in skipped_items if item.source_kind != "review_thread"
            ),
        ),
        unresolved_threads=unresolved_threads,
        unresolved_unskipped_threads=unresolved_unskipped_threads,
        skipped_items=tuple(skipped_items),
        checkpoint_summaries=checkpoint_summaries,
        errors=tuple(errors),
        warnings=tuple(warnings),
    )


def _validate_pr_numbers(*, request: FinalizeRunInput, errors: list[FinalizeRunError]) -> int:
    invalid_error_count = 0
    for checkpoint in request.checkpoints:
        if checkpoint.pr_number is None or checkpoint.pr_number == request.feedback.pr_number:
            continue
        invalid_error_count += 1
        errors.append(
            FinalizeRunError(
                code="pr_number_mismatch",
                message=(
                    f"Checkpoint batch {checkpoint.batch_id} is for PR {checkpoint.pr_number}, "
                    f"but final feedback is for PR {request.feedback.pr_number}."
                ),
                batch_id=checkpoint.batch_id,
            )
        )
    return invalid_error_count


def _validate_unique_batch_ids(*, request: FinalizeRunInput, errors: list[FinalizeRunError]) -> int:
    batch_counts = Counter(checkpoint.batch_id for checkpoint in request.checkpoints)
    duplicate_batch_ids = sorted(batch_id for batch_id, count in batch_counts.items() if count > 1)
    for batch_id in duplicate_batch_ids:
        errors.append(
            FinalizeRunError(
                code="duplicate_checkpoint_batch",
                message=f"Duplicate checkpoint evidence supplied for batch_id '{batch_id}'.",
                batch_id=batch_id,
            )
        )
    return len(duplicate_batch_ids)


def _checkpoint_summaries(
    checkpoints: tuple[RecordBatchCheckpointResult, ...],
) -> tuple[FinalizeRunCheckpointSummary, ...]:
    return tuple(_checkpoint_summary(checkpoint) for checkpoint in checkpoints)


def _checkpoint_summary(checkpoint: RecordBatchCheckpointResult) -> FinalizeRunCheckpointSummary:
    resolved_thread_ids: tuple[str, ...] = ()
    failed_thread_ids: tuple[str, ...] = ()
    skipped_thread_ids: tuple[str, ...] = ()
    if checkpoint.thread_summary is not None:
        resolved_thread_ids = checkpoint.thread_summary.resolved_thread_ids
        failed_thread_ids = checkpoint.thread_summary.failed_thread_ids
        skipped_thread_ids = checkpoint.thread_summary.skipped_thread_ids

    return FinalizeRunCheckpointSummary(
        batch_id=checkpoint.batch_id,
        valid=checkpoint.valid,
        batch_complete=checkpoint.batch_complete,
        commit_sha=checkpoint.commit_sha,
        changed_files=checkpoint.changed_files,
        checkpoint_reference=checkpoint.checkpoint_reference,
        resolved_thread_ids=resolved_thread_ids,
        failed_thread_ids=failed_thread_ids,
        skipped_thread_ids=skipped_thread_ids,
        non_thread_outcomes=checkpoint.non_thread_outcomes,
        failed_validation_commands=tuple(
            command for command in checkpoint.validation_commands if command.status == "failed"
        ),
    )


def _skipped_items(
    checkpoints: tuple[RecordBatchCheckpointResult, ...],
) -> list[FinalizeRunSkippedItem]:
    skipped_items: list[FinalizeRunSkippedItem] = []
    for checkpoint in checkpoints:
        skipped_items.extend(_skipped_thread_items(checkpoint))
        skipped_items.extend(_skipped_non_thread_items(checkpoint))
    return skipped_items


def _skipped_thread_items(checkpoint: RecordBatchCheckpointResult) -> list[FinalizeRunSkippedItem]:
    if checkpoint.thread_summary is None:
        return []

    items: list[FinalizeRunSkippedItem] = []
    detailed_thread_ids: set[str] = set()
    for skipped_thread in checkpoint.thread_summary.skipped_threads:
        detailed_thread_ids.add(skipped_thread.thread_id)
        items.append(
            FinalizeRunSkippedItem(
                source_kind="review_thread",
                thread_id=skipped_thread.thread_id,
                batch_id=checkpoint.batch_id,
                skip_reason=skipped_thread.skip_reason,
                summary=skipped_thread.summary,
            )
        )
    for thread_id in checkpoint.thread_summary.skipped_thread_ids:
        if thread_id in detailed_thread_ids:
            continue
        items.append(
            FinalizeRunSkippedItem(
                source_kind="review_thread",
                thread_id=thread_id,
                batch_id=checkpoint.batch_id,
            )
        )
    return items


def _skipped_non_thread_items(
    checkpoint: RecordBatchCheckpointResult,
) -> list[FinalizeRunSkippedItem]:
    items: list[FinalizeRunSkippedItem] = []
    for outcome in checkpoint.non_thread_outcomes:
        if outcome.action != "skipped":
            continue
        items.append(
            FinalizeRunSkippedItem(
                source_kind=outcome.source_kind,
                review_id=outcome.review_id,
                discussion_comment_id=outcome.discussion_comment_id,
                batch_id=checkpoint.batch_id,
                skip_reason=outcome.skip_reason,
                summary=outcome.summary,
            )
        )
    return items


def _checkpoint_thread_ids(
    checkpoints: tuple[RecordBatchCheckpointResult, ...],
    *,
    field_name: str,
) -> set[str]:
    thread_ids: set[str] = set()
    for checkpoint in checkpoints:
        if checkpoint.thread_summary is None:
            continue
        if field_name == "resolved_thread_ids":
            thread_ids.update(checkpoint.thread_summary.resolved_thread_ids)
        elif field_name == "failed_thread_ids":
            thread_ids.update(checkpoint.thread_summary.failed_thread_ids)
    return thread_ids


def _checkpoint_errors(checkpoint: RecordBatchCheckpointResult) -> tuple[FinalizeRunError, ...]:
    errors: list[FinalizeRunError] = []
    if not checkpoint.valid:
        errors.append(
            FinalizeRunError(
                code="invalid_checkpoint_evidence",
                message=f"Checkpoint batch {checkpoint.batch_id} is invalid.",
                batch_id=checkpoint.batch_id,
            )
        )
    elif not checkpoint.batch_complete:
        errors.append(
            FinalizeRunError(
                code="incomplete_checkpoint_evidence",
                message=f"Checkpoint batch {checkpoint.batch_id} is incomplete or failed.",
                batch_id=checkpoint.batch_id,
            )
        )

    if checkpoint.thread_summary is not None:
        for thread_id in checkpoint.thread_summary.failed_thread_ids:
            errors.append(
                FinalizeRunError(
                    code="checkpoint_failed_thread",
                    message=(
                        f"Checkpoint batch {checkpoint.batch_id} reports failed thread "
                        f"resolution for {thread_id}."
                    ),
                    batch_id=checkpoint.batch_id,
                    thread_id=thread_id,
                )
            )

    for command in checkpoint.validation_commands:
        if command.status != "failed":
            continue
        errors.append(
            FinalizeRunError(
                code="failed_validation_command",
                message=(
                    f"Checkpoint batch {checkpoint.batch_id} reports failed validation command: "
                    f"{command.command}"
                ),
                batch_id=checkpoint.batch_id,
            )
        )
    return tuple(errors)


def _thread_summary(thread: ThreadManifestItem) -> FinalizeRunThreadSummary:
    return FinalizeRunThreadSummary(
        thread_id=thread.thread_id,
        path=thread.path,
        line=thread.line,
        start_line=thread.start_line,
        is_outdated=thread.is_outdated,
        is_resolved=thread.is_resolved,
        comment_count=thread.comment_count,
        item_pointer=thread.item_pointer,
    )
