from __future__ import annotations

from asdl_core.plugin import AsdlPluginSpec
from asdl_dispatcher.cli.dispatcher.context import build_dispatcher_context
from asdl_dispatcher.cli.dispatcher.group import build_dispatcher_group


def build_dispatcher_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_dispatcher_group,
        context_factory=build_dispatcher_context,
    )
