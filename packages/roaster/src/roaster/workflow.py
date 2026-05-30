"""Business logic for running markdown-defined local reviews."""

from __future__ import annotations

import os

from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.gateways.review_catalog.gateway import ReviewCatalogGateway
from roaster.harness.invocation import HarnessReviewRequest, HarnessRuntime
from roaster.models import (
    BaseRefUnavailable,
    HarnessDetection,
    HarnessNotConfigured,
    HarnessUnknown,
    InvalidReviewDefinition,
    LocalReviewResult,
    ModelNotProvided,
    ReviewDefinition,
    ReviewerFailure,
    ReviewExecutionResponse,
    ReviewFormat,
    ReviewSource,
)
from roaster.review_definition import parse_review_definition

ENV_HARNESS = "ASDL_REVIEWER_HARNESS"


def run_review_by_key(
    *,
    key: str,
    requested_model: str | None,
    requested_base_ref: str | None,
    requested_harness: str | None,
    requested_format: ReviewFormat,
    catalog: ReviewCatalogGateway,
    diff: LocalDiffGateway,
    harness_runtime: HarnessRuntime,
) -> LocalReviewResult | ReviewerFailure:
    """Run a markdown-defined reviewer identified by ``key``."""
    review_source = catalog.load_review_source(key=key)
    if not isinstance(review_source, ReviewSource):
        return review_source

    try:
        review_definition = parse_review_definition(review_source.source, name=review_source.key)
    except ValueError as exc:
        return InvalidReviewDefinition(message=str(exc))

    resolved_model = _resolve_model(
        review_definition=review_definition,
        requested_model=requested_model,
    )
    if isinstance(resolved_model, ModelNotProvided):
        return resolved_model

    resolved_harness = resolve_harness(
        requested_harness=requested_harness,
        harness_runtime=harness_runtime,
    )
    if not isinstance(resolved_harness, str):
        return resolved_harness

    local_diff = diff.load_diff(base_ref=requested_base_ref)
    if isinstance(local_diff, BaseRefUnavailable):
        return local_diff

    execution_response = harness_runtime.run_review(
        HarnessReviewRequest(
            harness_name=resolved_harness,
            model=resolved_model,
            review_definition=review_definition,
            local_diff=local_diff,
            review_format=requested_format,
        )
    )
    if not isinstance(execution_response, ReviewExecutionResponse):
        return execution_response

    return LocalReviewResult(
        review_name=review_definition.name,
        review_path=str(review_source.path),
        model=resolved_model,
        base_ref=local_diff.base_ref,
        payload=execution_response.payload,
        usage=execution_response.usage,
    )


def _resolve_model(
    *,
    review_definition: ReviewDefinition,
    requested_model: str | None,
) -> str | ModelNotProvided:
    explicit_model = (requested_model or "").strip()
    if explicit_model:
        return explicit_model
    if review_definition.default_model is not None and review_definition.default_model.strip():
        return review_definition.default_model.strip()
    return ModelNotProvided(
        message=(
            "No model was provided. Pass --model explicitly or add a "
            "`default_model` field to the review definition frontmatter."
        ),
    )


def resolve_harness(
    *,
    requested_harness: str | None,
    harness_runtime: HarnessRuntime,
) -> str | ReviewerFailure:
    """Resolve which harness to dispatch through.

    Order: explicit ``--harness`` flag → ``ASDL_REVIEWER_HARNESS`` env var →
    the single detected harness on PATH. Errors if zero or 2+ harnesses are
    detected and no explicit choice was made.
    """
    detections = harness_runtime.list_harnesses()

    explicit = (requested_harness or "").strip()
    if explicit:
        return _validate_harness(explicit, detections)

    env_value = os.environ.get(ENV_HARNESS, "").strip()
    if env_value:
        return _validate_harness(env_value, detections)

    available_names = [detection.name for detection in detections if detection.available]

    if len(available_names) == 1:
        return available_names[0]

    if not available_names:
        known = _known_harness_names(detections)
        return HarnessNotConfigured(
            message=(
                f"No harness detected on PATH. Install a supported harness ({known}) "
                f"or pass --harness / set {ENV_HARNESS}."
            ),
        )

    return HarnessNotConfigured(
        message=(
            f"Multiple harnesses detected on PATH ({', '.join(available_names)}). "
            f"Pass --harness or set {ENV_HARNESS} to pick one."
        ),
    )


def _validate_harness(name: str, detections: tuple[HarnessDetection, ...]) -> str | ReviewerFailure:
    known_names = {detection.name for detection in detections}
    if name not in known_names:
        known = _known_harness_names(detections)
        return HarnessUnknown(
            message=f"Unknown harness {name!r}. Known harnesses: {known}.",
        )
    return name


def _known_harness_names(detections: tuple[HarnessDetection, ...]) -> str:
    return ", ".join(sorted(detection.name for detection in detections))
