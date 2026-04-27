"""Plugin spec for the top-level ``twerk objective`` subcommand."""

from __future__ import annotations

from twerk_core.plugin import TwerkPluginSpec
from twerk_objectives.context import build_objective_context
from twerk_objectives.group import build_objective_group


def build_objective_plugin() -> TwerkPluginSpec:
    return TwerkPluginSpec(
        build_group=build_objective_group,
        context_factory=build_objective_context,
    )
