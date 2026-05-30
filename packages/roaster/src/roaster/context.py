"""Typed Click context for the reviewer CLI."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.gh.pr_gateway import PRGateway
from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.gateways.review_catalog.gateway import ReviewCatalogGateway
from roaster.harness.invocation import HarnessRuntime


@dataclass(frozen=True)
class ReviewerCliContext:
    """Bundle the gateways and runtimes required by the reviewer CLI."""

    catalog: ReviewCatalogGateway
    diff: LocalDiffGateway
    harness_runtime: HarnessRuntime
    pr_gateway: PRGateway
    cwd: Path
