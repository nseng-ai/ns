from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.plugin import build_standalone_cli, invoke_standalone_cli
from twerk_slots.cli.plugin import build_slot_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``slot`` CLI group."""
    return build_standalone_cli(build_slot_plugin(), package_name="twerk-slots")


def main() -> None:
    """Entry point for the standalone ``slot`` CLI."""
    invoke_standalone_cli(build_slot_plugin(), package_name="twerk-slots")
