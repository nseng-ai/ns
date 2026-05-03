from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli
from asdl_dispatcher.cli.plugin import build_dispatcher_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``dispatcher`` CLI group."""
    return build_standalone_cli(build_dispatcher_plugin(), package_name="asdl-dispatcher")


def main() -> None:
    """Entry point for the standalone ``dispatcher`` CLI."""
    invoke_standalone_cli(build_dispatcher_plugin(), package_name="asdl-dispatcher")
