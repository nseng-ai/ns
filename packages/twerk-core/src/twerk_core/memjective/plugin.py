"""Plugin spec for the top-level ``twerk memjective`` subcommand."""

from __future__ import annotations

from twerk_core.memjective.context import build_memjective_context
from twerk_core.memjective.group import build_memjective_group
from twerk_core.plugin import TwerkPluginSpec


def build_memjective_plugin() -> TwerkPluginSpec:
    return TwerkPluginSpec(
        build_group=build_memjective_group,
        context_factory=build_memjective_context,
    )
