"""Business logic for local markdown-defined reviews."""

from __future__ import annotations

import os
from pathlib import Path

from twerk_reviewer.gateways.local_diff.gateway import LocalDiffGateway
from twerk_reviewer.gateways.review_definition.gateway import ReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.gateway import ReviewExecutionGateway
from twerk_reviewer.models import (
    LocalReviewResult,
    ReviewDefinition,
    ReviewerFailure,
    ReviewExecutionRequest,
)
from twerk_reviewer.prompting import build_review_prompt
from twerk_reviewer.review_definition import parse_review_definition


def run_local_review(
    *,
    review_path: str,
    requested_model: str | None,
    requested_base_ref: str | None,
    requested_executor_command: str | None,
    review_definition_gateway: ReviewDefinitionGateway,
    local_diff_gateway: LocalDiffGateway,
    review_execution_gateway: ReviewExecutionGateway,
) -> LocalReviewResult | ReviewerFailure:
    """Run a markdown-defined reviewer against the local branch diff."""
    source = review_definition_gateway.load_source(Path(review_path))
    if isinstance(source, ReviewerFailure):
        return source

    try:
        review_definition = parse_review_definition(source)
    except ValueError as exc:
        return ReviewerFailure(
            error_type="invalid_review_definition",
            message=str(exc),
        )

    resolved_model = _resolve_model(
        review_definition=review_definition,
        requested_model=requested_model,
    )
    if isinstance(resolved_model, ReviewerFailure):
        return resolved_model

    resolved_executor_command = _resolve_executor_command(requested_executor_command)
    if isinstance(resolved_executor_command, ReviewerFailure):
        return resolved_executor_command

    local_diff = local_diff_gateway.load_diff(base_ref=requested_base_ref)
    if isinstance(local_diff, ReviewerFailure):
        return local_diff

    prompt = build_review_prompt(
        review_definition=review_definition,
        local_diff=local_diff,
    )
    execution_request = ReviewExecutionRequest(
        executor_command=resolved_executor_command,
        model=resolved_model,
        prompt=prompt,
        review_name=review_definition.name,
        review_description=review_definition.description,
        review_instructions=review_definition.instructions,
        base_ref=local_diff.base_ref,
        diff_text=local_diff.diff_text,
    )
    execution_response = review_execution_gateway.run_review(execution_request)
    if isinstance(execution_response, ReviewerFailure):
        return execution_response

    return LocalReviewResult(
        review_name=review_definition.name,
        review_path=review_path,
        model=resolved_model,
        base_ref=local_diff.base_ref,
        findings=execution_response.findings,
    )


def _resolve_model(
    *,
    review_definition: ReviewDefinition,
    requested_model: str | None,
) -> str | ReviewerFailure:
    explicit_model = (requested_model or "").strip()
    if explicit_model:
        return explicit_model
    if review_definition.default_model is not None and review_definition.default_model.strip():
        return review_definition.default_model.strip()
    return ReviewerFailure(
        error_type="model_not_provided",
        message=(
            "No model was provided. Pass --model explicitly or add a "
            "`## Default Model` section to the review definition."
        ),
    )


def _resolve_executor_command(requested_executor_command: str | None) -> str | ReviewerFailure:
    explicit_command = (requested_executor_command or "").strip()
    if explicit_command:
        return explicit_command

    env_command = os.environ.get("TWERK_REVIEWER_EXECUTOR_COMMAND", "").strip()
    if env_command:
        return env_command

    return ReviewerFailure(
        error_type="executor_command_missing",
        message=(
            "No review executor command was provided. Pass --executor-command "
            "or set TWERK_REVIEWER_EXECUTOR_COMMAND."
        ),
    )
