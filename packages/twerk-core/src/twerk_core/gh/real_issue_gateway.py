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
    "only issue listing and review-thread fetch are currently backed by the gh CLI."
)

# GraphQL query for fetching every review thread on a PR. Mirrors the query
# inlined in `.agents/skills/twerk-pr-address/references/operations.md` so
# there's a single canonical shape to update if GitHub changes the schema.
_REVIEW_THREADS_QUERY = """
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 20) {
            nodes {
              databaseId
              body
              author { login }
              path
              line: originalLine
              createdAt
            }
          }
        }
      }
    }
  }
}
"""


def _get_owner_repo() -> tuple[str, str]:
    """Resolve `(owner, repo)` for the current working directory via `gh repo view`.

    GraphQL queries require owner and repo as separate variables. This helper
    is module-level (not a method) so sibling push-down methods that also
    need owner/repo (`get_reviews`, `get_discussion_comments`, the mutation
    ops) can reuse it without refactor churn.
    """
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "owner,name"],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    return data["owner"]["login"], data["name"]


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

    # -- PR queries --

    def get_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        owner, repo = _get_owner_repo()
        cmd = [
            "gh",
            "api",
            "graphql",
            "-F",
            f"owner={owner}",
            "-F",
            f"repo={repo}",
            "-F",
            f"number={pr_number}",
            "-f",
            f"query={_REVIEW_THREADS_QUERY}",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        payload = json.loads(result.stdout)
        raw_threads = payload["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]

        threads: list[PRReviewThread] = []
        for raw in raw_threads:
            if raw.get("id") is None:
                # GraphQL occasionally returns null-id threads for deleted files.
                continue
            if not include_resolved and raw["isResolved"]:
                continue
            comments = tuple(
                PRReviewComment(
                    id=c["databaseId"],
                    body=c["body"],
                    # author can be null when the GitHub account is deleted.
                    author=c["author"]["login"] if c["author"] else "",
                    path=c["path"],
                    line=c.get("line"),
                    created_at=c["createdAt"],
                )
                for c in raw["comments"]["nodes"]
            )
            threads.append(
                PRReviewThread(
                    id=raw["id"],
                    path=raw["path"],
                    line=raw.get("line"),
                    is_resolved=raw["isResolved"],
                    is_outdated=raw["isOutdated"],
                    comments=comments,
                )
            )
        return tuple(threads)

    # -- PR queries (not yet implemented) --

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
