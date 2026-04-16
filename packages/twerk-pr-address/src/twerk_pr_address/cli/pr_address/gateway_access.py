"""Gateway retrieval from Click context."""

import click

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.real_issue_gateway import RealIssueGateway
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.real_git_gateway import RealGitGateway


def get_gh_issue_gateway(ctx: click.Context) -> IssueGateway:
    """Retrieve the IssueGateway from the given Click context.

    Falls back to a real-CLI-backed gateway when none is injected, so the
    command works out of the box in any git repo.
    """
    gateway = ctx.obj.get("gh_issue_gateway") if ctx.obj else None
    if gateway is None:
        return RealIssueGateway()
    return gateway


def get_git_gateway(ctx: click.Context) -> GitGateway:
    """Retrieve the shared GitGateway from the given Click context."""

    gateway = ctx.obj.get("git_gateway") if ctx.obj else None
    if gateway is None:
        return RealGitGateway()
    return gateway
