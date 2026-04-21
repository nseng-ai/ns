from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.plugin import build_standalone_cli, invoke_standalone_cli
from twerk_objectives.cli.plugin import build_objective_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``objective`` CLI group."""
    return build_standalone_cli(build_objective_plugin(), package_name="twerk-objectives")


def main() -> None:
    """Entry point for the standalone ``objective`` CLI."""
    invoke_standalone_cli(build_objective_plugin(), package_name="twerk-objectives")
