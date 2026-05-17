"""Business logic for running markdown-defined local reviews."""

from __future__ import annotations

import os

from asdl_reviewer.gateways.review_environment.gateway import ReviewEnvironmentGateway
from asdl_reviewer.harness_registry import HARNESS_ADAPTERS
from asdl_reviewer.models import (
    BaseRefUnavailable,
    HarnessNotConfigured,
    HarnessUnknown,
    InvalidReviewDefinition,
    LocalReviewResult,
    ModelNotProvided,
    ReviewDefinition,
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewFormat,
    ReviewSource,
)
from asdl_reviewer.prompting import build_review_prompt, build_review_system_prompt
from asdl_reviewer.review_definition import parse_review_definition

ENV_HARNESS = "ASDL_REVIEWER_HARNESS"


def run_review_by_key(
    *,
    key: str,
    requested_model: str | None,
    requested_base_ref: str | None,
    requested_harness: str | None,
    requested_format: ReviewFormat,
    review_environment: ReviewEnvironmentGateway,
) -> LocalReviewResult | ReviewerFailure:
    """Run a markdown-defined reviewer identified by ``key``."""
    review_source = review_environment.load_review_source(key=key)
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
        review_environment=review_environment,
    )
    if not isinstance(resolved_harness, str):
        return resolved_harness

    local_diff = review_environment.load_diff(base_ref=requested_base_ref)
    if isinstance(local_diff, BaseRefUnavailable):
        return local_diff

    prompt = build_review_prompt(
        review_definition=review_definition,
        local_diff=local_diff,
    )
    system_prompt = build_review_system_prompt(requested_format)
    execution_request = ReviewExecutionRequest(
        adapter_name=resolved_harness,
        model=resolved_model,
        prompt=prompt,
        system_prompt=system_prompt,
        review_format=requested_format,
        review_name=review_definition.name,
        review_description=review_definition.description,
        review_instructions=review_definition.instructions,
        base_ref=local_diff.base_ref,
        diff_text=local_diff.diff_text,
    )
    execution_response = review_environment.run_review(execution_request)
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
    review_environment: ReviewEnvironmentGateway,
) -> str | ReviewerFailure:
    """Resolve which harness to dispatch through.

    Order: explicit ``--harness`` flag → ``ASDL_REVIEWER_HARNESS`` env var →
    the single detected harness on PATH. Errors if zero or 2+ harnesses are
    detected and no explicit choice was made.
    """
    explicit = (requested_harness or "").strip()
    if explicit:
        return _validate_harness(explicit)

    env_value = os.environ.get(ENV_HARNESS, "").strip()
    if env_value:
        return _validate_harness(env_value)

    available_names: list[str] = []
    for adapter in HARNESS_ADAPTERS.values():
        detection = review_environment.detect_harness(
            name=adapter.name,
            binary=adapter.binary,
        )
        if detection.available:
            available_names.append(adapter.name)

    if len(available_names) == 1:
        return available_names[0]

    if not available_names:
        known = ", ".join(sorted(HARNESS_ADAPTERS))
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


def _validate_harness(name: str) -> str | ReviewerFailure:
    if name not in HARNESS_ADAPTERS:
        known = ", ".join(sorted(HARNESS_ADAPTERS))
        return HarnessUnknown(
            message=f"Unknown harness {name!r}. Known harnesses: {known}.",
        )
    return name
