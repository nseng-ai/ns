from __future__ import annotations

from twerk_core.plugin import TwerkPluginSpec
from twerk_slots.cli.slot.context import build_slots_context
from twerk_slots.cli.slot.group import build_slot_group


def build_slot_plugin() -> TwerkPluginSpec:
    return TwerkPluginSpec(
        build_group=build_slot_group,
        context_factory=build_slots_context,
    )
