from __future__ import annotations

import click

from twerk.cli.plugins import InstalledPluginEntryPointSource, discover_plugins


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(package_name="twerk")
@click.pass_context
def cli(ctx: click.Context) -> None:
    """twerk CLI."""
    pass


def main() -> None:
    discover_plugins(cli, source=InstalledPluginEntryPointSource())
    cli()
