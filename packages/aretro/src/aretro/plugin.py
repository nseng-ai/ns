"""Plugin spec for the top-level ``asdl aretro`` subcommand."""

from __future__ import annotations

from aretro.context import build_aretro_context
from aretro.group import build_aretro_group
from asdl_core.plugin import AsdlPluginSpec


def build_aretro_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_aretro_group,
        context_factory=build_aretro_context,
    )
