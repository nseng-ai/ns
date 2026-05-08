"""Unit tests for branch-name validation in ``brmem.ref_layout``.

Branch names are encoded into a single ref segment by replacing ``/`` with
``---``. Names that already contain ``---`` would round-trip ambiguously,
so they are rejected. Empty branch names are rejected too. These checks
are an invariant of ``brmem`` storage and live next to the other key /
namespace / branch validators in :mod:`brmem.ref_layout`; objective skills
must not duplicate or contradict them.
"""

from __future__ import annotations

import pytest

from brmem.ref_layout import (
    InvalidBranchNameError,
    check_branch_name,
    validate_branch_name,
)

# -- check_branch_name: accepted names ----------------------------------------


@pytest.mark.parametrize(
    "branch",
    [
        "master",
        "main",
        "feat/x",
        "feat/x/y/z",
        "release-1.2",
        "user/feature",
        "a",  # minimum length: one char with no separator
    ],
)
def test_check_branch_name_accepts_valid(branch: str) -> None:
    assert check_branch_name(branch) is None


# -- check_branch_name: rejected names ----------------------------------------


@pytest.mark.parametrize(
    "branch",
    [
        "feat---x",  # exact encoding collision
        "---",  # bare separator
        "feat---x---y",  # multiple occurrences
        "prefix---",  # trailing
        "---suffix",  # leading
    ],
)
def test_check_branch_name_rejects_triple_dash(branch: str) -> None:
    """Branch names containing ``---`` collide with the flat encoding."""
    message = check_branch_name(branch)
    assert message is not None
    assert branch in message
    assert "---" in message
    assert "cannot be encoded into refs/brmem" in message


def test_check_branch_name_rejects_empty() -> None:
    message = check_branch_name("")
    assert message is not None
    assert "must not be empty" in message


# -- validate_branch_name: raising behaviour ----------------------------------


def test_validate_branch_name_raises_on_triple_dash() -> None:
    with pytest.raises(InvalidBranchNameError) as exc_info:
        validate_branch_name("feat---x")

    error = exc_info.value
    assert error.branch == "feat---x"
    assert "---" in error.reason
    assert "cannot be encoded into refs/brmem" in error.reason


def test_validate_branch_name_raises_on_empty() -> None:
    with pytest.raises(InvalidBranchNameError) as exc_info:
        validate_branch_name("")

    assert exc_info.value.branch == ""
    assert "must not be empty" in exc_info.value.reason


def test_validate_branch_name_accepts_valid() -> None:
    """``validate_branch_name`` returns ``None`` on accepted names."""
    assert validate_branch_name("feat/x") is None
    assert validate_branch_name("master") is None
