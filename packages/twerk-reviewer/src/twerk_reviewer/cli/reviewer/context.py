"""Build the typed reviewer CLI context."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_core.gh.real_check_runs_gateway import RealCheckRunsGateway
from twerk_core.gh.real_issue_gateway import RealIssueGateway
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
        issue_gateway=RealIssueGateway(),
        check_runs=RealCheckRunsGateway(),
        cwd=cwd,
    )
