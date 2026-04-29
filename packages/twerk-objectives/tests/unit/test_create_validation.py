"""Unit tests for ``twerk_objectives.create_validation``.

The slug-format rules are part of the contract `objective-create` enforces;
covering them as pure-function unit tests keeps the rules grep-able and
makes test failures point directly at the validation surface (rather than
forcing a re-read of the full Click + brmem stack).
"""

from __future__ import annotations

import pytest

from brmem.fake import FakeBranchMemoryGateway
from twerk_objectives.create_validation import (
    SLUG_MAX_LENGTH,
    InvalidSlug,
    slug_collides_on_trunk,
    validate_slug_format,
)

# ---------------------------------------------------------------------------
# validate_slug_format
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "good_slug",
    [
        "widget-rewrite",
        "alpha",
        "alpha1",
        "alpha-1",
        "a-b-c-d-e",
        "a" * SLUG_MAX_LENGTH,
        # ``body`` (without ``.md``) is allowed — only the ``body.md`` literal is forbidden.
        "body",
    ],
)
def test_validate_slug_format_accepts_valid_slugs(good_slug: str) -> None:
    assert validate_slug_format(good_slug) is None


def test_validate_slug_format_rejects_empty() -> None:
    invalid = validate_slug_format("")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "empty"


def test_validate_slug_format_rejects_slash() -> None:
    invalid = validate_slug_format("foo/bar")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "contains_slash"


def test_validate_slug_format_rejects_legacy_key_form() -> None:
    invalid = validate_slug_format("foo/body.md")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "contains_slash"


def test_validate_slug_format_rejects_body_md_literal() -> None:
    """``body.md`` contains a ``.`` so it fails the lowercase-ASCII rule.

    The forbidden ``/body.md`` suffix is also redundant once ``/`` is
    rejected, but kept as a defensive layer in case a future regex relaxes
    the ASCII rule.
    """
    invalid = validate_slug_format("body.md")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "non_ascii_or_uppercase"


def test_validate_slug_format_rejects_objective_prefix() -> None:
    invalid = validate_slug_format("objective-foo")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "leading_objective_prefix"


def test_validate_slug_format_rejects_uppercase() -> None:
    invalid = validate_slug_format("Foo-Bar")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "non_ascii_or_uppercase"


def test_validate_slug_format_rejects_non_ascii() -> None:
    invalid = validate_slug_format("café")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "non_ascii_or_uppercase"


def test_validate_slug_format_rejects_underscore() -> None:
    invalid = validate_slug_format("foo_bar")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "non_ascii_or_uppercase"


def test_validate_slug_format_rejects_consecutive_hyphens() -> None:
    invalid = validate_slug_format("foo--bar")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "consecutive_hyphens"


def test_validate_slug_format_rejects_leading_hyphen() -> None:
    invalid = validate_slug_format("-foo")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "leading_or_trailing_hyphen"


def test_validate_slug_format_rejects_trailing_hyphen() -> None:
    invalid = validate_slug_format("foo-")
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "leading_or_trailing_hyphen"


def test_validate_slug_format_rejects_too_long() -> None:
    invalid = validate_slug_format("a" * (SLUG_MAX_LENGTH + 1))
    assert isinstance(invalid, InvalidSlug)
    assert invalid.reason == "too_long"


# ---------------------------------------------------------------------------
# slug_collides_on_trunk
# ---------------------------------------------------------------------------


def test_slug_collides_on_trunk_empty_gateway() -> None:
    gateway = FakeBranchMemoryGateway()
    assert slug_collides_on_trunk(gateway, slug="widget", trunk_branch="master") is False


def test_slug_collides_on_trunk_when_body_present() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "master", "# body\n")
    assert slug_collides_on_trunk(gateway, slug="widget", trunk_branch="master") is True


def test_slug_collides_on_trunk_when_only_roadmap_present() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/roadmap.md", "master", "# r\n")
    assert slug_collides_on_trunk(gateway, slug="widget", trunk_branch="master") is True


def test_slug_collides_on_trunk_ignores_other_branches() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/x", "# branch\n")
    assert slug_collides_on_trunk(gateway, slug="widget", trunk_branch="master") is False


def test_slug_collides_on_trunk_ignores_other_slugs() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# a\n")
    assert slug_collides_on_trunk(gateway, slug="beta", trunk_branch="master") is False


def test_slug_collides_on_trunk_does_not_match_prefix_substring() -> None:
    """``widget`` must not collide with ``widget-rewrite/body.md``."""
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# wr\n")
    assert slug_collides_on_trunk(gateway, slug="widget", trunk_branch="master") is False
