"""Abstract interface and shared validation for branch memory."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import PurePosixPath

BRMEM_REF_PREFIX = "refs/brmem"
_BRANCH_SEPARATOR = "---"


class InvalidBranchNameError(ValueError):
    """Raised when a branch name cannot be encoded safely into ``refs/brmem``."""

    def __init__(self, branch: str, reason: str) -> None:
        self.branch = branch
        self.reason = reason
        super().__init__(f"Invalid branch name {branch!r}: {reason}")


class InvalidMemoryPathError(ValueError):
    """Raised when a stored path is not a safe relative POSIX path."""

    def __init__(self, path: str, reason: str) -> None:
        self.path = path
        self.reason = reason
        super().__init__(f"Invalid branch-memory path {path!r}: {reason}")


class BranchMemoryGateway(ABC):
    """Store small per-branch files outside the working tree."""

    @abstractmethod
    def put(self, branch: str, path: str, content: str) -> str:
        """Write ``content`` to ``path`` for ``branch`` and return the new commit SHA."""

    @abstractmethod
    def get(self, branch: str, path: str, *, at: str | None = None) -> str | None:
        """Read ``path`` for ``branch`` at ``at`` or the branch head when omitted."""


def ref_name_for_branch(branch: str) -> str:
    """Return the git ref used to store memory for ``branch``."""
    validate_branch_name(branch)
    return f"{BRMEM_REF_PREFIX}/{encode_branch_name(branch)}"


def encode_branch_name(branch: str) -> str:
    """Encode a branch name into a flat ref-friendly key."""
    validate_branch_name(branch)
    return branch.replace("/", _BRANCH_SEPARATOR)


def validate_branch_name(branch: str) -> None:
    """Reject branch names that collide with the flat ``/ -> ---`` encoding."""
    if not branch:
        raise InvalidBranchNameError(branch, "branch name must not be empty")
    if _BRANCH_SEPARATOR in branch:
        raise InvalidBranchNameError(
            branch,
            "branch names containing '---' cannot be encoded into refs/brmem",
        )


def validate_memory_path(path: str) -> None:
    """Reject absolute or parent-traversing paths."""
    if not path:
        raise InvalidMemoryPathError(path, "path must not be empty")
    if ":" in path:
        raise InvalidMemoryPathError(path, "':' is not supported in branch-memory paths")

    normalized = PurePosixPath(path)
    if normalized.is_absolute():
        raise InvalidMemoryPathError(path, "path must be relative")

    normalized_text = normalized.as_posix()
    if normalized_text in {".", ""}:
        raise InvalidMemoryPathError(path, "path must reference a file")

    if any(part == ".." for part in normalized.parts):
        raise InvalidMemoryPathError(path, "path must not contain '..'")
