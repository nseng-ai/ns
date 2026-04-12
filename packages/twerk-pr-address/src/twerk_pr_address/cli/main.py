from __future__ import annotations

import click

from twerk_core.clinkr.group import ClinkrGroup, discover_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``pr-address`` CLI group."""
    group = discover_group("twerk_pr_address.cli.pr_address")
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-pr-address")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``pr-address`` CLI."""
    build_cli()()
