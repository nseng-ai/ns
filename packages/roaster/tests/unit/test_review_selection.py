from __future__ import annotations

from roaster.models import ReviewDefinition
from roaster.review_selection import build_review_selection, matching_changed_paths


def _definition(name: str, *, when_changed: tuple[str, ...]) -> ReviewDefinition:
    return ReviewDefinition(
        name=name,
        description=f"Review {name}.",
        instructions="Flag concrete issues.",
        default_model="haiku",
        when_changed=when_changed,
    )


def test_matching_changed_paths_treats_double_star_prefix_as_root_or_nested() -> None:
    result = matching_changed_paths(
        patterns=("**/*.py",),
        changed_paths=("app.py", "src/app.py", "src/app.ts"),
    )

    assert result == ("app.py", "src/app.py")


def test_build_review_selection_selects_matching_reviews_and_skips_non_matches() -> None:
    selection = build_review_selection(
        review_definitions=(
            _definition("dignified-python", when_changed=("**/*.py",)),
            _definition("typescript-style", when_changed=("**/*.ts", "**/*.tsx")),
        ),
        changed_paths=("ts/packages/pi-extensions/src/roast.ts",),
    )

    assert [review.key for review in selection.selected] == ["typescript-style"]
    assert selection.selected[0].default_model == "haiku"
    assert selection.selected[0].matched_paths == ("ts/packages/pi-extensions/src/roast.ts",)
    assert [review.key for review in selection.skipped] == ["dignified-python"]
    assert selection.skipped[0].default_model == "haiku"
    assert selection.skipped[0].reason == "no_changed_path_match"


def test_build_review_selection_selects_unconditional_reviews_even_without_changed_paths() -> None:
    selection = build_review_selection(
        review_definitions=(_definition("always", when_changed=()),),
        changed_paths=(),
    )

    assert [review.key for review in selection.selected] == ["always"]
    assert selection.selected[0].matched_paths == ()
    assert selection.skipped == ()
