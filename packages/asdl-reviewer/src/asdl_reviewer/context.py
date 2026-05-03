"""Typed Click context for the reviewer CLI."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.gh.issue_gateway import IssueGateway
from asdl_reviewer.gateways.harness_detection.gateway import HarnessDetectionGateway
from asdl_reviewer.gateways.local_diff.gateway import LocalDiffGateway
from asdl_reviewer.gateways.review_definition.gateway import ReviewDefinitionGateway
from asdl_reviewer.gateways.review_execution.gateway import ReviewExecutionGateway


@dataclass(frozen=True)
class ReviewerCliContext:
    """Bundle the gateways required by the reviewer CLI."""

    review_definition: ReviewDefinitionGateway
    local_diff: LocalDiffGateway
    review_execution: ReviewExecutionGateway
    harness_detection: HarnessDetectionGateway
    issue_gateway: IssueGateway
    cwd: Path
