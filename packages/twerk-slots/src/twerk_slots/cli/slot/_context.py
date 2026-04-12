"""Build a :class:`SlotsCliContext` from the active Click context."""

from __future__ import annotations

from pathlib import Path

from twerk_slots.cli.slot._gateway_access import (
    get_git_gateway,
    get_pool_state_gateway,
    get_slots_root,
    get_storage_gateway,
)
from twerk_slots.context import SlotsCliContext
from twerk_slots.repo_context import NoRepoSentinel, discover_repo_or_sentinel


def build_slots_context() -> SlotsCliContext | NoRepoSentinel:
    """Assemble a :class:`SlotsCliContext` from the active Click context.

    Returns a :class:`NoRepoSentinel` when ``cwd`` is outside a git repo so
    callers can surface a ClinkrCommandError without another branch.
    """
    git = get_git_gateway()
    storage = get_storage_gateway()
    pool_state = get_pool_state_gateway()
    slots_root = get_slots_root()
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=git)
    if isinstance(repo, NoRepoSentinel):
        return repo
    return SlotsCliContext(repo=repo, git=git, storage=storage, pool_state=pool_state)
