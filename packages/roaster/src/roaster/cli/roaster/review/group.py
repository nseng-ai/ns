"""Explicit builder for the `roaster review` CLI subgroup."""

from asdl_core.clinkr.group import ClinkrGroup
from roaster.cli.roaster.review.list_reviews import run_review_list_command
from roaster.cli.roaster.review.run import run_review_command
from roaster.cli.roaster.review.run_matching import run_review_matching_command


def build_review_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="review",
        help="Run and list markdown-defined reviewers.",
        operations=[run_review_list_command, run_review_command, run_review_matching_command],
    )
