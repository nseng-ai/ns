from __future__ import annotations

from twerk_core.brmem.gateway import EntryRef
from twerk_core.brmem.validation import (
    validate_entry_filters,
    validate_entry_ref,
)
from twerk_core.clinkr.command import ClinkrCommandError


def test_validate_entry_ref_returns_entry_ref_for_valid_inputs() -> None:
    result = validate_entry_ref("workbr", "plan", "feat/x")

    assert result == EntryRef(
        namespace="workbr",
        key="plan",
        branch="feat/x",
        ref_name="refs/brmem/workbr/feat---x/plan",
    )


def test_validate_entry_ref_allows_slashes_in_keys() -> None:
    result = validate_entry_ref("workbr", "plan/plan.md", "feat/x")

    assert result == EntryRef(
        namespace="workbr",
        key="plan/plan.md",
        branch="feat/x",
        ref_name="refs/brmem/workbr/feat---x/plan/plan.md",
    )


def test_validate_entry_ref_allows_separator_in_keys() -> None:
    result = validate_entry_ref("workbr", "a---b", "feat/x")

    assert result == EntryRef(
        namespace="workbr",
        key="a---b",
        branch="feat/x",
        ref_name="refs/brmem/workbr/feat---x/a---b",
    )


def test_validate_entry_ref_preserves_specific_error_type_for_single_failure() -> None:
    result = validate_entry_ref("brs", "plan", "feat/x")

    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_namespace"
    assert result.message == "Invalid namespace 'brs': 'brs' is a reserved namespace"


def test_validate_entry_ref_rejects_empty_key() -> None:
    result = validate_entry_ref("workbr", "", "feat/x")

    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_key"
    assert result.message == "Invalid key '': key must not be empty"


def test_validate_entry_ref_rejects_parent_segment_in_key() -> None:
    result = validate_entry_ref("workbr", "foo/../escape", "feat/x")

    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_key"
    assert result.message == "Invalid key 'foo/../escape': key must not contain '..' segment"


def test_validate_entry_ref_rejects_leading_slash_in_key() -> None:
    result = validate_entry_ref("workbr", "/abs", "feat/x")

    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_key"
    assert result.message == "Invalid key '/abs': key must not start with '/'"


def test_validate_entry_ref_rejects_colon_in_key() -> None:
    result = validate_entry_ref("workbr", "a:b", "feat/x")

    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_key"
    assert result.message == "Invalid key 'a:b': ':' is not supported in keys"


def test_validate_entry_ref_collects_multiple_failures() -> None:
    result = validate_entry_ref("brs", "../escape", "feat---x")

    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_request"
    assert result.message.splitlines() == [
        "Invalid brmem request:",
        "- Invalid namespace 'brs': 'brs' is a reserved namespace",
        "- Invalid key '../escape': key must not contain '..' segment",
        (
            "- Invalid branch name 'feat---x': branch names containing '---' "
            "cannot be encoded into refs/brmem"
        ),
    ]


def test_validate_entry_filters_collects_optional_filter_failures() -> None:
    result = validate_entry_filters(namespace="brs", key="../escape", branch="feat---x")

    assert result == ClinkrCommandError(
        error_type="invalid_request",
        message="\n".join(
            [
                "Invalid brmem request:",
                "- Invalid namespace 'brs': 'brs' is a reserved namespace",
                "- Invalid key '../escape': key must not contain '..' segment",
                (
                    "- Invalid branch name 'feat---x': branch names containing '---' "
                    "cannot be encoded into refs/brmem"
                ),
            ]
        ),
    )
