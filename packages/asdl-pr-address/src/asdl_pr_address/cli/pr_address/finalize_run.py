"""Finalize deterministic pr-address run evidence."""

from __future__ import annotations

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.finalization import finalize_run
from asdl_pr_address.cli.pr_address.finalization_models import (
    FinalizeRunInput,
    FinalizeRunRequest,
    FinalizeRunResult,
)


@clinkr_operation(
    name="finalize-run",
    help="Summarize final pr-address unresolved, skipped, and checkpoint evidence.",
)
def run_finalize_run(
    ctx: click.Context,
    request: FinalizeRunRequest,
) -> ClinkrExit[FinalizeRunResult]:
    del ctx
    payload = load_json_input(
        option_value=request.payload_json,
        file_path=request.payload_file,
        command_name="finalize-run",
        input_description="finalization JSON",
        option_name="--payload-json",
        file_option_name="--payload-file",
        parser=FinalizeRunInput.model_validate_json,
    )
    result = finalize_run(payload)
    if result.valid and result.ready_to_stop:
        return ClinkrExit.ok(result)
    return ClinkrExit.negative(
        result,
        message=(
            "Final pr-address verification found unresolved, failed, or inconsistent evidence; "
            "do not treat the run as complete."
        ),
    )
