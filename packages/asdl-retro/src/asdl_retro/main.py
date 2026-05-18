"""Standalone CLI for the ``branch-retro`` command."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli
from asdl_retro.plugin import build_branch_retro_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``branch-retro`` CLI group."""
    return build_standalone_cli(build_branch_retro_plugin(), package_name="asdl-retro")


def main() -> None:
    """Entry point for the standalone ``branch-retro`` CLI."""
    invoke_standalone_cli(build_branch_retro_plugin(), package_name="asdl-retro")
