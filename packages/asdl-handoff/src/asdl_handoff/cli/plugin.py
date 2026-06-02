from __future__ import annotations

from asdl_core.plugin import AsdlPluginSpec
from asdl_handoff.cli.handoff.context import build_handoff_context
from asdl_handoff.cli.handoff.group import build_handoff_group


def build_handoff_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_handoff_group,
        context_factory=build_handoff_context,
    )
