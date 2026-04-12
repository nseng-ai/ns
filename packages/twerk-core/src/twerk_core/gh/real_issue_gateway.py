"""Real IssueGateway implementation backed by the gh CLI."""

from __future__ import annotations

import json
import subprocess
from typing import cast

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.types import (
    Issue,
    IssueComment,
    PRLookupError,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRSummary,
    Reaction,
    ResolveReviewThreadResult,
    UnresolveReviewThreadResult,
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

_REVIEW_STATES_TO_INCLUDE = frozenset({"CHANGES_REQUESTED", "APPROVED", "COMMENTED"})

_RESOLVE_REVIEW_THREAD_MUTATION = """
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread {
      id
      isResolved
    }
  }
}
"""

_UNRESOLVE_REVIEW_THREAD_MUTATION = """
mutation($threadId: ID!) {
  unresolveReviewThread(input: {threadId: $threadId}) {
    thread {
      id
      isResolved
    }
  }
}
"""

# The comment projection mirrors `_REVIEW_THREADS_QUERY` — in particular the
# `line: originalLine` alias — so the reply comment produced by this mutation
# lines up with the shape consumers already handle from `get_review_threads`.
_ADD_REVIEW_THREAD_REPLY_MUTATION = """
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(
    input: {pullRequestReviewThreadId: $threadId, body: $body}
  ) {
    comment {
      databaseId
      body
      author { login }
      path
      line: originalLine
      createdAt
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


def _load_paginated_array_output(stdout: str) -> list[dict[str, object]]:
    """Parse `gh api --paginate` output for endpoints that return arrays.

    The CLI prints each page's JSON array back-to-back, so multi-page output is
    not valid JSON as a whole. Decode each array and flatten the pages.
    """
    decoder = json.JSONDecoder()
    items: list[dict[str, object]] = []
    index = 0
    while index < len(stdout):
        while index < len(stdout) and stdout[index].isspace():
            index += 1
        if index >= len(stdout):
            break
        raw_page, index = decoder.raw_decode(stdout, index)
        page = cast(list[dict[str, object]], raw_page)
        items.extend(page)
    return items


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

    def get_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        owner, repo = _get_owner_repo()
        result = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{owner}/{repo}/pulls/{pr_number}/reviews",
                "--paginate",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        raw_reviews = _load_paginated_array_output(result.stdout)
        return tuple(
            PRReview(
                id=review["node_id"],
                # user can be null when the GitHub account is deleted.
                author=review["user"]["login"] if review["user"] else "",
                body=review["body"],
                state=review["state"],
                submitted_at=review["submitted_at"],
            )
            for review in raw_reviews
            if review["state"] in _REVIEW_STATES_TO_INCLUDE
        )

    def get_discussion_comments(self, pr_number: int) -> tuple[IssueComment, ...]:
        owner, repo = _get_owner_repo()
        result = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{owner}/{repo}/issues/{pr_number}/comments",
                "--paginate",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        raw_comments = _load_paginated_array_output(result.stdout)
        return tuple(
            IssueComment(
                id=comment["id"],
                body=comment["body"],
                # user can be null when the GitHub account is deleted.
                author=comment["user"]["login"] if comment["user"] else "",
                url=comment["html_url"],
            )
            for comment in raw_comments
        )

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        result = subprocess.run(
            [
                "gh",
                "pr",
                "view",
                branch,
                "--json",
                "number,title,url,headRefName,baseRefName",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return PRLookupError(
                stderr=result.stderr.strip(),
                returncode=result.returncode,
            )
        data = json.loads(result.stdout)
        return PRSummary(
            number=data["number"],
            title=data["title"],
            url=data["url"],
            head_ref_name=data["headRefName"],
            base_ref_name=data["baseRefName"],
        )

    # -- PR mutations --

    def resolve_review_thread(self, thread_id: str) -> ResolveReviewThreadResult:
        cmd = [
            "gh",
            "api",
            "graphql",
            "-F",
            f"threadId={thread_id}",
            "-f",
            f"query={_RESOLVE_REVIEW_THREAD_MUTATION}",
        ]
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        # GitHub's `resolveReviewThread` mutation is idempotent and exposes no
        # pre-state signal — see `ResolveReviewThreadResult` docstring.
        return ResolveReviewThreadResult(thread_id=thread_id, was_already_resolved=False)

    def unresolve_review_thread(self, thread_id: str) -> UnresolveReviewThreadResult:
        cmd = [
            "gh",
            "api",
            "graphql",
            "-F",
            f"threadId={thread_id}",
            "-f",
            f"query={_UNRESOLVE_REVIEW_THREAD_MUTATION}",
        ]
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        # See `UnresolveReviewThreadResult` docstring for why this is always False.
        return UnresolveReviewThreadResult(thread_id=thread_id, was_already_unresolved=False)

    def add_review_thread_reply(self, thread_id: str, body: str) -> PRReviewComment:
        cmd = [
            "gh",
            "api",
            "graphql",
            "-F",
            f"threadId={thread_id}",
            "-f",
            f"body={body}",
            "-f",
            f"query={_ADD_REVIEW_THREAD_REPLY_MUTATION}",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        payload = json.loads(result.stdout)
        comment = payload["data"]["addPullRequestReviewThreadReply"]["comment"]
        return PRReviewComment(
            id=comment["databaseId"],
            body=comment["body"],
            # author can be null when the GitHub account is deleted.
            author=comment["author"]["login"] if comment["author"] else "",
            path=comment["path"],
            line=comment.get("line"),
            created_at=comment["createdAt"],
        )

    def add_comment(self, pr_number: int, body: str) -> IssueComment:
        owner, repo = _get_owner_repo()
        cmd = [
            "gh",
            "api",
            "--method",
            "POST",
            f"repos/{owner}/{repo}/issues/{pr_number}/comments",
            "-f",
            f"body={body}",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        comment = json.loads(result.stdout)
        return IssueComment(
            id=comment["id"],
            body=comment["body"],
            # user can be null when the GitHub account is deleted.
            author=comment["user"]["login"] if comment["user"] else "",
            url=comment["html_url"],
        )

    def add_reaction(self, comment_id: int, reaction: str) -> Reaction:
        owner, repo = _get_owner_repo()
        cmd = [
            "gh",
            "api",
            "--method",
            "POST",
            f"repos/{owner}/{repo}/issues/comments/{comment_id}/reactions",
            "-H",
            "Accept: application/vnd.github+json",
            "-f",
            f"content={reaction}",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        response = json.loads(result.stdout)
        # `comment_id` is echoed from the argument — GitHub's reaction payload
        # carries an `id` (the reaction's own id) and a `content`, but not the
        # parent comment id on the flat shape. Echoing the caller-supplied
        # value matches the idempotent-echo pattern used by
        # `resolve_review_thread` / `unresolve_review_thread`.
        return Reaction(
            id=response["id"],
            comment_id=comment_id,
            content=response["content"],
        )
