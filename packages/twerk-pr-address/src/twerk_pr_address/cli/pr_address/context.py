"""Build and load the typed pr-address CLI context."""

from __future__ import annotations

from dataclasses import dataclass

import click

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.real_issue_gateway import RealIssueGateway
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.real_git_gateway import RealGitGateway


@dataclass(frozen=True)
class PrAddressCliContext:
    """Typed context for the ``pr-address`` CLI."""

    gh_issue_gateway: IssueGateway
    git_gateway: GitGateway


def build_pr_address_context() -> PrAddressCliContext:
    """Assemble a :class:`PrAddressCliContext` from real gateways."""
    return PrAddressCliContext(
        gh_issue_gateway=RealIssueGateway(),
        git_gateway=RealGitGateway(),
    )


def load_pr_address_context(ctx: click.Context) -> PrAddressCliContext:
    """Unpack the typed pr-address context from the given Click context.

    ``ctx.obj`` must be a zero-argument callable returning a
    :class:`PrAddressCliContext`. The CLI entry point
    (:func:`twerk_pr_address.cli.main.main`) installs
    :func:`build_pr_address_context`; tests install a ``lambda: ctx`` that
    returns a pre-built fake context.
    """
    ctx_fn = ctx.obj
    if not callable(ctx_fn):
        raise RuntimeError(
            "ctx.obj must be a Callable[[], PrAddressCliContext]; "
            "the CLI entry point and tests are responsible for installing it."
        )
    result = ctx_fn()
    if not isinstance(result, PrAddressCliContext):
        raise RuntimeError(
            f"ctx_fn returned {type(result).__name__}, expected PrAddressCliContext."
        )
    return result
