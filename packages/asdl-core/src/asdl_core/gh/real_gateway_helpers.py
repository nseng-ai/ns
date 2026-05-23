"""Subprocess-backed helpers for the real PRGateway implementation.

Keeping helper functions in this module makes the production ``gh`` plumbing
explicit without adding parent-package dependencies.
"""

from __future__ import annotations

import json
import subprocess
from typing import Any, cast

from asdl_core.gh.types import (
    PRChangedFile,
    PRDiscussionComment,
    PRGatewayFailure,
    PRInlineCommentInput,
    PRLookupMiss,
    PRMergeOutcome,
    PRReview,
    PRReviewComment,
    PRReviewState,
    PRReviewThread,
    PRReviewThreadState,
    PRState,
    PRStateFilter,
    PRSummary,
    Reaction,
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

_PR_SUMMARY_FIELDS = "number,title,body,url,headRefName,headRefOid,baseRefName,state"


def _run_gh(args: list[str], *, repo: str | None = None) -> subprocess.CompletedProcess[str]:
    cmd = ["gh", *args]
    if repo is not None:
        cmd.extend(["-R", repo])
    try:
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(
            cmd,
            127,
            stdout="",
            stderr=str(exc),
        )


def _parse_repo(repo: str) -> tuple[str, str]:
    parts = repo.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("repo must be in owner/name form")
    return parts[0], parts[1]


def _get_owner_repo(repo: str | None = None) -> tuple[str, str]:
    """Resolve ``(owner, repo)`` for GraphQL and REST API calls."""
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
    """Parse ``gh api --paginate`` output for endpoints that return arrays."""
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


def _is_no_pr_lookup(stderr: str) -> bool:
    normalized = stderr.lower()
    return "no pull request" in normalized or "no pull requests" in normalized


def _lookup_failure(result: subprocess.CompletedProcess[str]) -> PRLookupMiss | PRGatewayFailure:
    stderr = result.stderr.strip()
    if result.returncode == 1 and _is_no_pr_lookup(stderr):
        return PRLookupMiss(stderr=stderr or "no PR found", returncode=result.returncode)
    return PRGatewayFailure(
        stderr=stderr,
        returncode=result.returncode,
        stdout=result.stdout.strip(),
    )


def _summary_from_pr_view(data: dict[str, Any]) -> PRSummary:
    state: PRState = data["state"]
    return PRSummary(
        number=data["number"],
        title=data["title"],
        url=data["url"],
        head_ref_name=data["headRefName"],
        base_ref_name=data["baseRefName"],
        state=state,
        body=data.get("body"),
        head_ref_oid=data.get("headRefOid"),
    )


def fetch_pr_summary_for_branch(
    branch: str, *, repo: str | None = None
) -> PRSummary | PRLookupMiss | PRGatewayFailure:
    """Shell out to ``gh pr view <branch>`` and return a ``PRSummary``."""
    result = _run_gh(
        [
            "pr",
            "view",
            branch,
            "--json",
            _PR_SUMMARY_FIELDS,
        ],
        repo=repo,
    )
    if result.returncode != 0:
        return _lookup_failure(result)
    data = json.loads(result.stdout)
    return _summary_from_pr_view(data)


def search_prs(
    query: str, *, state: PRStateFilter, repo: str | None = None
) -> tuple[PRSummary, ...] | PRGatewayFailure:
    """Shell out to ``gh pr list --state <state> --search <query>``."""
    result = _run_gh(
        [
            "pr",
            "list",
            "--state",
            state,
            "--search",
            query,
            "--json",
            _PR_SUMMARY_FIELDS,
        ],
        repo=repo,
    )
    if result.returncode != 0:
        return PRGatewayFailure(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
            stdout=result.stdout.strip(),
        )
    items = json.loads(result.stdout)
    return tuple(_summary_from_pr_view(item) for item in items)


def merge_pr(
    pr_number: int,
    *,
    match_head_commit: str,
    admin: bool,
    auto: bool,
    repo: str | None = None,
) -> PRMergeOutcome | PRGatewayFailure:
    """Shell out to ``gh pr merge`` using squash merge and a head-commit guard."""
    args = [
        "pr",
        "merge",
        str(pr_number),
        "-s",
        "--match-head-commit",
        match_head_commit,
    ]
    if admin:
        args.append("--admin")
    if auto:
        args.append("--auto")
    result = _run_gh(args, repo=repo)
    if result.returncode != 0:
        return PRGatewayFailure(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
            stdout=result.stdout.strip(),
        )
    return PRMergeOutcome(number=pr_number, auto=auto)


def get_review_threads(
    pr_number: int, *, include_resolved: bool = False, repo: str | None = None
) -> tuple[PRReviewThread, ...]:
    owner, repo_name = _get_owner_repo(repo)
    cmd = [
        "gh",
        "api",
        "graphql",
        "-F",
        f"owner={owner}",
        "-F",
        f"repo={repo_name}",
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
            continue
        if not include_resolved and raw["isResolved"]:
            continue
        comments = tuple(
            PRReviewComment(
                id=comment["databaseId"],
                body=comment["body"],
                author=comment["author"]["login"] if comment["author"] else "",
                path=comment["path"],
                line=comment.get("line"),
                start_line=comment.get("startLine"),
                created_at=comment["createdAt"],
            )
            for comment in raw["comments"]["nodes"]
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


def get_reviews(pr_number: int, *, repo: str | None = None) -> tuple[PRReview, ...]:
    owner, repo_name = _get_owner_repo(repo)
    result = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{owner}/{repo_name}/pulls/{pr_number}/reviews",
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
            author=review["user"]["login"] if review["user"] else "",
            body=review["body"],
            state=cast(PRReviewState, review["state"]),
            submitted_at=review["submitted_at"],
        )
        for review in raw_reviews
        if review["state"] in _REVIEW_STATES_TO_INCLUDE
    )


def get_pr_changed_files(pr_number: int, *, repo: str | None = None) -> tuple[PRChangedFile, ...]:
    owner, repo_name = _get_owner_repo(repo)
    result = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{owner}/{repo_name}/pulls/{pr_number}/files",
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


def get_pr_review_comments(
    pr_number: int, *, repo: str | None = None
) -> tuple[PRReviewComment, ...]:
    owner, repo_name = _get_owner_repo(repo)
    result = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{owner}/{repo_name}/pulls/{pr_number}/comments",
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
            author=comment["user"]["login"] if comment["user"] else "",
            path=comment["path"],
            line=comment.get("line"),
            start_line=comment.get("start_line"),
            created_at=comment["created_at"],
        )
        for comment in raw_comments
    )


def get_pr_discussion_comments(
    pr_number: int, *, repo: str | None = None
) -> tuple[PRDiscussionComment, ...]:
    owner, repo_name = _get_owner_repo(repo)
    result = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{owner}/{repo_name}/issues/{pr_number}/comments",
            "--paginate",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    raw_comments = _load_paginated_array_output(result.stdout)
    return tuple(_discussion_comment_from_response(comment) for comment in raw_comments)


def resolve_review_thread(thread_id: str) -> PRReviewThreadState:
    cmd = [
        "gh",
        "api",
        "graphql",
        "-F",
        f"threadId={thread_id}",
        "-f",
        f"query={_RESOLVE_REVIEW_THREAD_MUTATION}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    payload = json.loads(result.stdout)
    thread = payload["data"]["resolveReviewThread"]["thread"]
    return PRReviewThreadState(thread_id=thread["id"], is_resolved=thread["isResolved"])


def unresolve_review_thread(thread_id: str) -> PRReviewThreadState:
    cmd = [
        "gh",
        "api",
        "graphql",
        "-F",
        f"threadId={thread_id}",
        "-f",
        f"query={_UNRESOLVE_REVIEW_THREAD_MUTATION}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    payload = json.loads(result.stdout)
    thread = payload["data"]["unresolveReviewThread"]["thread"]
    return PRReviewThreadState(thread_id=thread["id"], is_resolved=thread["isResolved"])


def add_review_thread_reply(thread_id: str, body: str) -> PRReviewComment:
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
        author=comment["author"]["login"] if comment["author"] else "",
        path=comment["path"],
        line=comment.get("line"),
        start_line=comment.get("startLine"),
        created_at=comment["createdAt"],
    )


def create_pr_review(
    pr_number: int,
    comments: tuple[PRInlineCommentInput, ...],
    *,
    repo: str | None = None,
) -> PRReview:
    owner, repo_name = _get_owner_repo(repo)
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
        f"repos/{owner}/{repo_name}/pulls/{pr_number}/reviews",
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
    return PRReview(
        id=review["node_id"],
        author=review["user"]["login"] if review.get("user") else "",
        state=cast(PRReviewState, review["state"]),
        body=review.get("body") or "",
        submitted_at=review.get("submitted_at") or "",
    )


def add_pr_discussion_comment(
    pr_number: int, body: str, *, repo: str | None = None
) -> PRDiscussionComment:
    owner, repo_name = _get_owner_repo(repo)
    cmd = [
        "gh",
        "api",
        "--method",
        "POST",
        f"repos/{owner}/{repo_name}/issues/{pr_number}/comments",
        "-f",
        f"body={body}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    comment = json.loads(result.stdout)
    return _discussion_comment_from_response(comment)


def find_pr_discussion_comment_by_marker(
    pr_number: int,
    marker: str,
    author_login: str,
    *,
    repo: str | None = None,
) -> PRDiscussionComment | None:
    for comment in get_pr_discussion_comments(pr_number, repo=repo):
        if comment.author == author_login and marker in comment.body:
            return comment
    return None


def update_pr_discussion_comment(
    comment_id: int, body: str, *, repo: str | None = None
) -> PRDiscussionComment:
    owner, repo_name = _get_owner_repo(repo)
    cmd = [
        "gh",
        "api",
        "--method",
        "PATCH",
        f"repos/{owner}/{repo_name}/issues/comments/{comment_id}",
        "-f",
        f"body={body}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    comment = json.loads(result.stdout)
    return _discussion_comment_from_response(comment)


def add_pr_discussion_comment_reaction(
    comment_id: int, reaction: str, *, repo: str | None = None
) -> Reaction:
    owner, repo_name = _get_owner_repo(repo)
    cmd = [
        "gh",
        "api",
        "--method",
        "POST",
        f"repos/{owner}/{repo_name}/issues/comments/{comment_id}/reactions",
        "-H",
        "Accept: application/vnd.github+json",
        "-f",
        f"content={reaction}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    response = json.loads(result.stdout)
    return Reaction(id=response["id"], comment_id=comment_id, content=response["content"])


def _discussion_comment_from_response(comment: dict[str, Any]) -> PRDiscussionComment:
    return PRDiscussionComment(
        id=comment["id"],
        body=comment["body"],
        author=comment["user"]["login"] if comment["user"] else "",
        url=comment["html_url"],
    )
