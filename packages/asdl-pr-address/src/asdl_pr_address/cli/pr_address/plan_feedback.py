"""CLI operation for planning validated PR feedback classifications."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.json_input import load_json_input
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.feedback_planning import (
    FeedbackPlanningResult,
    plan_feedback,
)


class PlanFeedbackInput(ClinkrModel):
    manifest: dict[str, object]
    classification: dict[str, object]


class PlanFeedbackRequest(ClinkrModel):
    payload_json: Annotated[
        str | None,
        click.Option(["--payload-json"], type=click.STRING, required=False),
    ] = None


@clinkr_operation(
    name="plan-feedback",
    help="Plan deterministic PR feedback execution batches from a validated classification packet.",
)
def run_plan_feedback(
    ctx: click.Context,
    request: PlanFeedbackRequest,
) -> ClinkrExit[FeedbackPlanningResult]:
    del ctx
    payload = _load_payload(request)
    result = plan_feedback(
        manifest=payload.manifest,
        classification=payload.classification,
    )
    if result.valid:
        return ClinkrExit.ok(result)
    return ClinkrExit.negative(
        result,
        message="PR feedback classification failed validation; no plan produced.",
    )


def _load_payload(request: PlanFeedbackRequest) -> PlanFeedbackInput:
    return load_json_input(
        option_value=request.payload_json,
        command_name="plan-feedback",
        input_description="JSON payload",
        option_name="--payload-json",
        parser=PlanFeedbackInput.model_validate_json,
    )
