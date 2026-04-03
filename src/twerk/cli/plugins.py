from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from importlib.metadata import entry_points
from typing import Protocol

import click

logger = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "twerk.plugins"


class PluginEntryPoint(Protocol):
    name: str

    def load(self) -> object:
        """Load the plugin module for this entry point."""


class PluginEntryPointSource(ABC):
    @abstractmethod
    def get_entry_points(self) -> tuple[PluginEntryPoint, ...]:
        """Return the plugin entry points available to the CLI."""


class InstalledPluginEntryPointSource(PluginEntryPointSource):
    def get_entry_points(self) -> tuple[PluginEntryPoint, ...]:
        return tuple(entry_points(group=ENTRY_POINT_GROUP))


def discover_plugins(cli: click.Group, *, source: PluginEntryPointSource) -> None:
    """Find and register all installed twerk plugin CLI groups."""
    for ep in source.get_entry_points():
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
