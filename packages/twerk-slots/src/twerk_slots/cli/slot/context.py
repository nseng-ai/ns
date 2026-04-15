"""Build a :class:`SlotsCliContext` from the active Click context."""

from __future__ import annotations

from pathlib import Path

from twerk_slots.cli.slot.gateway_access import (
    get_clipboard_gateway,
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
    cwd = Path.cwd()
    storage = get_storage_gateway()
    slots_root = get_slots_root()
    # Discovery only exercises cwd-based GitGateway methods, so binding the
    # bootstrap gateway to cwd is safe even when cwd is a subdirectory.
    discovery_git = get_git_gateway(repo_root=cwd)
    repo = discover_repo_or_sentinel(cwd, slots_root=slots_root, git=discovery_git)
    if isinstance(repo, NoRepoSentinel):
        return repo
    git = get_git_gateway(repo_root=repo.root)
    pool_state = get_pool_state_gateway(pool_json_path=repo.pool_json_path)
    clipboard = get_clipboard_gateway()
    return SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state,
        clipboard=clipboard,
    )
