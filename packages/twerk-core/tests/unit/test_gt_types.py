"""Tests for Graphite domain types."""

from twerk_core.clinkr.non_ideal_state import NonIdealState
from twerk_core.gt.types import GtCommandFailure, NoParent, UntrackedBranch


def test_no_parent_conforms_to_non_ideal_state() -> None:
    value = NoParent()
    assert value.error_type == "no_parent"
    assert value.message == "Branch has no Graphite parent."
    assert isinstance(value, NonIdealState)


def test_untracked_branch_conforms_to_non_ideal_state() -> None:
    value = UntrackedBranch(message="branch 'foo' is untracked")
    assert value.error_type == "untracked_branch"
    assert value.message == "branch 'foo' is untracked"
    assert isinstance(value, NonIdealState)


def test_gt_command_failure_conforms_to_non_ideal_state() -> None:
    value = GtCommandFailure(message="gt: not found", returncode=127)
    assert value.error_type == "gt_failed"
    assert value.message == "gt: not found"
    assert value.returncode == 127
    assert isinstance(value, NonIdealState)


def test_gt_command_failure_error_type_override() -> None:
    value = GtCommandFailure(
        message="gt trunk failed",
        returncode=1,
        error_type="gt_trunk_failed",
    )
    assert value.error_type == "gt_trunk_failed"
