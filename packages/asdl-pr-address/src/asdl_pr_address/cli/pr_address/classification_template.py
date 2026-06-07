"""Build a deterministic PR feedback classification template."""

from __future__ import annotations

import json
from typing import Annotated, Any, cast

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.feedback_classification import (
    FeedbackClassificationTemplateManifestError,
    FeedbackClassificationTemplateResult,
    build_feedback_classification_template,
)
from asdl_pr_address.cli.pr_address.json_input import load_json_input


class ClassificationTemplateRequest(ClinkrModel):
    manifest_json: Annotated[
        str | None,
        click.Option(["--manifest-json"], type=click.STRING, required=False),
    ] = None
    manifest_file: Annotated[
        str | None,
        click.Option(["--manifest-file"], type=click.STRING, required=False),
    ] = None


@clinkr_operation(
    name="classification-template",
    help="Build a deterministic classification scaffold from a compact payload manifest.",
)
def run_classification_template(
    ctx: click.Context,
    request: ClassificationTemplateRequest,
) -> ClinkrExit[FeedbackClassificationTemplateResult]:
    del ctx
    manifest = load_json_input(
        option_value=request.manifest_json,
        file_value=request.manifest_file,
        stdin_allowed=True,
        command_name="classification-template",
        input_description="compact manifest",
        option_name="--manifest-json",
        file_option_name="--manifest-file",
        parser=_parse_json_object,
    )
    try:
        return ClinkrExit.ok(build_feedback_classification_template(manifest=manifest))
    except FeedbackClassificationTemplateManifestError as exc:
        Ensure.fail(error_type="invalid_request", message=str(exc))


def _parse_json_object(raw_payload: str) -> dict[str, object]:
    parsed = json.loads(raw_payload)
    if not isinstance(parsed, dict):
        Ensure.fail(
            error_type="invalid_request",
            message="classification-template compact manifest JSON must be an object.",
        )
    return cast(dict[str, Any], parsed)
