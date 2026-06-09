"""Subprocess-backed helpers for the real PRGateway implementation.

Keeping helper functions in this module makes the production ``gh`` plumbing
explicit without adding parent-package dependencies.
"""

from __future__ import annotations

import json
import subprocess

from asdl_core.gh.response_mapping import (
    changed_files_from_rest_pages,
    discussion_comment_from_response,
    discussion_comments_from_rest_pages,
    pr_review_from_create_response,
    pr_summaries_from_list_response,
    pr_summary_from_view_response,
    reaction_from_response,
    review_comment_from_thread_reply_response,
    review_comments_from_rest_pages,
    review_thread_state_from_resolve_response,
    review_thread_state_from_unresolve_response,
    review_threads_from_graphql_response,
    reviews_from_rest_pages,
)
from asdl_core.gh.types import (
    PRChangedFile,
    PRCloseOutcome,
    PRDiscussionComment,
    PRGatewayFailure,
    PRInlineCommentInput,
    PRLookupMiss,
    PRMergeOutcome,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRReviewThreadState,
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


def fetch_pr_summary_for_branch(
    branch: str, *, repo: str | None = None
) -> PRSummary | PRLookupMiss | PRGatewayFailure:
    """Shell out to ``gh pr view <branch>`` and return a ``PRSummary``."""
    return _fetch_pr_summary(branch, repo=repo)


def fetch_pr_summary_for_number(
    pr_number: int, *, repo: str | None = None
) -> PRSummary | PRLookupMiss | PRGatewayFailure:
    """Shell out to ``gh pr view <number>`` and return a ``PRSummary``."""
    return _fetch_pr_summary(str(pr_number), repo=repo)


def _fetch_pr_summary(
    identifier: str, *, repo: str | None = None
) -> PRSummary | PRLookupMiss | PRGatewayFailure:
    result = _run_gh(
        [
            "pr",
            "view",
            identifier,
            "--json",
            _PR_SUMMARY_FIELDS,
        ],
        repo=repo,
    )
    if result.returncode != 0:
        return _lookup_failure(result)
    return pr_summary_from_view_response(json.loads(result.stdout))


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
    return pr_summaries_from_list_response(json.loads(result.stdout))


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


def close_pr(pr_number: int, *, repo: str | None = None) -> PRCloseOutcome | PRGatewayFailure:
    """Shell out to ``gh pr close`` without branch deletion side effects."""
    result = _run_gh(["pr", "close", str(pr_number)], repo=repo)
    if result.returncode != 0:
        return PRGatewayFailure(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
            stdout=result.stdout.strip(),
        )
    return PRCloseOutcome(number=pr_number)


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
    return review_threads_from_graphql_response(
        json.loads(result.stdout), include_resolved=include_resolved
    )


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
    return reviews_from_rest_pages(result.stdout)


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
    return changed_files_from_rest_pages(result.stdout)


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
    return review_comments_from_rest_pages(result.stdout)


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
    return discussion_comments_from_rest_pages(result.stdout)


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
    return review_thread_state_from_resolve_response(json.loads(result.stdout))


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
    return review_thread_state_from_unresolve_response(json.loads(result.stdout))


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
    return review_comment_from_thread_reply_response(json.loads(result.stdout))


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
    return pr_review_from_create_response(json.loads(result.stdout))


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
    return discussion_comment_from_response(json.loads(result.stdout))


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
    return discussion_comment_from_response(json.loads(result.stdout))


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
    return reaction_from_response(json.loads(result.stdout), comment_id=comment_id)
