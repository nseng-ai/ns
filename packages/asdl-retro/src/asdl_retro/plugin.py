"""Plugin spec for the top-level ``asdl branch-retro`` subcommand."""

from __future__ import annotations

from asdl_core.plugin import AsdlPluginSpec
from asdl_retro.group import build_branch_retro_group


def build_branch_retro_context() -> object:
    return object()


def build_branch_retro_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_branch_retro_group,
        context_factory=build_branch_retro_context,
    )
