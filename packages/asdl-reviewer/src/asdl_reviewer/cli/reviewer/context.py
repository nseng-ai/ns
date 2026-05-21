"""Build the typed reviewer CLI context."""

from __future__ import annotations

from pathlib import Path

import click

from asdl_core.gh.real_issue_gateway import RealIssueGateway
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.gateways.review_environment.real import RealReviewEnvironmentGateway


def _stderr_progress(msg: str) -> None:
    click.echo(f"  · {msg}", err=True)


def build_reviewer_context() -> ReviewerCliContext:
    """Assemble a :class:`ReviewerCliContext` from real gateways and the cwd."""
    cwd = Path.cwd()
    return ReviewerCliContext(
        review_environment=RealReviewEnvironmentGateway(
            cwd=cwd,
            progress_writer=_stderr_progress,
        ),
        issue_gateway=RealIssueGateway(),
        cwd=cwd,
    )
