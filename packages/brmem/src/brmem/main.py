"""Standalone CLI for the ``brmem`` command."""

from __future__ import annotations

import click

from asdl_core.cli_runtime import add_runtime_option
from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from brmem.context import build_brmem_context
from brmem.group import build_brmem_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``brmem`` CLI group."""
    group = build_brmem_group()
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="asdl-core")(group)
    add_runtime_option(group, runtime="python", entry_point="brmem.main:main")
    return group


def main() -> None:
    """Entry point for the standalone ``brmem`` CLI."""
    build_cli()(obj=build_clinkr_context_object(build_brmem_context))
