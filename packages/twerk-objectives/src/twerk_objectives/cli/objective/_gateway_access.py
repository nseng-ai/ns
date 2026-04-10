from __future__ import annotations

import click

from twerk_core.gh.gh_cli_issue_gateway import GhCliIssueGateway
from twerk_core.gh.issue_gateway import GhIssueGateway


def get_gh_issue_gateway() -> GhIssueGateway:
    """Retrieve the GhIssueGateway from the current Click context.

    Falls back to a real-CLI-backed gateway when none is injected, so the
    command works out of the box in any git repo.
    """
    ctx = click.get_current_context()
    gateway = ctx.obj.get("gh_issue_gateway") if ctx.obj else None
    if gateway is None:
        return GhCliIssueGateway()
    return gateway
