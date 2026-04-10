from __future__ import annotations

import click

from twerk_objectives.gateway import ObjectivesGitHub


def get_objectives_gateway() -> ObjectivesGitHub:
    """Retrieve ObjectivesGitHub from the current Click context.

    Falls back to the real gh CLI gateway when none is injected,
    so the command works out of the box in any git repo.
    """
    ctx = click.get_current_context()
    gateway = ctx.obj.get("objectives_gateway") if ctx.obj else None
    if gateway is None:
        from twerk_objectives.gh_cli_gateway import GhCliObjectivesGitHub

        return GhCliObjectivesGitHub()
    return gateway
