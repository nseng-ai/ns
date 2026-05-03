from __future__ import annotations

import click

from asdl_tools.cli.plugins import (
    InstalledPluginEntryPointSource,
    PluginEntryPointSource,
    discover_plugins,
)


def build_cli(
    *,
    source: PluginEntryPointSource,
) -> click.Group:
    @click.group(context_settings={"help_option_names": ["-h", "--help"]})
    @click.version_option(package_name="asdl-tools")
    @click.pass_context
    def cli(ctx: click.Context) -> None:
        """asdl CLI."""
        del ctx

    discover_plugins(cli, source=source)
    return cli


def build_prod_cli() -> click.Group:
    return build_cli(source=InstalledPluginEntryPointSource())


def main() -> None:
    build_prod_cli()()
