"""Gateway retrieval from Click context."""

import click

from twerk_core.gh.issue_gateway import GHIssueGateway


def get_gh_issue_gateway() -> GHIssueGateway:
    """Retrieve GHIssueGateway from the current Click context.

    The gateway must be set in ctx.obj["gh_issue_gateway"] by the caller
    (twerk CLI or test harness). Missing-gateway is an internal setup bug,
    not a user-facing condition.
    """
    ctx = click.get_current_context()
    gateway = (ctx.obj or {}).get("gh_issue_gateway")
    assert gateway is not None, (
        "gh_issue_gateway not in Click context — this is a bug in the "
        "pr-address CLI plumbing, not a user error"
    )
    return gateway
