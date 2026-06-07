"""CLI operation for building PR feedback classification templates."""

from __future__ import annotations

import json
import sys
from typing import Annotated

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


class ClassificationTemplateRequest(ClinkrModel):
    manifest_json: Annotated[
        str | None,
        click.Option(["--manifest-json"], type=click.STRING, required=False),
    ] = None


@clinkr_operation(
    name="classification-template",
    help="Build a deterministic PR feedback classification template from a compact manifest.",
)
def run_classification_template(
    ctx: click.Context,
    request: ClassificationTemplateRequest,
) -> ClinkrExit[FeedbackClassificationTemplateResult]:
    del ctx
    manifest = _load_manifest(request)
    try:
        result = build_feedback_classification_template(manifest=manifest)
    except FeedbackClassificationTemplateManifestError as exc:
        Ensure.fail(
            error_type="invalid_request",
            message=f"Invalid compact feedback manifest for classification-template: {exc}",
        )
    return ClinkrExit.ok(result)


def _load_manifest(request: ClassificationTemplateRequest) -> dict[str, object]:
    raw_payload = request.manifest_json if request.manifest_json is not None else sys.stdin.read()
    Ensure.truthy(
        raw_payload.strip(),
        error_type="invalid_request",
        message=(
            "classification-template requires a non-empty compact feedback manifest via stdin "
            "or --manifest-json"
        ),
    )
    try:
        manifest = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        Ensure.fail(
            error_type="invalid_json",
            message=f"Invalid classification-template manifest JSON: {exc}",
        )

    Ensure.true(
        isinstance(manifest, dict),
        error_type="invalid_request",
        message="classification-template manifest must be a JSON object",
    )
    return manifest
