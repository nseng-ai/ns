from __future__ import annotations

from twerk_core.plugin import TwerkPluginSpec
from twerk_reviewer.cli.reviewer.context import build_reviewer_context
from twerk_reviewer.cli.reviewer.group import build_reviewer_group


def build_reviewer_plugin() -> TwerkPluginSpec:
    return TwerkPluginSpec(
        build_group=build_reviewer_group,
        context_factory=build_reviewer_context,
    )
