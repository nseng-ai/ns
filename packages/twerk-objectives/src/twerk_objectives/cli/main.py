from __future__ import annotations

import click

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_objectives.cli.objective.context import build_objectives_context
from twerk_objectives.cli.objective.group import build_objective_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``objective`` CLI group."""
    group = build_objective_group()
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-objectives")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``objective`` CLI."""
    build_cli()(obj=build_clinkr_context_object(build_objectives_context))
