"""Typed Click context for the reviewer CLI."""

from __future__ import annotations

from dataclasses import dataclass

from twerk_reviewer.gateways.local_diff.gateway import LocalDiffGateway
from twerk_reviewer.gateways.review_definition.gateway import ReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.gateway import ReviewExecutionGateway


@dataclass(frozen=True)
class ReviewerCliContext:
    """Bundle the gateways required by the reviewer CLI."""

    review_definition: ReviewDefinitionGateway
    local_diff: LocalDiffGateway
    review_execution: ReviewExecutionGateway
