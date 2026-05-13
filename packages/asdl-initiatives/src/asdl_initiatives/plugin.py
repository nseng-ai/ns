"""Plugin spec for the top-level ``asdl initiative`` subcommand."""

from __future__ import annotations

from asdl_core.plugin import AsdlPluginSpec
from asdl_initiatives.group import build_initiative_group


def build_initiative_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_initiative_group,
        context_factory=None,
    )
