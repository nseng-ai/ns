"""Gateway retrieval from Click context."""

import click

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.real_issue_gateway import RealIssueGateway


def get_gh_issue_gateway() -> IssueGateway:
    """Retrieve the IssueGateway from the current Click context.

    Falls back to a real-CLI-backed gateway when none is injected, so the
    command works out of the box in any git repo.
    """
    ctx = click.get_current_context()
    gateway = ctx.obj.get("gh_issue_gateway") if ctx.obj else None
    if gateway is None:
        return RealIssueGateway()
    return gateway
