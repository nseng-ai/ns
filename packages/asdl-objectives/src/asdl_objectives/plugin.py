"""Plugin spec for the top-level ``asdl objective`` subcommand."""

from __future__ import annotations

from asdl_core.plugin import AsdlPluginSpec
from asdl_objectives.context import build_objective_context
from asdl_objectives.group import build_objective_group


def build_objective_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_objective_group,
        context_factory=build_objective_context,
    )
