from __future__ import annotations

import click

from clinkr.group import ClinkrGroup, discover_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``objective`` CLI group."""
    group = discover_group("twerk_objectives.cli.objective")
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-objectives")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``objective`` CLI."""
    build_cli()()
