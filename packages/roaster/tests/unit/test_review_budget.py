from __future__ import annotations

from roaster.models import LocalDiff
from roaster.review_budget import ReviewBudget, assess_review_budget


def _diff_text_for_paths(paths: tuple[str, ...]) -> str:
    return "".join(f"diff --git a/{path} b/{path}\n+changed\n" for path in paths)


def test_assess_review_budget_accepts_small_diff() -> None:
    assessment = assess_review_budget(
        LocalDiff(base_ref="master", diff_text=_diff_text_for_paths(("app.py",)))
    )

    assert assessment.exceeded is False
    assert assessment.changed_path_count == 1
    assert assessment.max_changed_paths == 300
    assert assessment.exceeded_reasons == ()


def test_assess_review_budget_reports_changed_path_limit() -> None:
    paths = tuple(f"pkg/file_{index}.py" for index in range(301))

    assessment = assess_review_budget(
        LocalDiff(base_ref="master", diff_text=_diff_text_for_paths(paths))
    )

    assert assessment.exceeded is True
    assert assessment.changed_path_count == 301
    assert "changed paths 301 > 300" in assessment.exceeded_reasons


def test_assess_review_budget_reports_token_limit() -> None:
    assessment = assess_review_budget(
        LocalDiff(base_ref="master", diff_text="x" * 41),
        budget=ReviewBudget(max_changed_paths=300, max_diff_tokens=10),
    )

    assert assessment.exceeded is True
    assert assessment.diff_token_estimate == 11
    assert "estimated full diff tokens 11 > 10" in assessment.exceeded_reasons
