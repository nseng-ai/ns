from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.plugin import build_standalone_cli, invoke_standalone_cli
from asdl_slots.cli.plugin import build_slot_plugin


def build_cli() -> ClinkrGroup:
    return build_standalone_cli(build_slot_plugin(), package_name="asdl-slots")


def main() -> None:
    invoke_standalone_cli(build_slot_plugin(), package_name="asdl-slots")
