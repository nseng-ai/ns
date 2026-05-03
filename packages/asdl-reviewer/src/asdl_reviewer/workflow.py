"""Business logic for running markdown-defined local reviews."""

from __future__ import annotations

import os
from pathlib import Path

from asdl_reviewer.gateways.harness_detection.gateway import HarnessDetectionGateway
from asdl_reviewer.gateways.local_diff.gateway import LocalDiffGateway
from asdl_reviewer.gateways.review_definition.gateway import (
    REVIEWS_DIRNAME,
    ReviewDefinitionGateway,
)
from asdl_reviewer.gateways.review_execution.gateway import ReviewExecutionGateway
from asdl_reviewer.git_toplevel import git_toplevel
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
)
from asdl_reviewer.prompting import build_review_prompt, build_review_system_prompt
from asdl_reviewer.review_definition import parse_review_definition

ENV_HARNESS = "TWERK_REVIEWER_HARNESS"


def run_review_by_key(
    *,
    key: str,
    requested_model: str | None,
    requested_base_ref: str | None,
    requested_harness: str | None,
    requested_format: ReviewFormat,
    cwd: Path,
    review_definition_gateway: ReviewDefinitionGateway,
    local_diff_gateway: LocalDiffGateway,
    review_execution_gateway: ReviewExecutionGateway,
    harness_detection_gateway: HarnessDetectionGateway,
) -> LocalReviewResult | ReviewerFailure:
    """Run a markdown-defined reviewer identified by ``key``."""
    repo_root = git_toplevel(cwd=cwd)

    reviews_dir = repo_root / REVIEWS_DIRNAME

    review_path = review_definition_gateway.resolve_key(reviews_dir, key)
    if not isinstance(review_path, Path):
        return review_path

    source = review_definition_gateway.load_source(review_path)
    if not isinstance(source, str):
        return source

    try:
        review_definition = parse_review_definition(source, name=key)
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
        harness_detection_gateway=harness_detection_gateway,
    )
    if not isinstance(resolved_harness, str):
        return resolved_harness

    local_diff = local_diff_gateway.load_diff(base_ref=requested_base_ref)
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
    execution_response = review_execution_gateway.run_review(execution_request)
    if not isinstance(execution_response, ReviewExecutionResponse):
        return execution_response

    return LocalReviewResult(
        review_name=review_definition.name,
        review_path=str(review_path),
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
    harness_detection_gateway: HarnessDetectionGateway,
) -> str | ReviewerFailure:
    """Resolve which harness to dispatch through.

    Order: explicit ``--harness`` flag → ``TWERK_REVIEWER_HARNESS`` env var →
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
        detection = harness_detection_gateway.detect(
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
