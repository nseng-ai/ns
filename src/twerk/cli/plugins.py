from __future__ import annotations

import logging
from importlib.metadata import entry_points

import click

logger = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "twerk.plugins"


def discover_plugins(cli: click.Group) -> None:
    """Find and register all installed twerk plugin CLI groups."""
    for ep in entry_points(group=ENTRY_POINT_GROUP):
        try:
            module = ep.load()
        except Exception:
            logger.warning("Failed to load plugin %r", ep.name, exc_info=True)
            continue

        group = getattr(module, "cli_group", None)
        if group is None:
            logger.warning("Plugin %r has no 'cli_group' attribute — skipping", ep.name)
            continue

        if not isinstance(group, click.Command):
            logger.warning(
                "Plugin %r cli_group is not a Click command (%s) — skipping",
                ep.name,
                type(group).__name__,
            )
            continue

        cli.add_command(group)
