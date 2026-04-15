"""Build a :class:`SlotsCliContext` from the active working directory."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_core.gh.pr_gateway import RealPRGateway
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.pool_state_gateway import RealPoolStateGateway
from twerk_slots.gateway.real_clipboard import RealClipboardGateway
from twerk_slots.gateway.real_git import RealGitGateway
from twerk_slots.gateway.real_storage import RealSlotsStorageGateway
from twerk_slots.repo_context import SLOTS_ROOT, NoRepoSentinel, discover_repo_or_sentinel


def build_slots_context() -> SlotsCliContext | NoRepoSentinel:
    """Assemble a :class:`SlotsCliContext` from real gateways and the cwd.

    Returns a :class:`NoRepoSentinel` when ``cwd`` is outside a git repo so
    callers can surface a ClinkrCommandError without another branch.
    """
    cwd = Path.cwd()
    slots_root = SLOTS_ROOT
    storage = RealSlotsStorageGateway()
    # Discovery only exercises cwd-based GitGateway methods, so binding the
    # bootstrap gateway to cwd is safe even when cwd is a subdirectory.
    discovery_git = RealGitGateway(repo_root=cwd)
    repo = discover_repo_or_sentinel(cwd, slots_root=slots_root, git=discovery_git)
    if isinstance(repo, NoRepoSentinel):
        return repo
    return SlotsCliContext(
        repo=repo,
        git=RealGitGateway(repo_root=repo.root),
        storage=storage,
        pool_state=RealPoolStateGateway(pool_json_path=repo.pool_json_path),
        clipboard=RealClipboardGateway(),
        pr=RealPRGateway(),
        slots_root=slots_root,
    )


def load_slots_context(ctx: click.Context) -> SlotsCliContext | NoRepoSentinel:
    """Unpack the typed slots context from the given Click context.

    The root group callback constructs a :class:`SlotsCliContext` (or a
    :class:`NoRepoSentinel` when cwd is outside a git repo) and assigns it to
    ``ctx.obj``. Tests bypass the callback by passing a pre-built context as
    ``obj=`` to ``CliRunner().invoke(...)``.
    """
    obj = ctx.obj
    if not isinstance(obj, SlotsCliContext | NoRepoSentinel):
        raise RuntimeError(
            "SlotsCliContext missing from click context; "
            "ensure the slot group callback ran or obj= was passed in tests."
        )
    return obj
