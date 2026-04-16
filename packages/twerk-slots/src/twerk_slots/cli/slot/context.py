"""Build a :class:`SlotsCliContext` from the active working directory."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_core.gh.pr_gateway import RealPRGateway
from twerk_slots.allocation import SlotAllocationError
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.pool_state_gateway import RealPoolStateGateway
from twerk_slots.gateway.real_clipboard import RealClipboardGateway
from twerk_slots.gateway.real_git import build_real_slots_git_gateway
from twerk_slots.gateway.real_storage import RealSlotsStorageGateway
from twerk_slots.repo_context import SLOTS_ROOT, NoRepoSentinel, discover_repo_or_sentinel


def build_slots_context() -> SlotsCliContext | NoRepoSentinel:
    """Assemble a :class:`SlotsCliContext` from real gateways and the cwd.

    Returns a :class:`NoRepoSentinel` when ``cwd`` is outside a git repo or
    when the repo has no resolvable trunk branch, so callers can surface a
    ClinkrCommandError without another branch.
    """
    cwd = Path.cwd()
    slots_root = SLOTS_ROOT
    storage = RealSlotsStorageGateway()
    try:
        discovery_git = build_real_slots_git_gateway(repo_root=cwd)
    except SlotAllocationError as exc:
        return NoRepoSentinel(message=str(exc))
    repo = discover_repo_or_sentinel(cwd, slots_root=slots_root, git=discovery_git)
    if isinstance(repo, NoRepoSentinel):
        return repo
    return SlotsCliContext(
        repo=repo,
        git=build_real_slots_git_gateway(repo_root=repo.root),
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
