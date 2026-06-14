"""Review-size budget policy for local roaster review runs."""

from __future__ import annotations

from dataclasses import dataclass

from roaster.diff_parsing import estimate_tokens
from roaster.models import LocalDiff


@dataclass(frozen=True)
class ReviewBudget:
    """Thresholds that gate whether a local diff is eligible for model review."""

    # GitHub's PR diff endpoint fails above 300 files; roaster CI uses the local
    # checkout diff but keeps the same policy boundary so authors see a
    # deterministic split/shrink signal before any model invocation.
    max_changed_paths: int = 300
    # Claude Code was observed rejecting prompts around a 200k token limit. Keep
    # the full-diff policy below that to leave room for system prompts, review
    # instructions, changed-path listings, schemas, and tool envelope overhead.
    max_diff_tokens: int = 150_000


DEFAULT_REVIEW_BUDGET = ReviewBudget()


@dataclass(frozen=True)
class ReviewBudgetAssessment:
    """Computed review-size facts and policy violations for one local diff."""

    changed_path_count: int
    diff_token_estimate: int
    max_changed_paths: int
    max_diff_tokens: int
    exceeded_reasons: tuple[str, ...]

    @property
    def exceeded(self) -> bool:
        return bool(self.exceeded_reasons)


def assess_review_budget(
    local_diff: LocalDiff,
    *,
    budget: ReviewBudget = DEFAULT_REVIEW_BUDGET,
) -> ReviewBudgetAssessment:
    """Assess whether ``local_diff`` is small enough for a roaster review run."""
    changed_path_count = len(local_diff.changed_paths)
    diff_token_estimate = estimate_tokens(local_diff.diff_text)
    reasons: list[str] = []
    if changed_path_count > budget.max_changed_paths:
        reasons.append(f"changed paths {changed_path_count} > {budget.max_changed_paths}")
    if diff_token_estimate > budget.max_diff_tokens:
        reasons.append(
            f"estimated full diff tokens {diff_token_estimate} > {budget.max_diff_tokens}"
        )
    return ReviewBudgetAssessment(
        changed_path_count=changed_path_count,
        diff_token_estimate=diff_token_estimate,
        max_changed_paths=budget.max_changed_paths,
        max_diff_tokens=budget.max_diff_tokens,
        exceeded_reasons=tuple(reasons),
    )
