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

    ``ctx.obj`` must be a zero-argument callable returning a
    :class:`SlotsCliContext` or a :class:`NoRepoSentinel`. The CLI entry point
    (:func:`twerk_slots.cli.main.main`) installs :func:`build_slots_context`;
    tests install a ``lambda: ctx`` that returns a pre-built fake context.

    Help paths (``slot -h``, ``slot <cmd> -h``, ``slot json <cmd> --schema``)
    never reach this function, so the factory is not invoked for them.
    """
    ctx_fn = ctx.obj
    if not callable(ctx_fn):
        raise RuntimeError(
            "ctx.obj must be a Callable[[], SlotsCliContext | NoRepoSentinel]; "
            "the CLI entry point and tests are responsible for installing it."
        )
    result = ctx_fn()
    if not isinstance(result, SlotsCliContext | NoRepoSentinel):
        raise RuntimeError(
            f"ctx_fn returned {type(result).__name__}, expected SlotsCliContext or NoRepoSentinel."
        )
    return result
