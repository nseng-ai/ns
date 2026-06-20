from __future__ import annotations

from typing import Any

import click

from asdl_core.cli_runtime import add_runtime_option
from asdl_tools.cli.plugins import (
    InstalledPluginEntryPointSource,
    PluginEntryPointSource,
    discover_plugins,
)


class AsdlRootGroup(click.Group):
    """Root group that loads plugin commands only when command resolution needs them."""

    def __init__(
        self,
        *args: Any,
        plugin_source: PluginEntryPointSource,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._plugin_source = plugin_source
        self._plugins_discovered = False

    def list_commands(self, ctx: click.Context) -> list[str]:
        self._discover_plugins()
        return super().list_commands(ctx)

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.Command | None:
        self._discover_plugins()
        return super().get_command(ctx, cmd_name)

    def _discover_plugins(self) -> None:
        if self._plugins_discovered:
            return
        self._plugins_discovered = True
        discover_plugins(self, source=self._plugin_source)


def build_cli(
    *,
    source: PluginEntryPointSource,
) -> click.Group:
    @click.group(
        cls=AsdlRootGroup,
        plugin_source=source,
        context_settings={"help_option_names": ["-h", "--help"]},
    )
    @click.version_option(package_name="asdl-tools")
    @click.pass_context
    def cli(ctx: click.Context) -> None:
        """asdl CLI."""
        del ctx

    add_runtime_option(cli, runtime="python", entry_point="asdl_tools.cli.cli:main")
    return cli


def build_prod_cli() -> click.Group:
    return build_cli(source=InstalledPluginEntryPointSource())


def main() -> None:
    build_prod_cli()()
