from __future__ import annotations

import click

from twerk_core.gh.gh_cli_issue_gateway import GhCliIssueGateway
from twerk_core.gh.issue_gateway import GhIssueGateway


def get_issue_gateway() -> GhIssueGateway:
    """Retrieve the GhIssueGateway from the current Click context.

    Falls back to a real-CLI-backed gateway when none is injected, so the
    command works out of the box in any git repo.
    """
    ctx = click.get_current_context()
    issue_gw = ctx.obj.get("issue_gateway") if ctx.obj else None
    if issue_gw is None:
        return GhCliIssueGateway()
    return issue_gw
