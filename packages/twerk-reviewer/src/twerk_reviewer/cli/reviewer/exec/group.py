"""Explicit builder for the hidden ``reviewer exec`` CLI subgroup."""

from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup
from twerk_reviewer.cli.reviewer.exec.format_findings_comment import (
    format_findings_comment_command,
)
from twerk_reviewer.cli.reviewer.exec.post_findings_comment import (
    post_findings_comment_command,
)
from twerk_reviewer.cli.reviewer.exec.post_inline_review import (
    post_inline_review_command,
)


def build_exec_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="exec",
        help="Commands used by reviewer CI automation.",
    )
    group.hidden = True
    group.add_command(format_findings_comment_command)
    group.add_command(post_findings_comment_command)
    group.add_command(post_inline_review_command)
    return group
