"""Gateway retrieval from Click context."""

import click

from twerk_pr_address.gateway.abc import PRAddressGitHub


def get_pr_address_gateway() -> PRAddressGitHub:
    """Retrieve PRAddressGitHub from the current Click context.

    The gateway must be set in ctx.obj["pr_address_gateway"] by the caller
    (twerk CLI or test harness). Missing-gateway is an internal setup bug,
    not a user-facing condition.
    """
    ctx = click.get_current_context()
    gateway = (ctx.obj or {}).get("pr_address_gateway")
    assert gateway is not None, (
        "pr_address_gateway not in Click context — this is a bug in the "
        "pr-address CLI plumbing, not a user error"
    )
    return gateway
