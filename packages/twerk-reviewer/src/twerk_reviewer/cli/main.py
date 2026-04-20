from __future__ import annotations

import click

from twerk_core.clinkr.group import ClinkrGroup
from twerk_reviewer.cli.reviewer.context import build_reviewer_context
from twerk_reviewer.cli.reviewer.group import build_reviewer_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``reviewer`` CLI group."""
    group = build_reviewer_group()
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-reviewer")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``reviewer`` CLI."""
    build_cli()(obj=build_reviewer_context)
