from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import AsdlPluginSpec, build_standalone_cli, invoke_standalone_cli
from asdl_pr_address.cli.pr_address.context import build_pr_address_context
from asdl_pr_address.cli.pr_address.group import build_pr_address_group


def _build_cli_spec() -> AsdlPluginSpec:
    return AsdlPluginSpec(
        build_group=build_pr_address_group,
        context_factory=build_pr_address_context,
    )


def build_cli() -> ClinkrGroup:
    """Build the standalone ``pr-address`` CLI group."""
    return build_standalone_cli(_build_cli_spec(), package_name="asdl-pr-address")


def main() -> None:
    """Entry point for the standalone ``pr-address`` CLI."""
    invoke_standalone_cli(_build_cli_spec(), package_name="asdl-pr-address")
