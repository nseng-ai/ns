from __future__ import annotations

import importlib
import logging
from abc import ABC, abstractmethod
from collections.abc import Callable
from importlib.metadata import entry_points
from typing import Protocol

import click

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.plugin import AsdlPluginSpec

logger = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "asdl.plugins"


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


def _load_plugin_spec(value: str) -> AsdlPluginSpec[click.Group]:
    if ":" not in value:
        raise ValueError(
            f"Plugin entry point {value!r} must be in 'module:function' form; "
            "bare module paths are no longer supported."
        )
    module_path, attr = value.split(":", 1)
    module = importlib.import_module(module_path)
    builder = getattr(module, attr)
    spec = builder()
    if not isinstance(spec, AsdlPluginSpec):
        raise TypeError(
            f"Plugin entry point {value!r} must return a AsdlPluginSpec; got {type(spec).__name__}."
        )
    return spec


def discover_plugins(
    cli: click.Group,
    *,
    source: PluginEntryPointSource,
) -> None:
    """Find and register all installed asdl plugin CLI groups."""
    for ep in source.get_entry_points():
        try:
            spec = _load_plugin_spec(ep.value)
        except Exception:
            logger.warning("Failed to load plugin %r", ep.name, exc_info=True)
            continue
        group = spec.build_group()
        if spec.context_factory is not None:
            _install_plugin_context(group, context_factory=spec.context_factory)
        cli.add_command(group)


def _install_plugin_context(group: click.Group, *, context_factory: Callable[[], object]) -> None:
    original_callback = group.callback

    @click.pass_context
    def callback(ctx: click.Context, *args: object, **kwargs: object) -> object:
        root = ctx.find_root()
        if not isinstance(root.obj, ClinkrContextObject):
            root.obj = build_clinkr_context_object(context_factory)
        if original_callback is None:
            return None
        return ctx.invoke(original_callback, *args, **kwargs)

    group.callback = callback
