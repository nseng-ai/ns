"""Slots-local builder for the shared real git gateway."""

from __future__ import annotations

from pathlib import Path

from asdl_core.git.real_git_gateway import RealGitGateway, resolve_trunk_branch
from asdl_slots.errors import SlotAllocationError

_resolve_trunk_branch = resolve_trunk_branch


def build_real_slots_git_gateway(repo_root: Path) -> RealGitGateway:
    """Construct a shared ``RealGitGateway``, validating git and resolving trunk.

    Probes git availability and resolves the trunk branch as the single
    construction-time check. After this returns, callers may trust that
    ``git`` is on ``PATH`` and that ``get_trunk_branch()`` has a value.
    """
    try:
        trunk = _resolve_trunk_branch(repo_root)
    except FileNotFoundError as exc:
        raise SlotAllocationError("`git` binary not found on PATH; slots requires git.") from exc
    if trunk is None:
        raise SlotAllocationError(
            "Cannot resolve trunk branch (main/master); slots requires a "
            "git repository with a resolvable trunk."
        )
    return RealGitGateway(repo_root=repo_root, trunk_branch=trunk)
