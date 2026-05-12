"""Real IssueGateway implementation backed by the gh CLI."""

from __future__ import annotations

import json
import subprocess
from typing import Any, cast

from asdl_core.gh.issue_gateway import IssueGateway
from asdl_core.gh.real_gateway_helpers import fetch_pr_summary_for_branch
from asdl_core.gh.types import (
    Issue,
    IssueComment,
    PRChangedFile,
    PRInlineCommentInput,
    PRLookupError,
    PRReview,
    PRReviewComment,
    PRReviewSubmission,
    PRReviewThread,
    PRSummary,
    Reaction,
    ResolveReviewThreadResult,
    UnresolveReviewThreadResult,
)

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
          startLine
          comments(first: 20) {
            nodes {
              databaseId
              body
              author { login }
              path
              line: originalLine
              startLine: originalStartLine
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
      startLine: originalStartLine
      createdAt
    }
  }
}
"""


def _parse_repo(repo: str) -> tuple[str, str]:
    parts = repo.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("repo must be in owner/name form")
    return parts[0], parts[1]


def _get_owner_repo(repo: str | None = None) -> tuple[str, str]:
    """Resolve `(owner, repo)` for GraphQL and REST API calls.

    When an explicit repository is configured, parse it directly so live
    conformance tests never inherit ambient `gh` repository context. Without
    explicit configuration, preserve the existing `gh repo view` behavior.
    """
    if repo is not None:
        return _parse_repo(repo)

    result = subprocess.run(
        ["gh", "repo", "view", "--json", "owner,name"],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    return data["owner"]["login"], data["name"]


def _load_paginated_array_output(stdout: str) -> list[dict[str, Any]]:
    """Parse `gh api --paginate` output for endpoints that return arrays.

    The CLI prints each page's JSON array back-to-back, so multi-page output is
    not valid JSON as a whole. Decode each array and flatten the pages.
    """
    decoder = json.JSONDecoder()
    items: list[dict[str, Any]] = []
    index = 0
    while index < len(stdout):
        while index < len(stdout) and stdout[index].isspace():
            index += 1
        if index >= len(stdout):
            break
        raw_page, index = decoder.raw_decode(stdout, index)
        page = cast(list[dict[str, Any]], raw_page)
        items.extend(page)
    return items


class RealIssueGateway(IssueGateway):
    """IssueGateway implemented by shelling out to the `gh` CLI."""

    def __init__(self, *, repo: str | None = None) -> None:
        self._repo = repo

    def list(self, *, label: str | None = None, state: str = "open") -> tuple[Issue, ...]:
        cmd = [
            "gh",
            "issue",
            "list",
            "--state",
            state,
            "--json",
            "number,title,state,updatedAt,url",
            "--limit",
            "100",
        ]
        if label is not None:
            cmd.extend(["--label", label])
        if self._repo is not None:
            cmd.extend(["-R", self._repo])

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        items = json.loads(result.stdout)
        return tuple(
            Issue(
                number=item["number"],
                title=item["title"],
                state=item["state"],
                updated_at=item["updatedAt"],
                url=item["url"],
            )
            for item in items
        )

    # -- PR queries --

    def get_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        owner, repo = _get_owner_repo(self._repo)
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
                    start_line=c.get("startLine"),
                    created_at=c["createdAt"],
                )
                for c in raw["comments"]["nodes"]
            )
            threads.append(
                PRReviewThread(
                    id=raw["id"],
                    path=raw["path"],
                    line=raw.get("line"),
                    start_line=raw.get("startLine"),
                    is_resolved=raw["isResolved"],
                    is_outdated=raw["isOutdated"],
                    comments=comments,
                )
            )
        return tuple(threads)

    def get_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        owner, repo = _get_owner_repo(self._repo)
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

    def get_pr_changed_files(self, pr_number: int) -> tuple[PRChangedFile, ...]:
        owner, repo = _get_owner_repo(self._repo)
        result = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{owner}/{repo}/pulls/{pr_number}/files",
                "--paginate",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        raw_files = _load_paginated_array_output(result.stdout)
        return tuple(
            PRChangedFile(
                path=file["filename"],
                status=file["status"],
                patch=file.get("patch"),
            )
            for file in raw_files
        )

    def get_pr_review_comments(self, pr_number: int) -> tuple[PRReviewComment, ...]:
        owner, repo = _get_owner_repo(self._repo)
        result = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{owner}/{repo}/pulls/{pr_number}/comments",
                "--paginate",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        raw_comments = _load_paginated_array_output(result.stdout)
        return tuple(
            PRReviewComment(
                id=comment["id"],
                body=comment["body"],
                # user can be null when the GitHub account is deleted.
                author=comment["user"]["login"] if comment["user"] else "",
                path=comment["path"],
                line=comment.get("line"),
                start_line=comment.get("start_line"),
                created_at=comment["created_at"],
            )
            for comment in raw_comments
        )

    def get_discussion_comments(self, pr_number: int) -> tuple[IssueComment, ...]:
        owner, repo = _get_owner_repo(self._repo)
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
        return fetch_pr_summary_for_branch(branch, repo=self._repo)

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
            start_line=comment.get("startLine"),
            created_at=comment["createdAt"],
        )

    def create_pr_review(
        self, pr_number: int, comments: tuple[PRInlineCommentInput, ...]
    ) -> PRReviewSubmission:
        owner, repo = _get_owner_repo(self._repo)
        body = {
            "event": "COMMENT",
            "comments": [
                {"path": comment.path, "line": comment.line, "body": comment.body}
                for comment in comments
            ],
        }
        cmd = [
            "gh",
            "api",
            "--method",
            "POST",
            f"repos/{owner}/{repo}/pulls/{pr_number}/reviews",
            "--input",
            "-",
        ]
        result = subprocess.run(
            cmd,
            input=json.dumps(body),
            capture_output=True,
            text=True,
            check=True,
        )
        review = json.loads(result.stdout)
        return PRReviewSubmission(
            id=review["node_id"],
            state=review["state"],
            body=review.get("body") or "",
            submitted_at=review.get("submitted_at") or "",
        )

    def add_comment(self, pr_number: int, body: str) -> IssueComment:
        owner, repo = _get_owner_repo(self._repo)
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

    def find_comment_by_marker(
        self, pr_number: int, marker: str, author_login: str
    ) -> IssueComment | None:
        # Reuses `get_discussion_comments`'s paginated fetch so pagination
        # lives in one place. The O(N) scan is fine for any realistic PR
        # (hundreds of comments at most).
        for comment in self.get_discussion_comments(pr_number):
            if comment.author == author_login and marker in comment.body:
                return comment
        return None

    def update_comment(self, comment_id: int, body: str) -> IssueComment:
        owner, repo = _get_owner_repo(self._repo)
        cmd = [
            "gh",
            "api",
            "--method",
            "PATCH",
            f"repos/{owner}/{repo}/issues/comments/{comment_id}",
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
        owner, repo = _get_owner_repo(self._repo)
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
