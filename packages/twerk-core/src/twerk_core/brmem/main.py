"""Standalone CLI for the ``brmem`` command."""

from __future__ import annotations

import click

from twerk_core.brmem.context import build_brmem_context
from twerk_core.brmem.group import build_brmem_group
from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup


def build_cli() -> ClinkrGroup:
    """Build the standalone ``brmem`` CLI group."""
    group = build_brmem_group()
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-core")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``brmem`` CLI."""
    build_cli()(obj=build_clinkr_context_object(build_brmem_context))
