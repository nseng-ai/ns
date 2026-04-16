"""Standalone CLI for the ``workbranch`` command."""

from __future__ import annotations

import click

from twerk_core.clinkr.group import ClinkrGroup, discover_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``workbranch`` CLI group."""
    group = discover_group("twerk_core.workbranch")
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-core")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``workbranch`` CLI."""
    build_cli()()
