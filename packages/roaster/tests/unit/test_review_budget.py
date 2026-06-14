from __future__ import annotations

from roaster.models import LocalDiff
from roaster.review_budget import ReviewBudget, assess_review_budget


def _diff_text_for_paths(paths: tuple[str, ...]) -> str:
    return "".join(f"diff --git a/{path} b/{path}\n+changed\n" for path in paths)


def _diff_text_for_large_file(path: str, *, payload_size: int) -> str:
    payload = "x" * payload_size
    return (
        f"diff --git a/{path} b/{path}\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
        "@@ -1 +1 @@\n"
        f"-{payload}\n"
        f"+{payload}y\n"
    )


def test_assess_review_budget_accepts_small_diff() -> None:
    assessment = assess_review_budget(
        LocalDiff(base_ref="master", diff_text=_diff_text_for_paths(("app.py",)))
    )

    assert assessment.exceeded is False
    assert assessment.facts.changed_path_count == 1
    assert assessment.facts.max_changed_paths == 300
    assert assessment.exceeded_reasons == ()


def test_assess_review_budget_reports_changed_path_limit() -> None:
    paths = tuple(f"pkg/file_{index}.py" for index in range(301))

    assessment = assess_review_budget(
        LocalDiff(base_ref="master", diff_text=_diff_text_for_paths(paths))
    )

    assert assessment.exceeded is True
    assert assessment.facts.changed_path_count == 301
    assert "changed paths 301 > 300" in assessment.exceeded_reasons


def test_assess_review_budget_reports_token_limit() -> None:
    assessment = assess_review_budget(
        LocalDiff(base_ref="master", diff_text="x" * 41),
        budget=ReviewBudget(max_changed_paths=300, max_diff_tokens=10),
    )

    assert assessment.exceeded is True
    assert assessment.facts.diff_token_estimate == 11
    assert "estimated full diff tokens 11 > 10" in assessment.exceeded_reasons


def test_assess_review_budget_reports_file_token_limit() -> None:
    assessment = assess_review_budget(
        LocalDiff(
            base_ref="master",
            diff_text=_diff_text_for_large_file("large.json", payload_size=500),
        ),
        budget=ReviewBudget(
            max_changed_paths=300,
            max_diff_tokens=1_000,
            max_file_diff_tokens=100,
        ),
    )

    assert assessment.exceeded is True
    assert assessment.facts.oversized_file_paths == ("large.json",)
    assert (
        "file diff token estimate exceeds per-file limit 100: large.json"
        in assessment.exceeded_reasons
    )
