from __future__ import annotations

from twerk_core.plugin import TwerkPluginSpec
from twerk_objectives.cli.objective.context import build_objectives_context
from twerk_objectives.cli.objective.group import build_objective_group


def build_objective_plugin() -> TwerkPluginSpec:
    return TwerkPluginSpec(
        build_group=build_objective_group,
        context_factory=build_objectives_context,
    )
