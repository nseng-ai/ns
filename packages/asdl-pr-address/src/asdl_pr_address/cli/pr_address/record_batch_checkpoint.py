"""Record compact per-batch pr-address checkpoint evidence."""

from __future__ import annotations

from pathlib import Path
from typing import NoReturn

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.payloads.errors import PayloadError
from asdl_core.payloads.models import PayloadReference
from asdl_core.payloads.store import PayloadStore
from asdl_pr_address.cli.pr_address.batch_checkpoint_models import (
    BatchCheckpointArtifact,
    RecordBatchCheckpointInput,
    RecordBatchCheckpointRequest,
    RecordBatchCheckpointResult,
)
from asdl_pr_address.cli.pr_address.batch_checkpoint_validation import record_batch_checkpoint
from asdl_pr_address.cli.pr_address.string_values import trim_required


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
