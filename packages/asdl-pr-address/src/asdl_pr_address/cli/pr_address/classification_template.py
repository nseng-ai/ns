"""Build a deterministic PR feedback classification template."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_pr_address.cli.pr_address.feedback_classification_template import (
    FeedbackClassificationTemplateManifestError,
    FeedbackClassificationTemplateResult,
    build_feedback_classification_template,
)
from asdl_pr_address.cli.pr_address.json_sources import load_json_object_source


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
    manifest = load_json_object_source(
        inline_json=request.manifest_json,
        file_path=request.manifest_file,
        allow_stdin=True,
        command_name="classification-template",
        input_name="compact manifest",
        inline_option="--manifest-json",
        file_option="--manifest-file",
    )
    try:
        return ClinkrExit.ok(build_feedback_classification_template(manifest=manifest))
    except FeedbackClassificationTemplateManifestError as exc:
        Ensure.fail(error_type="invalid_request", message=str(exc))
