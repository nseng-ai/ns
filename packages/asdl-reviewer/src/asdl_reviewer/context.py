"""Typed Click context for the reviewer CLI."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.gh.issue_gateway import IssueGateway
from asdl_reviewer.gateways.review_environment.gateway import ReviewEnvironmentGateway


@dataclass(frozen=True)
class ReviewerCliContext:
    """Bundle the gateways required by the reviewer CLI."""

    review_environment: ReviewEnvironmentGateway
    issue_gateway: IssueGateway
    cwd: Path
