"""Host-tool preconditions for commands that shell out to external CLIs.

Each Click command that depends on an external tool calls the matching
helper as its first statement. On failure the helper raises
`click.ClickException`, which Click renders as a clean one-line error.
"""

from __future__ import annotations

import click

from areg.gateways.environment.gateway import AregEnvironment, AregEnvironmentError, ToolName


def require_tool(environment: AregEnvironment, tool: ToolName) -> None:
    try:
        environment.require_tool(tool)
    except AregEnvironmentError as e:
        raise click.ClickException(str(e)) from e


def requires_gh(environment: AregEnvironment) -> None:
    require_tool(environment, "gh")


def requires_npx(environment: AregEnvironment) -> None:
    require_tool(environment, "npx")
