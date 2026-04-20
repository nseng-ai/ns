from __future__ import annotations

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.gh.issue_gateway import IssueGateway
from twerk_objectives.cli.objective.context import ObjectivesCliContext


def get_gh_issue_gateway(ctx: click.Context) -> IssueGateway:
    """Retrieve the IssueGateway from the given Click context."""
    return load_typed_context(ctx, ObjectivesCliContext).gh_issue_gateway
