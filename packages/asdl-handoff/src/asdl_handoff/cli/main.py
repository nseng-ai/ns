from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli
from asdl_handoff.cli.plugin import build_handoff_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``handoff`` CLI group."""
    return build_standalone_cli(
        build_handoff_plugin(),
        package_name="asdl-handoff",
        entry_point="asdl_handoff.cli.main:main",
    )


def main() -> None:
    """Entry point for the standalone ``handoff`` CLI."""
    invoke_standalone_cli(
        build_handoff_plugin(),
        package_name="asdl-handoff",
        entry_point="asdl_handoff.cli.main:main",
    )
