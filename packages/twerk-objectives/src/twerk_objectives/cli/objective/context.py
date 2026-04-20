"""Build and load the typed objectives CLI context."""

from __future__ import annotations

from dataclasses import dataclass

import click

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.real_issue_gateway import RealIssueGateway


@dataclass(frozen=True)
class ObjectivesCliContext:
    """Typed context for the ``objective`` CLI."""

    gh_issue_gateway: IssueGateway


def build_objectives_context() -> ObjectivesCliContext:
    """Assemble an :class:`ObjectivesCliContext` from real gateways."""
    return ObjectivesCliContext(gh_issue_gateway=RealIssueGateway())


def load_objectives_context(ctx: click.Context) -> ObjectivesCliContext:
    """Unpack the typed objectives context from the given Click context.

    ``ctx.obj`` must be a zero-argument callable returning an
    :class:`ObjectivesCliContext`. The CLI entry point
    (:func:`twerk_objectives.cli.main.main`) installs :func:`build_objectives_context`;
    tests install a ``lambda: ctx`` that returns a pre-built fake context.
    """
    ctx_fn = ctx.obj
    if not callable(ctx_fn):
        raise RuntimeError(
            "ctx.obj must be a Callable[[], ObjectivesCliContext]; "
            "the CLI entry point and tests are responsible for installing it."
        )
    result = ctx_fn()
    if not isinstance(result, ObjectivesCliContext):
        raise RuntimeError(
            f"ctx_fn returned {type(result).__name__}, expected ObjectivesCliContext."
        )
    return result
