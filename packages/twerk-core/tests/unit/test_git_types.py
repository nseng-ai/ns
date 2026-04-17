"""Tests for shared git domain types."""

import pytest

from twerk_core.git.types import DetachedHead, GitCommandFailure, RestructuredFile


def test_detached_head_is_frozen() -> None:
    value = DetachedHead()
    with pytest.raises(AttributeError):
        # Test subject: unknown-attr assignment on a frozen dataclass.
        value.foo = "bar"  # type: ignore[attr-defined]


def test_git_command_failure_construction() -> None:
    failure = GitCommandFailure(message="fatal", returncode=128)
    assert failure.message == "fatal"
    assert failure.returncode == 128


def test_restructured_file_construction() -> None:
    rf = RestructuredFile(
        status="R",
        old_path="src/old.py",
        new_path="src/new.py",
        similarity=95,
    )
    assert rf.status == "R"
    assert rf.similarity == 95
