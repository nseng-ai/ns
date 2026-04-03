from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from importlib.metadata import entry_points
from typing import Protocol

import click

from clinkr import discover_group

logger = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "twerk.plugins"


class PluginEntryPoint(Protocol):
    name: str
    value: str


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
            group = discover_group(ep.value)
        except Exception:
            logger.warning("Failed to load plugin %r", ep.name, exc_info=True)
            continue
        cli.add_command(group)
