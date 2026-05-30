from __future__ import annotations

from asdl_core.plugin import AsdlPluginSpec
from roaster.cli.reviewer.context import build_reviewer_context
from roaster.cli.reviewer.group import build_reviewer_group


def build_reviewer_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_reviewer_group,
        context_factory=build_reviewer_context,
    )
