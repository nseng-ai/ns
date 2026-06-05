"""Build the typed roaster CLI context."""

from __future__ import annotations

from pathlib import Path

import click

from asdl_core.gh.pr_gateway import RealPRGateway
from brmem.real import RealBranchMemoryGateway
from roaster.context import RoasterCliContext
from roaster.gateways.agent_runner.real import RealAgentRunnerGateway
from roaster.gateways.graphite_stack.real import RealGraphiteStackGateway
from roaster.gateways.local_diff.real import RealLocalDiffGateway
from roaster.gateways.review_catalog.real import RealReviewCatalogGateway
from roaster.harness.invocation import HarnessRuntime


def _stderr_progress(msg: str) -> None:
    click.echo(f"  · {msg}", err=True)


def build_roaster_context() -> RoasterCliContext:
    """Assemble a :class:`RoasterCliContext` from real gateways and the cwd."""
    cwd = Path.cwd()
    return RoasterCliContext(
        catalog=RealReviewCatalogGateway(cwd=cwd),
        diff=RealLocalDiffGateway(cwd=cwd),
        harness_runtime=HarnessRuntime(progress_writer=_stderr_progress),
        pr_gateway=RealPRGateway(),
        cwd=cwd,
        branch_memory=RealBranchMemoryGateway(cwd=cwd),
        agent_runner=RealAgentRunnerGateway(),
        graphite_stack=RealGraphiteStackGateway(),
    )
