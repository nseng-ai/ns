"""Business logic for running markdown-defined local reviews."""

from __future__ import annotations

import os
from pathlib import Path

from twerk_reviewer.gateways.harness_config.gateway import HarnessConfigGateway, ReviewerConfig
from twerk_reviewer.gateways.local_diff.gateway import LocalDiffGateway
from twerk_reviewer.gateways.review_definition.gateway import (
    REVIEWS_DIRNAME,
    ReviewDefinitionGateway,
)
from twerk_reviewer.gateways.review_execution.gateway import ReviewExecutionGateway
from twerk_reviewer.git_toplevel import git_toplevel
from twerk_reviewer.harness_registry import HARNESS_ADAPTERS
from twerk_reviewer.models import (
    BaseRefUnavailable,
    HarnessConfigMissing,
    HarnessNotConfigured,
    HarnessUnknown,
    InvalidReviewDefinition,
    LocalReviewResult,
    ModelNotProvided,
    ReviewDefinition,
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
)
from twerk_reviewer.prompting import build_review_prompt
from twerk_reviewer.review_definition import parse_review_definition

ENV_HARNESS = "TWERK_REVIEWER_HARNESS"


def run_review_by_key(
    *,
    key: str,
    requested_model: str | None,
    requested_base_ref: str | None,
    requested_harness: str | None,
    cwd: Path,
    review_definition_gateway: ReviewDefinitionGateway,
    local_diff_gateway: LocalDiffGateway,
    review_execution_gateway: ReviewExecutionGateway,
    harness_config_gateway: HarnessConfigGateway,
) -> LocalReviewResult | ReviewerFailure:
    """Run a markdown-defined reviewer identified by ``key``."""
    repo_root = git_toplevel(cwd=cwd)
    if not isinstance(repo_root, Path):
        return repo_root

    reviews_dir = repo_root / REVIEWS_DIRNAME

    review_path = review_definition_gateway.resolve_key(reviews_dir, key)
    if not isinstance(review_path, Path):
        return review_path

    source = review_definition_gateway.load_source(review_path)
    if not isinstance(source, str):
        return source

    try:
        review_definition = parse_review_definition(source, name=review_path.stem)
    except ValueError as exc:
        return InvalidReviewDefinition(message=str(exc))

    resolved_model = _resolve_model(
        review_definition=review_definition,
        requested_model=requested_model,
    )
    if isinstance(resolved_model, ModelNotProvided):
        return resolved_model

    resolved_harness = _resolve_harness(
        requested_harness=requested_harness,
        repo_root=repo_root,
        harness_config_gateway=harness_config_gateway,
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
    execution_request = ReviewExecutionRequest(
        adapter_name=resolved_harness,
        model=resolved_model,
        prompt=prompt,
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
        findings=execution_response.findings,
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


def _resolve_harness(
    *,
    requested_harness: str | None,
    repo_root: Path,
    harness_config_gateway: HarnessConfigGateway,
) -> str | ReviewerFailure:
    explicit = (requested_harness or "").strip()
    if explicit:
        return _validate_harness(explicit)

    env_value = os.environ.get(ENV_HARNESS, "").strip()
    if env_value:
        return _validate_harness(env_value)

    config = harness_config_gateway.load(repo_root)
    if isinstance(config, HarnessConfigMissing):
        return HarnessNotConfigured(
            message=(
                "No harness configured. Run `reviewer harness init` or pass "
                "--harness, or set TWERK_REVIEWER_HARNESS."
            ),
        )
    if not isinstance(config, ReviewerConfig):
        return config

    return _validate_harness(config.harness_name)


def _validate_harness(name: str) -> str | ReviewerFailure:
    if name not in HARNESS_ADAPTERS:
        known = ", ".join(sorted(HARNESS_ADAPTERS))
        return HarnessUnknown(
            message=f"Unknown harness {name!r}. Known harnesses: {known}.",
        )
    return name
