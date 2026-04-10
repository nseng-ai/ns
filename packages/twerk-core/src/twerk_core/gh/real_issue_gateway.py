"""Real IssueGateway implementation backed by the gh CLI."""

from __future__ import annotations

import json
import subprocess

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.types import (
    Issue,
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    Reaction,
    ResolveReviewThreadResult,
    UnresolveReviewThreadResult,
)

_NOT_IMPLEMENTED_MSG = (
    "RealIssueGateway.{method} is not yet implemented — "
    "only issue listing is currently backed by the gh CLI."
)


class RealIssueGateway(IssueGateway):
    """IssueGateway implemented by shelling out to the `gh` CLI."""

    def list(self, *, label: str | None = None, state: str = "open") -> tuple[Issue, ...]:
        cmd = [
            "gh",
            "issue",
            "list",
            "--state",
            state,
            "--json",
            "number,title,state,updatedAt",
            "--limit",
            "100",
        ]
        if label is not None:
            cmd.extend(["--label", label])

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        items = json.loads(result.stdout)
        return tuple(
            Issue(
                number=item["number"],
                title=item["title"],
                state=item["state"],
                updated_at=item["updatedAt"],
            )
            for item in items
        )

    # -- PR queries (not yet implemented) --

    def get_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        raise NotImplementedError(_NOT_IMPLEMENTED_MSG.format(method="get_review_threads"))

    def get_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        raise NotImplementedError(_NOT_IMPLEMENTED_MSG.format(method="get_reviews"))

    def get_discussion_comments(self, pr_number: int) -> tuple[IssueComment, ...]:
        raise NotImplementedError(_NOT_IMPLEMENTED_MSG.format(method="get_discussion_comments"))

    def get_number_for_branch(self, branch: str) -> int | None:
        raise NotImplementedError(_NOT_IMPLEMENTED_MSG.format(method="get_number_for_branch"))

    # -- PR mutations (not yet implemented) --

    def resolve_review_thread(self, thread_id: str) -> ResolveReviewThreadResult:
        raise NotImplementedError(_NOT_IMPLEMENTED_MSG.format(method="resolve_review_thread"))

    def unresolve_review_thread(self, thread_id: str) -> UnresolveReviewThreadResult:
        raise NotImplementedError(_NOT_IMPLEMENTED_MSG.format(method="unresolve_review_thread"))

    def add_review_thread_reply(self, thread_id: str, body: str) -> PRReviewComment:
        raise NotImplementedError(_NOT_IMPLEMENTED_MSG.format(method="add_review_thread_reply"))

    def add_comment(self, pr_number: int, body: str) -> IssueComment:
        raise NotImplementedError(_NOT_IMPLEMENTED_MSG.format(method="add_comment"))

    def add_reaction(self, comment_id: int, reaction: str) -> Reaction:
        raise NotImplementedError(_NOT_IMPLEMENTED_MSG.format(method="add_reaction"))
