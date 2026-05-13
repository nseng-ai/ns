"""Standalone CLI for the ``initiative`` command."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli
from asdl_initiatives.plugin import build_initiative_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``initiative`` CLI group."""
    return build_standalone_cli(build_initiative_plugin(), package_name="asdl-initiatives")


def main() -> None:
    """Entry point for the standalone ``initiative`` CLI."""
    invoke_standalone_cli(build_initiative_plugin(), package_name="asdl-initiatives")
