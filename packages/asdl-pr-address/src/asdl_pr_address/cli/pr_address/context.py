"""Build the typed pr-address CLI context."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.gh.construction import build_pr_gateway
from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.git.construction import build_git_gateway
from asdl_core.git.git_gateway import GitGateway


@dataclass(frozen=True)
class PrAddressCliContext:
    """Typed context for the ``pr-address`` CLI."""

    pr_gateway: PRGateway
    git_gateway: GitGateway


def build_pr_address_context() -> PrAddressCliContext:
    """Assemble a :class:`PrAddressCliContext` from real gateways."""
    return PrAddressCliContext(
        pr_gateway=build_pr_gateway(),
        git_gateway=build_git_gateway(),
    )
