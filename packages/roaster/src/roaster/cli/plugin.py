from __future__ import annotations

from asdl_core.plugin import AsdlPluginSpec
from roaster.cli.roaster.context import build_roaster_context
from roaster.cli.roaster.group import build_roaster_group


def build_roaster_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_roaster_group,
        context_factory=build_roaster_context,
    )
