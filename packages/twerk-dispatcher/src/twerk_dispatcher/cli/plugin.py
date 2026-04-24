from __future__ import annotations

from twerk_core.plugin import TwerkPluginSpec
from twerk_dispatcher.cli.dispatcher.context import build_dispatcher_context
from twerk_dispatcher.cli.dispatcher.group import build_dispatcher_group


def build_dispatcher_plugin() -> TwerkPluginSpec:
    return TwerkPluginSpec(
        build_group=build_dispatcher_group,
        context_factory=build_dispatcher_context,
    )
