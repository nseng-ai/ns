"""Hidden root exec subgroup for GitHub PR primitives."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_tools.exec.gh_review_threads import run_resolve_review_threads, run_review_threads


def build_gh_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="gh",
        help="GitHub primitives for skill/agent invocation.",
        operations=[run_review_threads, run_resolve_review_threads],
    )
