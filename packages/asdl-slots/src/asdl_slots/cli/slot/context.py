"""Build a :class:`SlotsCliContext` from the active working directory."""

from __future__ import annotations

from pathlib import Path

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.gh.construction import build_pr_gateway
from asdl_core.git.construction import GitUnavailable, build_git_context, build_git_gateway
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.real_clipboard import RealClipboardGateway
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
    git_context = build_git_context(cwd)
    if isinstance(git_context, GitUnavailable):
        return _no_repo_from_unavailable(git_context)
    if git_context.trunk_branch is None:
        return _no_trunk_sentinel()

    repo = discover_repo_or_sentinel(cwd, slots_root=slots_root, git=git_context.git)
    if isinstance(repo, NoRepoSentinel):
        return repo

    git = git_context.git
    if repo.root != git_context.repo_root:
        git = build_git_gateway(repo_root=repo.root, trunk_branch=git_context.trunk_branch)

    return SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        clipboard=RealClipboardGateway(),
        pr=build_pr_gateway(),
        slots_root=slots_root,
    )


def _no_repo_from_unavailable(git_context: GitUnavailable) -> NoRepoSentinel:
    if git_context.reason == "git_unavailable":
        return NoRepoSentinel(message="`git` binary not found on PATH; slots requires git.")
    return NoRepoSentinel(message=git_context.message)


def _no_trunk_sentinel() -> NoRepoSentinel:
    return NoRepoSentinel(
        message=(
            "Cannot resolve trunk branch (origin/HEAD, main, or master); "
            "slots requires a git repository with a resolvable trunk."
        )
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
