from __future__ import annotations

from twerk_core.plugin import TwerkPluginSpec
from twerk_pr_address.cli.pr_address.context import build_pr_address_context
from twerk_pr_address.cli.pr_address.group import build_pr_address_group


def build_pr_address_plugin() -> TwerkPluginSpec:
    return TwerkPluginSpec(
        build_group=build_pr_address_group,
        context_factory=build_pr_address_context,
    )
