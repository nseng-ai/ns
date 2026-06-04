"""CLI operation for validating PR feedback classification packets."""

from __future__ import annotations

import sys
from typing import Annotated

import click
from pydantic import ValidationError

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.feedback_classification import (
    FeedbackClassificationValidationResult,
    ValidateFeedbackClassificationInput,
    validate_feedback_classification,
)


class ValidateFeedbackClassificationRequest(ClinkrModel):
    payload_json: Annotated[
        str | None,
        click.Option(["--payload-json"], type=click.STRING, required=False),
    ] = None


@clinkr_operation(
    name="validate-feedback-classification",
    help="Validate a PR feedback classification packet against a compact payload manifest.",
)
def run_validate_feedback_classification(
    ctx: click.Context,
    request: ValidateFeedbackClassificationRequest,
) -> ClinkrExit[FeedbackClassificationValidationResult]:
    del ctx
    payload = _load_payload(request)
    result = validate_feedback_classification(
        manifest=payload.manifest,
        classification=payload.classification,
    )
    if result.valid:
        return ClinkrExit.ok(result)
    return ClinkrExit.negative(result, message="PR feedback classification failed validation.")


def _load_payload(
    request: ValidateFeedbackClassificationRequest,
) -> ValidateFeedbackClassificationInput:
    raw_payload = request.payload_json if request.payload_json is not None else sys.stdin.read()
    Ensure.truthy(
        raw_payload.strip(),
        error_type="invalid_request",
        message=(
            "validate-feedback-classification requires a non-empty JSON payload via stdin "
            "or --payload-json"
        ),
    )
    try:
        return ValidateFeedbackClassificationInput.model_validate_json(raw_payload)
    except ValidationError as exc:
        raise_type = "invalid_json" if _is_json_parse_error(exc) else "invalid_request"
        Ensure.fail(
            error_type=raise_type,
            message=f"Invalid validate-feedback-classification payload: {exc}",
        )


def _is_json_parse_error(exc: ValidationError) -> bool:
    for error in exc.errors():
        if error.get("type") == "json_invalid":
            return True
    return False
