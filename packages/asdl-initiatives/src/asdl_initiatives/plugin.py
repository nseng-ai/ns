"""Plugin spec for the top-level ``asdl initiative`` subcommand."""

from __future__ import annotations

from asdl_core.git.real_git_gateway import RealGitGateway
from asdl_core.plugin import AsdlPluginSpec
from asdl_initiatives.context import InitiativeCliContext
from asdl_initiatives.group import build_initiative_group


def build_initiative_context() -> InitiativeCliContext:
    return InitiativeCliContext(git_gateway=RealGitGateway())


def build_initiative_plugin() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_initiative_group,
        context_factory=build_initiative_context,
    )
