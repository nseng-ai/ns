"""CLI operation for validating PR feedback classification packets."""

from __future__ import annotations

import json
import sys
from typing import Annotated, Any, cast

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.feedback_classification import (
    FeedbackClassificationValidationResult,
    ValidateFeedbackClassificationInput,
    validate_feedback_classification,
)
from asdl_pr_address.cli.pr_address.json_input import load_json_input


class ValidateFeedbackClassificationRequest(ClinkrModel):
    payload_json: Annotated[
        str | None,
        click.Option(["--payload-json"], type=click.STRING, required=False),
    ] = None
    payload_file: Annotated[
        str | None,
        click.Option(["--payload-file"], type=click.STRING, required=False),
    ] = None
    manifest_json: Annotated[
        str | None,
        click.Option(["--manifest-json"], type=click.STRING, required=False),
    ] = None
    manifest_file: Annotated[
        str | None,
        click.Option(["--manifest-file"], type=click.STRING, required=False),
    ] = None
    classification_json: Annotated[
        str | None,
        click.Option(["--classification-json"], type=click.STRING, required=False),
    ] = None
    classification_file: Annotated[
        str | None,
        click.Option(["--classification-file"], type=click.STRING, required=False),
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
    if _has_split_source(request):
        _reject_mixed_wrapper_and_split_inputs(request)
        return _load_split_payload(request)
    return _load_wrapper_payload(request)


def _has_split_source(request: ValidateFeedbackClassificationRequest) -> bool:
    return any(
        source is not None
        for source in (
            request.manifest_json,
            request.manifest_file,
            request.classification_json,
            request.classification_file,
        )
    )


def _reject_mixed_wrapper_and_split_inputs(request: ValidateFeedbackClassificationRequest) -> None:
    Ensure.true(
        request.payload_json is None and request.payload_file is None,
        error_type="invalid_request",
        message=(
            "validate-feedback-classification cannot mix wrapper input "
            "(--payload-json/--payload-file/stdin) with split manifest/classification inputs."
        ),
    )
    if sys.stdin.isatty():
        return
    stdin_payload = sys.stdin.read()
    Ensure.true(
        not stdin_payload.strip(),
        error_type="invalid_request",
        message=(
            "validate-feedback-classification cannot mix stdin wrapper input with split "
            "manifest/classification inputs."
        ),
    )


def _load_split_payload(
    request: ValidateFeedbackClassificationRequest,
) -> ValidateFeedbackClassificationInput:
    _validate_split_counterparts(request)
    manifest = load_json_input(
        option_value=request.manifest_json,
        file_value=request.manifest_file,
        stdin_allowed=False,
        command_name="validate-feedback-classification",
        input_description="manifest",
        option_name="--manifest-json",
        file_option_name="--manifest-file",
        parser=_parse_json_object,
    )
    classification = load_json_input(
        option_value=request.classification_json,
        file_value=request.classification_file,
        stdin_allowed=False,
        command_name="validate-feedback-classification",
        input_description="classification",
        option_name="--classification-json",
        file_option_name="--classification-file",
        parser=_parse_json_object,
    )
    return ValidateFeedbackClassificationInput.model_validate(
        {"manifest": manifest, "classification": classification}
    )


def _validate_split_counterparts(request: ValidateFeedbackClassificationRequest) -> None:
    has_manifest = request.manifest_json is not None or request.manifest_file is not None
    has_classification = (
        request.classification_json is not None or request.classification_file is not None
    )
    Ensure.true(
        has_manifest and has_classification,
        error_type="invalid_request",
        message=(
            "validate-feedback-classification split input requires exactly one manifest source "
            "(--manifest-json or --manifest-file) and exactly one classification source "
            "(--classification-json or --classification-file)."
        ),
    )


def _load_wrapper_payload(
    request: ValidateFeedbackClassificationRequest,
) -> ValidateFeedbackClassificationInput:
    return load_json_input(
        option_value=request.payload_json,
        file_value=request.payload_file,
        stdin_allowed=True,
        command_name="validate-feedback-classification",
        input_description="wrapper payload",
        option_name="--payload-json",
        file_option_name="--payload-file",
        parser=ValidateFeedbackClassificationInput.model_validate_json,
    )


def _parse_json_object(raw_payload: str) -> dict[str, object]:
    parsed = json.loads(raw_payload)
    if not isinstance(parsed, dict):
        Ensure.fail(
            error_type="invalid_request",
            message="validate-feedback-classification split JSON inputs must be objects.",
        )
    return cast(dict[str, Any], parsed)
