"""Standalone CLI for the ``aretro`` command."""

from __future__ import annotations

from aretro.context import build_aretro_context
from aretro.group import build_aretro_group
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import AsdlPluginSpec, build_standalone_cli, invoke_standalone_cli


def build_cli() -> ClinkrGroup:
    """Build the standalone ``aretro`` CLI group."""
    return build_standalone_cli(_build_aretro_spec(), package_name="aretro")


def main() -> None:
    """Entry point for the standalone ``aretro`` CLI."""
    invoke_standalone_cli(_build_aretro_spec(), package_name="aretro")


def _build_aretro_spec() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_aretro_group,
        context_factory=build_aretro_context,
    )
