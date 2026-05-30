"""Explicit builder for the hidden ``roaster exec`` CLI subgroup."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.roaster.exec.classify_inline_findings import (
    classify_inline_findings_command,
)
from roaster.cli.roaster.exec.format_findings_comment import (
    format_findings_comment_command,
)
from roaster.cli.roaster.exec.post_findings_comment import (
    post_findings_comment_command,
)
from roaster.cli.roaster.exec.post_inline_findings import (
    post_inline_findings_command,
)


def build_exec_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="exec",
        help="Commands used by roaster CI automation.",
        hidden=True,
        operations=[classify_inline_findings_command, post_inline_findings_command],
    )
    group.add_command(format_findings_comment_command)
    group.add_command(post_findings_comment_command)
    return group
