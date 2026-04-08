"""Gateway retrieval from Click context."""

from __future__ import annotations

import click

from twerk_pr_address.gateway.abc import PRAddressGitHub


def get_pr_address_gateway() -> PRAddressGitHub:
    """Retrieve PRAddressGitHub from the current Click context.

    The gateway must be set in ctx.obj["pr_address_gateway"] by the caller
    (twerk CLI or test harness).
    """
    ctx = click.get_current_context()
    gateway = ctx.obj.get("pr_address_gateway") if ctx.obj else None
    if gateway is None:
        raise click.ClickException(
            "pr_address_gateway not found in Click context. "
            "Ensure the gateway is set in ctx.obj before invoking pr-address commands."
        )
    return gateway
