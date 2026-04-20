from __future__ import annotations

from twerk_core.brmem.gateway import EntryRef
from twerk_core.brmem.validation import (
    validate_entry_artifact_request,
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
        ref_name="refs/brmem/workbr/plan/feat---x",
    )


def test_validate_entry_ref_preserves_specific_error_type_for_single_failure() -> None:
    result = validate_entry_ref("brs", "plan", "feat/x")

    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_namespace"
    assert result.message == "Invalid namespace 'brs': 'brs' is a reserved namespace"


def test_validate_entry_artifact_request_collects_multiple_failures() -> None:
    result = validate_entry_artifact_request("brs", "a/b", "feat---x", "../notes.md")

    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_request"
    assert result.message.splitlines() == [
        "Invalid brmem request:",
        "- Invalid namespace 'brs': 'brs' is a reserved namespace",
        "- Invalid key 'a/b': key must not contain '/'",
        (
            "- Invalid branch name 'feat---x': branch names containing '---' "
            "cannot be encoded into refs/brmem"
        ),
        "- Invalid artifact path '../notes.md': path must not contain '..'",
    ]


def test_validate_entry_filters_collects_optional_filter_failures() -> None:
    result = validate_entry_filters(namespace="brs", key="a/b", branch="feat---x")

    assert result == ClinkrCommandError(
        error_type="invalid_request",
        message="\n".join(
            [
                "Invalid brmem request:",
                "- Invalid namespace 'brs': 'brs' is a reserved namespace",
                "- Invalid key 'a/b': key must not contain '/'",
                (
                    "- Invalid branch name 'feat---x': branch names containing '---' "
                    "cannot be encoded into refs/brmem"
                ),
            ]
        ),
    )
