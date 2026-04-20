"""Gateway retrieval from Click context."""

import click

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.git.git_gateway import GitGateway
from twerk_pr_address.cli.pr_address.context import load_pr_address_context


def get_gh_issue_gateway(ctx: click.Context) -> IssueGateway:
    """Retrieve the IssueGateway from the given Click context."""
    return load_pr_address_context(ctx).gh_issue_gateway


def get_git_gateway(ctx: click.Context) -> GitGateway:
    """Retrieve the shared GitGateway from the given Click context."""
    return load_pr_address_context(ctx).git_gateway
