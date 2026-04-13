from __future__ import annotations

import click

from twerk_core.clinkr.group import ClinkrGroup, discover_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``oneshot`` CLI group."""
    group = discover_group("twerk_oneshot.cli.oneshot")
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-oneshot")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``oneshot`` CLI."""
    build_cli()()
