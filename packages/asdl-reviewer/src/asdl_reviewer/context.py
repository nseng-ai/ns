"""Typed Click context for the reviewer CLI."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.gh.issue_gateway import IssueGateway
from asdl_reviewer.gateways.local_diff.gateway import LocalDiffGateway
from asdl_reviewer.gateways.review_catalog.gateway import ReviewCatalogGateway
from asdl_reviewer.harness.invocation import HarnessRuntime


@dataclass(frozen=True)
class ReviewerCliContext:
    """Bundle the gateways and runtimes required by the reviewer CLI."""

    catalog: ReviewCatalogGateway
    diff: LocalDiffGateway
    harness_runtime: HarnessRuntime
    issue_gateway: IssueGateway
    cwd: Path
