"""Typed Click context for the roaster CLI."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.gh.pr_gateway import PRGateway
from brmem.gateway import BranchMemoryGateway
from roaster.gateways.agent_runner.gateway import AgentRunnerGateway
from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.gateways.review_catalog.gateway import ReviewCatalogGateway
from roaster.harness.invocation import HarnessRuntime


@dataclass(frozen=True)
class RoasterCliContext:
    """Bundle the gateways and runtimes required by the roaster CLI."""

    catalog: ReviewCatalogGateway
    diff: LocalDiffGateway
    harness_runtime: HarnessRuntime
    pr_gateway: PRGateway
    cwd: Path
    branch_memory: BranchMemoryGateway | None = None
    agent_runner: AgentRunnerGateway | None = None
