"""Test utilities for the GitHub gateway."""

from __future__ import annotations

from collections.abc import Sequence

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.types import (
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


class FakeIssueGateway(IssueGateway):
    """In-memory fake implementation of IssueGateway.

    Constructor-only configuration with mutation tracking for assertions.
    No public setup methods — all state is provided at construction.

    The fake accepts a `label` argument on `list()` for interface compatibility
    but does not actually filter on it — tests seed the fake with the issues
    they expect back.
    """

    def __init__(
        self,
        *,
        issues: Sequence[Issue] = (),
        review_threads: dict[int, Sequence[PRReviewThread]] | None = None,
        reviews: dict[int, Sequence[PRReview]] | None = None,
        discussion_comments: dict[int, Sequence[IssueComment]] | None = None,
        pr_changed_files: dict[int, Sequence[PRChangedFile]] | None = None,
        pr_review_comments: dict[int, Sequence[PRReviewComment]] | None = None,
        prs_by_branch: dict[str, PRSummary] | None = None,
        raise_on: dict[str, BaseException] | None = None,
    ) -> None:
        self._issues = tuple(issues)
        self._review_threads = review_threads or {}
        self._reviews = reviews or {}
        # Copy into a mutable mapping with list values so `add_comment` and
        # `update_comment` can round-trip newly created entries.
        self._discussion_comments: dict[int, list[IssueComment]] = {
            pr_number: list(entries) for pr_number, entries in (discussion_comments or {}).items()
        }
        self._pr_changed_files = pr_changed_files or {}
        self._pr_review_comments: dict[int, list[PRReviewComment]] = {
            pr_number: list(entries) for pr_number, entries in (pr_review_comments or {}).items()
        }
        self._prs_by_branch = prs_by_branch or {}
        self._raise_on = dict(raise_on or {})
        self._next_comment_id = 1
        self._next_reaction_id = 1

        # Mutation tracking — public-but-underscored, read in tests for assertions.
        self._resolved_thread_ids: list[str] = []
        self._unresolved_thread_ids: list[str] = []
        self._thread_replies: list[tuple[str, str]] = []
        self._comments: list[tuple[int, str]] = []
        self._created_reviews: list[tuple[int, tuple[PRInlineCommentInput, ...]]] = []
        self._updated_comments: list[tuple[int, str]] = []
        self._reactions: list[tuple[int, str]] = []

    # -- Issue queries --

    def list(self, *, label: str | None = None, state: str = "open") -> tuple[Issue, ...]:
        if exc := self._raise_on.get("list"):
            raise exc
        if state == "all":
            return self._issues
        return tuple(i for i in self._issues if i.state.lower() == state.lower())

    # -- PR queries --

    def get_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        threads = self._review_threads.get(pr_number, [])
        if not include_resolved:
            threads = [t for t in threads if not t.is_resolved]
        return tuple(threads)

    def get_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        return tuple(self._reviews.get(pr_number, []))

    def get_pr_changed_files(self, pr_number: int) -> tuple[PRChangedFile, ...]:
        return tuple(self._pr_changed_files.get(pr_number, []))

    def get_pr_review_comments(self, pr_number: int) -> tuple[PRReviewComment, ...]:
        return tuple(self._pr_review_comments.get(pr_number, []))

    def get_discussion_comments(self, pr_number: int) -> tuple[IssueComment, ...]:
        return tuple(self._discussion_comments.get(pr_number, []))

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        pr = self._prs_by_branch.get(branch)
        if pr is None:
            return PRLookupError(stderr="no PR found", returncode=1)
        return pr

    # -- PR mutations --

    def resolve_review_thread(self, thread_id: str) -> ResolveReviewThreadResult:
        was_already_resolved = thread_id in self._resolved_thread_ids
        self._resolved_thread_ids.append(thread_id)
        return ResolveReviewThreadResult(
            thread_id=thread_id,
            was_already_resolved=was_already_resolved,
        )

    def unresolve_review_thread(self, thread_id: str) -> UnresolveReviewThreadResult:
        was_already_unresolved = thread_id in self._unresolved_thread_ids
        self._unresolved_thread_ids.append(thread_id)
        return UnresolveReviewThreadResult(
            thread_id=thread_id,
            was_already_unresolved=was_already_unresolved,
        )

    def add_review_thread_reply(self, thread_id: str, body: str) -> PRReviewComment:
        comment_id = self._next_comment_id
        self._next_comment_id += 1
        self._thread_replies.append((thread_id, body))
        return PRReviewComment(
            id=comment_id,
            body=body,
            author="fake-user",
            path="",
            line=None,
            created_at="",
        )

    def create_pr_review(
        self, pr_number: int, comments: tuple[PRInlineCommentInput, ...]
    ) -> PRReviewSubmission:
        if exc := self._raise_on.get("create_pr_review"):
            raise exc
        self._created_reviews.append((pr_number, comments))
        existing = self._pr_review_comments.setdefault(pr_number, [])
        for comment in comments:
            comment_id = self._next_comment_id
            self._next_comment_id += 1
            existing.append(
                PRReviewComment(
                    id=comment_id,
                    body=comment.body,
                    author="github-actions[bot]",
                    path=comment.path,
                    line=comment.line,
                    created_at="",
                )
            )
        return PRReviewSubmission(
            id=f"fake-review-{len(self._created_reviews)}",
            state="COMMENTED",
            body="",
            submitted_at="",
        )

    def add_comment(self, pr_number: int, body: str) -> IssueComment:
        comment_id = self._next_comment_id
        self._next_comment_id += 1
        self._comments.append((pr_number, body))
        comment = IssueComment(
            id=comment_id,
            body=body,
            author="fake-user",
            url=f"https://github.com/fake/fake/pull/{pr_number}#issuecomment-{comment_id}",
        )
        # Append to the seeded comments so later `find_comment_by_marker` and
        # `update_comment` calls can round-trip the newly created entry.
        self._discussion_comments.setdefault(pr_number, []).append(comment)
        return comment

    def find_comment_by_marker(
        self, pr_number: int, marker: str, author_login: str
    ) -> IssueComment | None:
        for comment in self._discussion_comments.get(pr_number, ()):
            if comment.author == author_login and marker in comment.body:
                return comment
        return None

    def update_comment(self, comment_id: int, body: str) -> IssueComment:
        for comments in self._discussion_comments.values():
            for index, comment in enumerate(comments):
                if comment.id == comment_id:
                    updated = IssueComment(
                        id=comment.id,
                        body=body,
                        author=comment.author,
                        url=comment.url,
                    )
                    comments[index] = updated
                    self._updated_comments.append((comment_id, body))
                    return updated
        raise KeyError(f"no fake comment with id {comment_id}")

    def add_reaction(self, comment_id: int, reaction: str) -> Reaction:
        reaction_id = self._next_reaction_id
        self._next_reaction_id += 1
        self._reactions.append((comment_id, reaction))
        return Reaction(id=reaction_id, comment_id=comment_id, content=reaction)
