"""Build the typed reviewer CLI context."""

from __future__ import annotations

from pathlib import Path

import click

from asdl_core.gh.real_issue_gateway import RealIssueGateway
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.gateways.local_diff.real import RealLocalDiffGateway
from asdl_reviewer.gateways.review_catalog.real import RealReviewCatalogGateway
from asdl_reviewer.harness.invocation import HarnessRuntime


def _stderr_progress(msg: str) -> None:
    click.echo(f"  · {msg}", err=True)


def build_reviewer_context() -> ReviewerCliContext:
    """Assemble a :class:`ReviewerCliContext` from real gateways and the cwd."""
    cwd = Path.cwd()
    return ReviewerCliContext(
        catalog=RealReviewCatalogGateway(cwd=cwd),
        diff=RealLocalDiffGateway(cwd=cwd),
        harness_runtime=HarnessRuntime(progress_writer=_stderr_progress),
        issue_gateway=RealIssueGateway(),
        cwd=cwd,
    )
