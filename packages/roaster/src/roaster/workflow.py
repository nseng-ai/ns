"""Business logic for running CI markdown-defined PR-diff reviews."""

from __future__ import annotations

from collections.abc import Callable

from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.gateways.review_catalog.gateway import ReviewCatalogGateway
from roaster.harness.invocation import HarnessReviewRequest, HarnessRuntime
from roaster.models import (
    BaseRefUnavailable,
    DiffReviewTarget,
    InvalidReviewDefinition,
    LocalReviewFailureResult,
    LocalReviewResult,
    ModelNotProvided,
    ResolvedReviewRunPlan,
    ReviewDefinition,
    ReviewExecutionResponse,
    ReviewSource,
    RoasterFailure,
)
from roaster.review_budget import ReviewBudgetAssessment, assess_review_budget
from roaster.review_definition import parse_review_definition


def run_review_by_key(
    *,
    key: str,
    requested_model: str | None,
    requested_base_ref: str | None,
    catalog: ReviewCatalogGateway,
    diff: LocalDiffGateway,
    harness_runtime: HarnessRuntime,
    progress: Callable[[ResolvedReviewRunPlan], None] | None = None,
) -> LocalReviewResult | LocalReviewFailureResult | RoasterFailure:
    """Run a CI markdown-defined reviewer identified by ``key`` against the PR diff."""
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

    local_diff = diff.load_diff(base_ref=requested_base_ref)
    if isinstance(local_diff, BaseRefUnavailable):
        return local_diff

    if progress is not None:
        progress(
            ResolvedReviewRunPlan(
                review_name=review_definition.name,
                model=resolved_model,
                base_ref=local_diff.base_ref,
                changed_path_count=len(local_diff.changed_paths),
            )
        )

    budget_assessment = assess_review_budget(local_diff)
    if budget_assessment.exceeded:
        return _review_budget_failure_result(
            review_name=review_definition.name,
            review_path=str(review_source.path),
            model=resolved_model,
            base_ref=local_diff.base_ref,
            assessment=budget_assessment,
        )

    execution_response = harness_runtime.run_review(
        HarnessReviewRequest(
            model=resolved_model,
            review_definition=review_definition,
            target=DiffReviewTarget(local_diff=local_diff),
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


def _review_budget_failure_result(
    *,
    review_name: str,
    review_path: str | None,
    model: str | None,
    base_ref: str | None,
    assessment: ReviewBudgetAssessment,
) -> LocalReviewFailureResult:
    reasons = "; ".join(assessment.exceeded_reasons)
    return LocalReviewFailureResult(
        review_name=review_name,
        review_path=review_path,
        model=model,
        base_ref=base_ref,
        error_type="review_budget_exceeded",
        message=(
            f"Review {review_name!r} was not run against base {base_ref!r} because the PR "
            f"exceeds the roaster review budget: {reasons}. Split or shrink the PR, or "
            "follow a documented maintainer bypass process if one exists."
        ),
        changed_path_count=assessment.changed_path_count,
        diff_token_estimate=assessment.diff_token_estimate,
        max_changed_paths=assessment.max_changed_paths,
        max_diff_tokens=assessment.max_diff_tokens,
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
