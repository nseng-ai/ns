from __future__ import annotations

from asdl_reviewer.cli.reviewer.review.list_reviews import (
    ReviewKeyGroup,
    build_review_key_groups,
)


def test_build_review_key_groups_returns_single_root_group_for_flat_keys() -> None:
    groups = build_review_key_groups(("alpha", "beta", "gamma"))

    assert groups == (ReviewKeyGroup(prefix=None, entries=("alpha", "beta", "gamma")),)


def test_build_review_key_groups_places_root_entries_before_nested_groups() -> None:
    groups = build_review_key_groups(
        ("alpha", "python/fakes", "python/typing", "rust/clippy"),
    )

    assert groups == (
        ReviewKeyGroup(prefix=None, entries=("alpha",)),
        ReviewKeyGroup(prefix="python", entries=("fakes", "typing")),
        ReviewKeyGroup(prefix="rust", entries=("clippy",)),
    )


def test_build_review_key_groups_preserves_nested_suffix_after_first_slash() -> None:
    groups = build_review_key_groups(("shell/bash/style",))

    assert groups == (ReviewKeyGroup(prefix="shell", entries=("bash/style",)),)
