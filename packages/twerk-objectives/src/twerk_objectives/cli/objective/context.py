"""Build and load the typed objectives CLI context."""

from __future__ import annotations

from dataclasses import dataclass

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.real_issue_gateway import RealIssueGateway


@dataclass(frozen=True)
class ObjectivesCliContext:
    """Typed context for the ``objective`` CLI."""

    gh_issue_gateway: IssueGateway


def build_objectives_context() -> ObjectivesCliContext:
    """Assemble an :class:`ObjectivesCliContext` from real gateways."""
    return ObjectivesCliContext(gh_issue_gateway=RealIssueGateway())
