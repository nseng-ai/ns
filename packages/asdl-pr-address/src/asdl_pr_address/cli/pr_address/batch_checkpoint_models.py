"""Models for pr-address batch checkpoint evidence."""

from __future__ import annotations

from typing import Annotated, Literal, TypeAlias

import click

from asdl_core.clinkr.models import ClinkrModel
from asdl_core.payloads.models import PayloadReference
from asdl_pr_address.cli.pr_address.build_resolve_thread_batch_payload import (
    BuildResolveThreadBatchPayloadResult,
)
from asdl_pr_address.cli.pr_address.feedback_planning import FeedbackPlanningResult
from asdl_pr_address.cli.pr_address.resolve_thread_batch import ResolveThreadBatchResult

BatchValidationStatus: TypeAlias = Literal["passed", "failed", "skipped"]
BatchNonThreadSourceKind: TypeAlias = Literal["review", "discussion_comment"]
BatchNonThreadAction: TypeAlias = Literal["replied", "skipped", "no_reply_needed"]


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
    plan: FeedbackPlanningResult
    batch_id: str
    commit_sha: str | None = None
    changed_files: tuple[str, ...] = ()
    validation_commands: tuple[BatchValidationCommandEvidence, ...] = ()
    thread_payload_build: BuildResolveThreadBatchPayloadResult | None = None
    thread_resolution_result: ResolveThreadBatchResult | None = None
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
