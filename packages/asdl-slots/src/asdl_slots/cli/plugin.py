from __future__ import annotations

from asdl_core.plugin import AsdlPluginSpec
from asdl_slots.cli.slot.context import build_slots_context
from asdl_slots.cli.slot.group import build_slot_group


def build_slot_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_slot_group,
        context_factory=build_slots_context,
    )
