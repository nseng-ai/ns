"""CLI operation for validating PR feedback classification packets."""

from __future__ import annotations

import json
from typing import Annotated

import click
from pydantic import ValidationError

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.feedback_classification import validate_feedback_classification
from asdl_pr_address.cli.pr_address.feedback_classification_models import (
    FeedbackClassificationValidationResult,
    ValidateFeedbackClassificationInput,
)
from asdl_pr_address.cli.pr_address.json_sources import (
    fail_for_json_or_validation_error,
    load_json_object_source,
    read_json_text_source,
)


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
    if _has_split_options(request):
        _reject_explicit_wrapper_options(request)
        return _load_split_payload(request)
    return _load_wrapper_payload(request)


def _has_split_options(request: ValidateFeedbackClassificationRequest) -> bool:
    return any(
        source is not None
        for source in (
            request.manifest_json,
            request.manifest_file,
            request.classification_json,
            request.classification_file,
        )
    )


def _reject_explicit_wrapper_options(request: ValidateFeedbackClassificationRequest) -> None:
    Ensure.true(
        request.payload_json is None and request.payload_file is None,
        error_type="invalid_request",
        message=(
            "validate-feedback-classification cannot mix wrapper input "
            "(--payload-json/--payload-file) with split manifest/classification inputs."
        ),
    )


def _load_split_payload(
    request: ValidateFeedbackClassificationRequest,
) -> ValidateFeedbackClassificationInput:
    _validate_split_sources(request)
    manifest = load_json_object_source(
        inline_json=request.manifest_json,
        file_path=request.manifest_file,
        allow_stdin=False,
        command_name="validate-feedback-classification",
        input_name="manifest",
        inline_option="--manifest-json",
        file_option="--manifest-file",
    )
    classification = load_json_object_source(
        inline_json=request.classification_json,
        file_path=request.classification_file,
        allow_stdin=False,
        command_name="validate-feedback-classification",
        input_name="classification",
        inline_option="--classification-json",
        file_option="--classification-file",
    )
    return ValidateFeedbackClassificationInput.model_validate(
        {"manifest": manifest, "classification": classification}
    )


def _validate_split_sources(request: ValidateFeedbackClassificationRequest) -> None:
    manifest_source_count = _source_count(request.manifest_json, request.manifest_file)
    classification_source_count = _source_count(
        request.classification_json,
        request.classification_file,
    )
    Ensure.true(
        manifest_source_count == 1 and classification_source_count == 1,
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
    raw_payload = read_json_text_source(
        inline_json=request.payload_json,
        file_path=request.payload_file,
        allow_stdin=True,
        command_name="validate-feedback-classification",
        input_name="wrapper payload",
        inline_option="--payload-json",
        file_option="--payload-file",
    )
    try:
        return ValidateFeedbackClassificationInput.model_validate_json(raw_payload)
    except (json.JSONDecodeError, ValidationError) as exc:
        fail_for_json_or_validation_error(
            exc=exc,
            command_name="validate-feedback-classification",
            input_name="wrapper payload",
        )


def _source_count(*values: str | None) -> int:
    return sum(value is not None for value in values)
