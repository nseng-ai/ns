"""Standalone CLI for the ``memjective`` command."""

from __future__ import annotations

import click

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.memjective.context import build_memjective_context
from twerk_core.memjective.group import build_memjective_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``memjective`` CLI group."""
    group = build_memjective_group()
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-core")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``memjective`` CLI."""
    build_cli()(obj=build_clinkr_context_object(build_memjective_context))
