"""Build and load the typed reviewer CLI context."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.gateways.local_diff.real import RealLocalDiffGateway
from twerk_reviewer.gateways.review_definition.real import RealReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.real import RealReviewExecutionGateway


def build_reviewer_context() -> ReviewerCliContext:
    """Assemble a :class:`ReviewerCliContext` from real gateways and the cwd."""
    return ReviewerCliContext(
        review_definition=RealReviewDefinitionGateway(),
        local_diff=RealLocalDiffGateway(cwd=Path.cwd()),
        review_execution=RealReviewExecutionGateway(),
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
