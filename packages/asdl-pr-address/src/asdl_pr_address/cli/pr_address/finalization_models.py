"""Models for final pr-address run verification."""

from __future__ import annotations

from typing import Annotated, Literal, TypeAlias

import click

from asdl_core.clinkr.models import ClinkrModel
from asdl_core.payloads.models import PayloadReference
from asdl_pr_address.cli.pr_address.batch_checkpoint_models import (
    BatchNonThreadOutcomeSummary,
    BatchValidationCommandEvidence,
    RecordBatchCheckpointResult,
)
from asdl_pr_address.cli.pr_address.feedback_payload import GetFeedbackPayloadManifest

FinalizeRunSkippedSourceKind: TypeAlias = Literal[
    "review_thread",
    "review",
    "discussion_comment",
]


class FinalizeRunRequest(ClinkrModel):
    payload_json: Annotated[
        str | None,
        click.Option(["--payload-json"], type=click.STRING, required=False),
    ] = None
    payload_file: Annotated[
        str | None,
        click.Option(["--payload-file"], type=click.STRING, required=False),
    ] = None


class FinalizeRunInput(ClinkrModel):
    feedback: GetFeedbackPayloadManifest
    checkpoints: tuple[RecordBatchCheckpointResult, ...] = ()


class FinalizeRunThreadSummary(ClinkrModel):
    thread_id: str
    path: str
    line: int | None = None
    start_line: int | None = None
    is_outdated: bool
    is_resolved: bool
    comment_count: int
    item_pointer: str | None = None


class FinalizeRunSkippedItem(ClinkrModel):
    source_kind: FinalizeRunSkippedSourceKind
    thread_id: str | None = None
    review_id: str | None = None
    discussion_comment_id: int | None = None
    batch_id: str | None = None
    skip_reason: str | None = None
    summary: str | None = None


class FinalizeRunCheckpointSummary(ClinkrModel):
    batch_id: str
    valid: bool
    batch_complete: bool
    commit_sha: str | None = None
    changed_files: tuple[str, ...] = ()
    checkpoint_reference: PayloadReference | None = None
    resolved_thread_ids: tuple[str, ...] = ()
    failed_thread_ids: tuple[str, ...] = ()
    skipped_thread_ids: tuple[str, ...] = ()
    non_thread_outcomes: tuple[BatchNonThreadOutcomeSummary, ...] = ()
    failed_validation_commands: tuple[BatchValidationCommandEvidence, ...] = ()


class FinalizeRunCounts(ClinkrModel):
    checkpoint_batches: int
    complete_batches: int
    incomplete_batches: int
    unresolved_threads: int
    unresolved_unskipped_threads: int
    resolved_threads_from_checkpoints: int
    failed_threads_from_checkpoints: int
    skipped_threads: int
    skipped_non_thread_items: int


class FinalizeRunError(ClinkrModel):
    code: str
    message: str
    batch_id: str | None = None
    thread_id: str | None = None
    review_id: str | None = None
    discussion_comment_id: int | None = None


class FinalizeRunResult(ClinkrModel):
    valid: bool
    ready_to_stop: bool
    all_feedback_addressed: bool
    pr_number: int
    payload_path: str | None = None
    counts: FinalizeRunCounts
    unresolved_threads: tuple[FinalizeRunThreadSummary, ...] = ()
    unresolved_unskipped_threads: tuple[FinalizeRunThreadSummary, ...] = ()
    skipped_items: tuple[FinalizeRunSkippedItem, ...] = ()
    checkpoint_summaries: tuple[FinalizeRunCheckpointSummary, ...] = ()
    errors: tuple[FinalizeRunError, ...] = ()
    warnings: tuple[str, ...] = ()
