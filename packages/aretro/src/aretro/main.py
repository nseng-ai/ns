"""Standalone CLI for the ``aretro`` command."""

from __future__ import annotations

from aretro.plugin import build_aretro_plugin
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli


def build_cli() -> ClinkrGroup:
    """Build the standalone ``aretro`` CLI group."""
    return build_standalone_cli(build_aretro_plugin(), package_name="aretro")


def main() -> None:
    """Entry point for the standalone ``aretro`` CLI."""
    invoke_standalone_cli(build_aretro_plugin(), package_name="aretro")
