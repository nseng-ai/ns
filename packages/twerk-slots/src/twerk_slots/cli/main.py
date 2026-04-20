from __future__ import annotations

import click

from twerk_core.clinkr.group import ClinkrGroup
from twerk_slots.cli.slot.context import build_slots_context
from twerk_slots.cli.slot.group import build_slot_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``slot`` CLI group."""
    group = build_slot_group()
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-slots")(group)
    return group


def main() -> None:
    """Entry point for the standalone ``slot`` CLI."""
    build_cli()(obj=build_slots_context)
