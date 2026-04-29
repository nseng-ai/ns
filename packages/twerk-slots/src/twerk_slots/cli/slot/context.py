"""Build a :class:`SlotsCliContext` from the active working directory."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_core.clinkr.context import load_clinkr_context_object
from twerk_core.gh.pr_gateway import RealPRGateway
from twerk_slots.allocation import SlotAllocationError
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.pool_state_gateway import RealPoolStateGateway
from twerk_slots.gateway.real_clipboard import RealClipboardGateway
from twerk_slots.gateway.real_git import build_real_slots_git_gateway
from twerk_slots.gateway.real_storage import RealSlotsStorageGateway
from twerk_slots.repo_context import SLOTS_ROOT, NoGitRepo, discover_repo


def build_slots_context() -> SlotsCliContext | NoGitRepo:
    """Assemble a :class:`SlotsCliContext` from real gateways and the cwd.

    Returns a :class:`NoGitRepo` when ``cwd`` is outside a git repo or
    when the repo has no resolvable trunk branch, so callers can surface a
    ``ClinkrFailure`` without another branch.
    """
    cwd = Path.cwd()
    slots_root = SLOTS_ROOT
    storage = RealSlotsStorageGateway()
    try:
        discovery_git = build_real_slots_git_gateway(repo_root=cwd)
    except SlotAllocationError as exc:
        return NoGitRepo(message=str(exc))
    repo = discover_repo(cwd, slots_root=slots_root, git=discovery_git)
    if isinstance(repo, NoGitRepo):
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


def load_slots_context(ctx: click.Context) -> SlotsCliContext | NoGitRepo:
    """Unpack the typed slots context from the given Click context.

    ``ctx.obj`` must be a :class:`twerk_core.clinkr.context.ClinkrContextObject`
    whose ``context_factory`` returns a :class:`SlotsCliContext` or a
    :class:`NoGitRepo`. The CLI entry point installs
    ``build_clinkr_context_object(build_slots_context)``; tests do the same
    around pre-built fake contexts.

    Help paths (``slot -h``, ``slot <cmd> -h``, ``slot <cmd> --schema``)
    never reach this function, so the factory is not invoked for them.
    """
    result = load_clinkr_context_object(ctx).context_factory()
    if not isinstance(result, SlotsCliContext | NoGitRepo):
        raise RuntimeError(
            "context_factory returned "
            f"{type(result).__name__}, expected SlotsCliContext or NoGitRepo."
        )
    return result
