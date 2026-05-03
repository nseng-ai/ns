from __future__ import annotations

from asdl_core.plugin import AsdlPluginSpec
from asdl_pr_address.cli.pr_address.context import build_pr_address_context
from asdl_pr_address.cli.pr_address.group import build_pr_address_group


def build_pr_address_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_pr_address_group,
        context_factory=build_pr_address_context,
    )
