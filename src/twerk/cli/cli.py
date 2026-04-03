from __future__ import annotations

import click

from twerk.cli.plugins import InstalledPluginEntryPointSource, discover_plugins

CONTEXT_SETTINGS = {"help_option_names": ["-h", "--help"]}


@click.group(context_settings=CONTEXT_SETTINGS)
@click.version_option(package_name="twerk")
@click.pass_context
def cli(ctx: click.Context) -> None:
    """twerk CLI."""
    pass


def main() -> None:
    discover_plugins(cli, source=InstalledPluginEntryPointSource())
    cli()
