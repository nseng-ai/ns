"""Build and load the typed reviewer CLI context."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.gateways.harness_detection.real import RealHarnessDetectionGateway
from twerk_reviewer.gateways.local_diff.real import RealLocalDiffGateway
from twerk_reviewer.gateways.review_definition.real import RealReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.real import RealReviewExecutionGateway


def is_json_mode(ctx: click.Context | None) -> bool:
    """Return True when the current click context runs under the ``json`` subgroup."""
    current = ctx
    while current is not None:
        if current.info_name == "json":
            return True
        current = current.parent
    return False


def _stderr_progress(msg: str) -> None:
    ctx = click.get_current_context(silent=True)
    if is_json_mode(ctx):
        return
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
    """Unpack the typed reviewer context from the given Click context."""
    obj = ctx.obj
    if not isinstance(obj, ReviewerCliContext):
        raise RuntimeError(
            "ReviewerCliContext missing from click context; "
            "ensure the reviewer group callback ran or obj= was passed in tests."
        )
    return obj
