from __future__ import annotations

import pytest

from roaster.stack_slugs import (
    StackSlugError,
    generated_batch_branch_name,
    validate_batch_slug,
    validate_branch_memory_branch_name,
    validate_branch_memory_segment,
    validate_generated_branch_name,
    validate_profile_slug,
    validate_run_slug,
)


def test_validate_safe_stack_slugs() -> None:
    assert validate_profile_slug("thermonuclear-stack.v1") == "thermonuclear-stack.v1"
    assert validate_run_slug("run_2026-06-05") == "run_2026-06-05"
    assert validate_batch_slug("batch.one") == "batch.one"


@pytest.mark.parametrize(
    "slug",
    ["", " leading", "trailing ", "../secret", "two/segments", "bad slug"],
)
def test_validate_stack_slugs_reject_unsafe_segments(slug: str) -> None:
    with pytest.raises(StackSlugError) as exc_info:
        validate_run_slug(slug)

    assert "run slug" in str(exc_info.value)


def test_generated_batch_branch_name_uses_roaster_layout() -> None:
    branch_name = generated_batch_branch_name(
        impl_branch_slug="impl-branch",
        run_slug="run-1",
        batch_slug="batch-1",
    )

    assert branch_name == "impl-branch/roaster/run-1/batch-1"


@pytest.mark.parametrize(
    "branch_name",
    [
        "impl/roaster/run/batch",
        "impl-branch/roaster/run-1/batch-1",
    ],
)
def test_validate_generated_branch_name_accepts_safe_branch_names(branch_name: str) -> None:
    assert validate_generated_branch_name(branch_name) == branch_name


@pytest.mark.parametrize(
    ("branch_name", "message"),
    [
        ("", "must not be empty"),
        (" leading", "surrounding whitespace"),
        ("trailing ", "surrounding whitespace"),
        ("/starts-with-slash", "start or end"),
        ("ends-with-slash/", "start or end"),
        ("double//slash", "empty path segments"),
        ("has..dots", "`..`"),
        ("has@{brace", "`@{`"),
        ("has space", "forbidden git ref character"),
        ("segment/.hidden", "must not start"),
        ("segment/trailing.", "must not end"),
        ("segment/name.lock", "`.lock`"),
    ],
)
def test_validate_generated_branch_name_rejects_unsafe_branch_names(
    branch_name: str,
    message: str,
) -> None:
    with pytest.raises(StackSlugError) as exc_info:
        validate_generated_branch_name(branch_name)

    assert message in str(exc_info.value)


def test_validate_branch_memory_segment_rejects_delimiter() -> None:
    with pytest.raises(StackSlugError) as exc_info:
        validate_branch_memory_segment("run---one", label="Branch Memory run segment")

    assert "`---`" in str(exc_info.value)


def test_validate_branch_memory_branch_name_rejects_delimiter_early() -> None:
    with pytest.raises(StackSlugError) as exc_info:
        validate_branch_memory_branch_name("feature---branch")

    assert "Branch Memory branch names" in str(exc_info.value)
    assert "`---`" in str(exc_info.value)
