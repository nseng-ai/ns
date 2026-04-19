from __future__ import annotations

import click

from twerk_core.clinkr.group import ClinkrGroup
from twerk_pr_address.cli.pr_address.group import build_pr_address_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``pr-address`` CLI group."""
    group = build_pr_address_group()
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-pr-address")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``pr-address`` CLI."""
    build_cli()()
