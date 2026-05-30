"""Explicit builder for the `reviewer review` CLI subgroup."""

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.reviewer.review.list_reviews import run_review_list_command
from roaster.cli.reviewer.review.run import run_review_command


def build_review_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="review",
        help="Run and list markdown-defined reviewers.",
        operations=[run_review_list_command, run_review_command],
    )
