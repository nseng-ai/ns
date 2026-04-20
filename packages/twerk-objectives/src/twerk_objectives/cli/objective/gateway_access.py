from __future__ import annotations

import click

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_objectives.cli.objective.context import load_objectives_context


def get_gh_issue_gateway(ctx: click.Context) -> IssueGateway:
    """Retrieve the IssueGateway from the given Click context."""
    return load_objectives_context(ctx).gh_issue_gateway
