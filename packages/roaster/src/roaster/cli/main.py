from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli
from roaster.cli.plugin import build_roaster_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``roaster`` CLI group."""
    return build_standalone_cli(build_roaster_plugin(), package_name="roaster", entry_point="roaster.cli.main:main")


def main() -> None:
    """Entry point for the standalone ``roaster`` CLI."""
    invoke_standalone_cli(build_roaster_plugin(), package_name="roaster", entry_point="roaster.cli.main:main")
