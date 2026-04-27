"""Plugin spec for the top-level ``twerk objective`` subcommand."""

from __future__ import annotations

from twerk_core.objective.context import build_objective_context
from twerk_core.objective.group import build_objective_group
from twerk_core.plugin import TwerkPluginSpec


def build_objective_plugin() -> TwerkPluginSpec:
    return TwerkPluginSpec(
        build_group=build_objective_group,
        context_factory=build_objective_context,
    )
