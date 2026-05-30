from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli
from roaster.cli.plugin import build_reviewer_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``reviewer`` CLI group."""
    return build_standalone_cli(build_reviewer_plugin(), package_name="roaster")


def main() -> None:
    """Entry point for the standalone ``reviewer`` CLI."""
    invoke_standalone_cli(build_reviewer_plugin(), package_name="roaster")
