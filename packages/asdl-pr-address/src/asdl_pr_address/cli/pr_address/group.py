"""Explicit builder for the `pr-address` CLI group."""

from __future__ import annotations

from asdl_core.clinkr.group import ClinkrGroup
from asdl_pr_address.cli.pr_address.add_issue_comment import run_add_issue_comment
from asdl_pr_address.cli.pr_address.add_reaction import run_add_pr_discussion_comment_reaction
from asdl_pr_address.cli.pr_address.add_review_thread_reply import run_add_review_thread_reply
from asdl_pr_address.cli.pr_address.build_resolve_thread_batch_payload import (
    run_build_resolve_thread_batch_payload,
)
from asdl_pr_address.cli.pr_address.classification_template import run_classification_template
from asdl_pr_address.cli.pr_address.get_discussion_comments import run_get_pr_discussion_comments
from asdl_pr_address.cli.pr_address.get_feedback import run_get_feedback
from asdl_pr_address.cli.pr_address.get_pr_for_branch import run_get_pr_for_branch
from asdl_pr_address.cli.pr_address.get_review_comments import run_get_review_comments
from asdl_pr_address.cli.pr_address.get_reviews import run_get_reviews
from asdl_pr_address.cli.pr_address.plan_feedback import run_plan_feedback
from asdl_pr_address.cli.pr_address.prepare_run import run_prepare_run
from asdl_pr_address.cli.pr_address.read_feedback_detail import (
    run_read_feedback_detail,
    run_read_feedback_details,
)
from asdl_pr_address.cli.pr_address.reply_to_discussion import run_reply_to_discussion
from asdl_pr_address.cli.pr_address.reply_to_review import run_reply_to_review
from asdl_pr_address.cli.pr_address.resolve_thread import run_resolve_thread
from asdl_pr_address.cli.pr_address.resolve_thread_batch import run_resolve_thread_batch
from asdl_pr_address.cli.pr_address.resolve_thread_with_reply import run_resolve_thread_with_reply
from asdl_pr_address.cli.pr_address.summarize_feedback import run_summarize_feedback
from asdl_pr_address.cli.pr_address.unresolve_thread import run_unresolve_thread
from asdl_pr_address.cli.pr_address.validate_feedback_classification import (
    run_validate_feedback_classification,
)


def build_pr_address_group() -> ClinkrGroup:
    exec_group = ClinkrGroup(
        name="exec",
        help="Commands for use by the pr-address skill.",
        operations=[
            run_add_issue_comment,
            run_add_pr_discussion_comment_reaction,
            run_add_review_thread_reply,
            run_build_resolve_thread_batch_payload,
            run_get_pr_discussion_comments,
            run_get_feedback,
            run_get_pr_for_branch,
            run_get_review_comments,
            run_get_reviews,
            run_plan_feedback,
            run_prepare_run,
            run_read_feedback_detail,
            run_read_feedback_details,
            run_classification_template,
            run_reply_to_discussion,
            run_reply_to_review,
            run_resolve_thread,
            run_resolve_thread_batch,
            run_resolve_thread_with_reply,
            run_summarize_feedback,
            run_unresolve_thread,
            run_validate_feedback_classification,
        ],
        hidden=True,
    )
    outer = ClinkrGroup(name="pr-address", help="PR review address operations.")
    outer.add_command(exec_group)
    return outer
