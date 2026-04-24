from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.plugin import build_standalone_cli, invoke_standalone_cli
from twerk_dispatcher.cli.plugin import build_dispatcher_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``dispatcher`` CLI group."""
    return build_standalone_cli(build_dispatcher_plugin(), package_name="twerk-dispatcher")


def main() -> None:
    """Entry point for the standalone ``dispatcher`` CLI."""
    invoke_standalone_cli(build_dispatcher_plugin(), package_name="twerk-dispatcher")
