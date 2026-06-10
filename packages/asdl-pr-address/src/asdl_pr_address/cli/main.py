from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli
from asdl_pr_address.cli.plugin import build_pr_address_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``pr-address`` CLI group."""
    return build_standalone_cli(build_pr_address_plugin(), package_name="asdl-pr-address", entry_point="asdl_pr_address.cli.main:main")


def main() -> None:
    """Entry point for the standalone ``pr-address`` CLI."""
    invoke_standalone_cli(build_pr_address_plugin(), package_name="asdl-pr-address", entry_point="asdl_pr_address.cli.main:main")
