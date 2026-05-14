"""Standalone CLI for the ``objective`` command."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli
from asdl_objectives.plugin import build_objective_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``objective`` CLI group."""
    return build_standalone_cli(build_objective_plugin(), package_name="asdl-objectives")


def main() -> None:
    """Entry point for the standalone ``objective`` CLI."""
    invoke_standalone_cli(build_objective_plugin(), package_name="asdl-objectives")
