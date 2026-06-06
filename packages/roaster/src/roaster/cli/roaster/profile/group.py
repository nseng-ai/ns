"""Explicit builder for the `roaster profile` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.roaster.profile.list_profiles import run_profile_list_command


def build_profile_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="profile",
        help="List roaster profiles used by stack workflows.",
        operations=[run_profile_list_command],
    )
