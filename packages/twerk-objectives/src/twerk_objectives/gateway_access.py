"""Objective-specific constants and the shared branch-resolution helper."""

from __future__ import annotations

from pathlib import Path

from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure

OBJECTIVE_NAMESPACE = "objectives"
OBJECTIVE_ARCHIVE_NAMESPACE = "objectives-archive"


def resolve_current_objective_branch(
    git_gateway: GitGateway,
    requested_branch: str | None,
) -> str | DetachedHead | GitCommandFailure:
    """Return ``requested_branch`` when set, else the current HEAD branch.

    Surfaces git gateway failures (:class:`DetachedHead`,
    :class:`GitCommandFailure`) unchanged so callers can translate them into
    the appropriate command-level exit.
    """
    if requested_branch is not None:
        return requested_branch

    return git_gateway.get_current_branch(Path.cwd())
