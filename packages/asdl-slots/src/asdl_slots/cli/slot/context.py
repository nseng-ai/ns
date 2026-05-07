"""Build a :class:`SlotsCliContext` from the active working directory."""

from __future__ import annotations

from pathlib import Path

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.gh.pr_gateway import RealPRGateway
from asdl_slots.context import SlotsCliContext
from asdl_slots.errors import SlotAllocationError
from asdl_slots.gateway.real_clipboard import RealClipboardGateway
from asdl_slots.gateway.real_git import build_real_slots_git_gateway
from asdl_slots.gateway.real_storage import RealSlotsStorageGateway
from asdl_slots.repo_context import SLOTS_ROOT, NoRepoSentinel, discover_repo_or_sentinel


def build_slots_context() -> SlotsCliContext | NoRepoSentinel:
    """Assemble a :class:`SlotsCliContext` from real gateways and the cwd.

    Returns a :class:`NoRepoSentinel` when ``cwd`` is outside a git repo or
    when the repo has no resolvable trunk branch, so callers can surface a
    ``ClinkrFailure`` without another branch.
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
        clipboard=RealClipboardGateway(),
        pr=RealPRGateway(),
        slots_root=slots_root,
    )


def load_slots_context(ctx: click.Context) -> SlotsCliContext | NoRepoSentinel:
    """Unpack the typed slots context from the given Click context.

    ``ctx.obj`` must be a :class:`asdl_core.clinkr.context.ClinkrContextObject`
    whose ``context_factory`` returns a :class:`SlotsCliContext` or a
    :class:`NoRepoSentinel`. The CLI entry point installs
    ``build_clinkr_context_object(build_slots_context)``; tests do the same
    around pre-built fake contexts.

    Help paths (``slot -h``, ``slot <cmd> -h``, ``slot <cmd> --json-schema``)
    never reach this function, so the factory is not invoked for them.
    """
    result = load_clinkr_context_object(ctx).context_factory()
    if not isinstance(result, SlotsCliContext | NoRepoSentinel):
        raise RuntimeError(
            "context_factory returned "
            f"{type(result).__name__}, expected SlotsCliContext or NoRepoSentinel."
        )
    return result
