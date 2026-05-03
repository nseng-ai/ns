"""Standalone CLI for the ``objective`` command."""

from __future__ import annotations

import click

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_objectives.context import build_objective_context
from asdl_objectives.group import build_objective_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``objective`` CLI group."""
    group = build_objective_group()
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="asdl-objectives")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``objective`` CLI."""
    build_cli()(obj=build_clinkr_context_object(build_objective_context))
