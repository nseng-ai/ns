"""Build and load the typed reviewer CLI context."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.gateways.harness_detection.real import RealHarnessDetectionGateway
from twerk_reviewer.gateways.local_diff.real import RealLocalDiffGateway
from twerk_reviewer.gateways.review_definition.real import RealReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.real import RealReviewExecutionGateway


def _stderr_progress(msg: str) -> None:
    click.echo(f"  · {msg}", err=True)


def build_reviewer_context() -> ReviewerCliContext:
    """Assemble a :class:`ReviewerCliContext` from real gateways and the cwd."""
    cwd = Path.cwd()
    return ReviewerCliContext(
        review_definition=RealReviewDefinitionGateway(),
        local_diff=RealLocalDiffGateway(cwd=cwd),
        review_execution=RealReviewExecutionGateway(progress_writer=_stderr_progress),
        harness_detection=RealHarnessDetectionGateway(),
        cwd=cwd,
    )


def load_reviewer_context(ctx: click.Context) -> ReviewerCliContext:
    """Unpack the typed reviewer context from the given Click context.

    ``ctx.obj`` must be a zero-argument callable returning a
    :class:`ReviewerCliContext`. The CLI entry point
    (:func:`twerk_reviewer.cli.main.main`) installs :func:`build_reviewer_context`;
    tests install a ``lambda: ctx`` that returns a pre-built fake context.

    Help paths (``reviewer -h``, ``reviewer <cmd> -h``) never reach this
    function, so the factory is not invoked for them.
    """
    ctx_fn = ctx.obj
    if not callable(ctx_fn):
        raise RuntimeError(
            "ctx.obj must be a Callable[[], ReviewerCliContext]; "
            "the CLI entry point and tests are responsible for installing it."
        )
    result = ctx_fn()
    if not isinstance(result, ReviewerCliContext):
        raise RuntimeError(f"ctx_fn returned {type(result).__name__}, expected ReviewerCliContext.")
    return result
