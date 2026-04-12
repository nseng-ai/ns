from __future__ import annotations

import click

from clinkr.group import ClinkrGroup, discover_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``slot`` CLI group."""
    group = discover_group("twerk_slots.cli.slot")
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-slots")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``slot`` CLI."""
    build_cli()()
