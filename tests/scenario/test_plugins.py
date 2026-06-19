from __future__ import annotations

import click

from asdl_tools.cli.plugins import PluginEntryPointSource, discover_plugins


class FakePluginEntryPoint:
    def __init__(self, *, name: str, value: str) -> None:
        self.name = name
        self.value = value


class FakePluginEntryPointSource(PluginEntryPointSource):
    def __init__(self, *, entry_points: tuple[FakePluginEntryPoint, ...]) -> None:
        self._entry_points = entry_points

    def get_entry_points(self) -> tuple[FakePluginEntryPoint, ...]:
        return self._entry_points


def _entry_point_source(*entry_points: FakePluginEntryPoint) -> FakePluginEntryPointSource:
    return FakePluginEntryPointSource(entry_points=entry_points)


def test_discover_plugins_skips_plugin_that_fails_to_load() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(name="crasher", value="nonexistent.module.path")

    discover_plugins(parent, source=_entry_point_source(ep))

    assert len(parent.commands) == 0


def test_discover_plugins_no_plugins() -> None:
    parent = click.Group("test")

    discover_plugins(parent, source=_entry_point_source())

    assert len(parent.commands) == 0


def test_discover_plugins_skips_entry_point_that_returns_group_not_plugin_spec() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(
        name="click_group",
        value="click:Group",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    assert len(parent.commands) == 0
