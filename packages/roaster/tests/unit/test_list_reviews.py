from __future__ import annotations

from roaster.cli.roaster.review.list_reviews import (
    ReviewEntryGroup,
    build_review_entry_groups,
)
from roaster.models import ReviewMetadata


def _metadata(key: str) -> ReviewMetadata:
    return ReviewMetadata(
        key=key,
        description=f"Review {key}",
        default_model="haiku",
        scope="all",
    )


def test_build_review_entry_groups_returns_single_root_group_for_flat_keys() -> None:
    reviews = (_metadata("alpha"), _metadata("beta"), _metadata("gamma"))

    groups = build_review_entry_groups(reviews)

    assert groups == (ReviewEntryGroup(prefix=None, entries=reviews),)


def test_build_review_entry_groups_places_root_entries_before_nested_groups() -> None:
    alpha = _metadata("alpha")
    python_fakes = _metadata("python/fakes")
    python_typing = _metadata("python/typing")
    rust_clippy = _metadata("rust/clippy")

    groups = build_review_entry_groups((alpha, python_fakes, python_typing, rust_clippy))

    assert groups == (
        ReviewEntryGroup(prefix=None, entries=(alpha,)),
        ReviewEntryGroup(prefix="python", entries=(python_fakes, python_typing)),
        ReviewEntryGroup(prefix="rust", entries=(rust_clippy,)),
    )


def test_build_review_entry_groups_preserves_nested_suffix_after_first_slash() -> None:
    review = _metadata("shell/bash/style")

    groups = build_review_entry_groups((review,))

    assert groups == (ReviewEntryGroup(prefix="shell", entries=(review,)),)
