"""Test utilities for the unified PRGateway."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import replace

from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import (
    PRChangedFile,
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


class FakePRGateway(PRGateway):
    """In-memory fake for PRGateway; seeds via constructor only."""

    def __init__(
        self,
        *,
        discussion_comments: dict[int, Sequence[PRDiscussionComment]] | None = None,
        reviews: dict[int, Sequence[PRReview]] | None = None,
        review_threads: dict[int, Sequence[PRReviewThread]] | None = None,
        pr_changed_files: dict[int, Sequence[PRChangedFile]] | None = None,
        pr_review_comments: dict[int, Sequence[PRReviewComment]] | None = None,
        prs_by_branch: dict[str, PRSummary] | None = None,
        prs: Sequence[PRSummary] = (),
        lookup_failure: PRGatewayFailure | None = None,
        search_failure: PRGatewayFailure | None = None,
        merge_failure: PRGatewayFailure | None = None,
    ) -> None:
        self._discussion_comments: dict[int, list[PRDiscussionComment]] = {
            pr_number: list(entries) for pr_number, entries in (discussion_comments or {}).items()
        }
        self._reviews = {
            pr_number: tuple(entries) for pr_number, entries in (reviews or {}).items()
        }
        self._review_threads: dict[int, list[PRReviewThread]] = {
            pr_number: list(entries) for pr_number, entries in (review_threads or {}).items()
        }
        self._pr_changed_files = {
            pr_number: tuple(entries) for pr_number, entries in (pr_changed_files or {}).items()
        }
        self._pr_review_comments: dict[int, list[PRReviewComment]] = {
            pr_number: list(entries) for pr_number, entries in (pr_review_comments or {}).items()
        }
        self._prs_by_branch = prs_by_branch or {}
        self._prs = tuple(prs)
        self._lookup_failure = lookup_failure
        self._search_failure = search_failure
        self._merge_failure = merge_failure
        self._next_comment_id = 1
        self._next_reaction_id = 1

        self._resolved_thread_ids: list[str] = []
        self._unresolved_thread_ids: list[str] = []
        self._thread_replies: list[tuple[str, str]] = []
        self._comments: list[tuple[int, str]] = []
        self._created_reviews: list[tuple[int, tuple[PRInlineCommentInput, ...]]] = []
        self._updated_comments: list[tuple[int, str]] = []
        self._reactions: list[tuple[int, str]] = []
        self._merge_calls: list[tuple[int, str, bool, bool]] = []

    # -- PR queries --

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupMiss | PRGatewayFailure:
        if self._lookup_failure is not None:
            return self._lookup_failure
        pr = self._prs_by_branch.get(branch)
        if pr is None:
            return PRLookupMiss()
        return pr

    def search_prs(
        self, query: str, *, state: PRStateFilter
    ) -> tuple[PRSummary, ...] | PRGatewayFailure:
        if self._search_failure is not None:
            return self._search_failure
        if state == "all":
            scoped = self._prs
        else:
            scoped = tuple(pr for pr in self._prs if pr.state == state.upper())
        terms = [term.lower() for term in query.split() if term]
        if not terms:
            return scoped
        return tuple(pr for pr in scoped if any(term in pr.title.lower() for term in terms))

    def get_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        threads = self._review_threads.get(pr_number, [])
        if not include_resolved:
            threads = [thread for thread in threads if not thread.is_resolved]
        return tuple(threads)

    def get_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        return tuple(self._reviews.get(pr_number, ()))

    def get_pr_changed_files(self, pr_number: int) -> tuple[PRChangedFile, ...]:
        return tuple(self._pr_changed_files.get(pr_number, ()))

    def get_pr_review_comments(self, pr_number: int) -> tuple[PRReviewComment, ...]:
        return tuple(self._pr_review_comments.get(pr_number, ()))

    def get_pr_discussion_comments(self, pr_number: int) -> tuple[PRDiscussionComment, ...]:
        return tuple(self._discussion_comments.get(pr_number, ()))

    # -- PR mutations --

    def merge_pr(
        self,
        pr_number: int,
        *,
        match_head_commit: str,
        admin: bool,
        auto: bool,
    ) -> PRMergeOutcome | PRGatewayFailure:
        self._merge_calls.append((pr_number, match_head_commit, admin, auto))
        if self._merge_failure is not None:
            return self._merge_failure
        return PRMergeOutcome(number=pr_number, auto=auto)

    def resolve_review_thread(self, thread_id: str) -> PRReviewThreadState:
        self._resolved_thread_ids.append(thread_id)
        self._set_thread_resolution(thread_id, is_resolved=True)
        return PRReviewThreadState(thread_id=thread_id, is_resolved=True)

    def unresolve_review_thread(self, thread_id: str) -> PRReviewThreadState:
        self._unresolved_thread_ids.append(thread_id)
        self._set_thread_resolution(thread_id, is_resolved=False)
        return PRReviewThreadState(thread_id=thread_id, is_resolved=False)

    def add_review_thread_reply(self, thread_id: str, body: str) -> PRReviewComment:
        comment_id = self._next_comment_id
        self._next_comment_id += 1
        self._thread_replies.append((thread_id, body))
        reply = PRReviewComment(
            id=comment_id,
            body=body,
            author="github-actions[bot]",
            path="",
            line=None,
            created_at="",
        )
        self._append_reply_to_seeded_thread(thread_id, reply)
        return reply

    def create_pr_review(
        self, pr_number: int, comments: tuple[PRInlineCommentInput, ...]
    ) -> PRReview:
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
        review = PRReview(
            id=f"fake-review-{len(self._created_reviews)}",
            author="github-actions[bot]",
            state="COMMENTED",
            body="",
            submitted_at="",
        )
        self._reviews.setdefault(pr_number, ())
        self._reviews[pr_number] = (*self._reviews[pr_number], review)
        return review

    def add_pr_discussion_comment(self, pr_number: int, body: str) -> PRDiscussionComment:
        comment_id = self._next_comment_id
        self._next_comment_id += 1
        self._comments.append((pr_number, body))
        comment = PRDiscussionComment(
            id=comment_id,
            body=body,
            author="github-actions[bot]",
            url=f"https://github.com/fake/fake/pull/{pr_number}#issuecomment-{comment_id}",
        )
        self._discussion_comments.setdefault(pr_number, []).append(comment)
        return comment

    def find_pr_discussion_comment_by_marker(
        self, pr_number: int, marker: str, author_login: str
    ) -> PRDiscussionComment | None:
        for comment in self._discussion_comments.get(pr_number, ()):  # pragma: no branch
            if comment.author == author_login and marker in comment.body:
                return comment
        return None

    def update_pr_discussion_comment(self, comment_id: int, body: str) -> PRDiscussionComment:
        slot = self._find_pr_discussion_comment_slot(comment_id)
        if slot is None:
            raise KeyError(f"no fake PR discussion comment with id {comment_id}")

        comments, index = slot
        updated = replace(comments[index], body=body)
        comments[index] = updated
        self._updated_comments.append((comment_id, body))
        return updated

    def _find_pr_discussion_comment_slot(
        self, comment_id: int
    ) -> tuple[list[PRDiscussionComment], int] | None:
        for comments in self._discussion_comments.values():
            index = self._find_pr_discussion_comment_index(comments, comment_id)
            if index is not None:
                return comments, index
        return None

    @staticmethod
    def _find_pr_discussion_comment_index(
        comments: Sequence[PRDiscussionComment], comment_id: int
    ) -> int | None:
        for index, comment in enumerate(comments):
            if comment.id == comment_id:
                return index
        return None

    def add_pr_discussion_comment_reaction(self, comment_id: int, reaction: str) -> Reaction:
        reaction_id = self._next_reaction_id
        self._next_reaction_id += 1
        self._reactions.append((comment_id, reaction))
        return Reaction(id=reaction_id, comment_id=comment_id, content=reaction)

    def _set_thread_resolution(self, thread_id: str, *, is_resolved: bool) -> None:
        for _pr_number, threads in self._review_threads.items():
            for index, thread in enumerate(threads):
                if thread.id == thread_id:
                    threads[index] = replace(thread, is_resolved=is_resolved)
                    return

    def _append_reply_to_seeded_thread(self, thread_id: str, reply: PRReviewComment) -> None:
        for threads in self._review_threads.values():
            for index, thread in enumerate(threads):
                if thread.id == thread_id:
                    threads[index] = replace(thread, comments=(*thread.comments, reply))
                    return

    @property
    def resolved_thread_ids(self) -> tuple[str, ...]:
        return tuple(self._resolved_thread_ids)

    @property
    def unresolved_thread_ids(self) -> tuple[str, ...]:
        return tuple(self._unresolved_thread_ids)

    @property
    def thread_replies(self) -> tuple[tuple[str, str], ...]:
        return tuple(self._thread_replies)

    @property
    def comments(self) -> tuple[tuple[int, str], ...]:
        return tuple(self._comments)

    @property
    def created_reviews(self) -> tuple[tuple[int, tuple[PRInlineCommentInput, ...]], ...]:
        return tuple(self._created_reviews)

    @property
    def updated_comments(self) -> tuple[tuple[int, str], ...]:
        return tuple(self._updated_comments)

    @property
    def reactions(self) -> tuple[tuple[int, str], ...]:
        return tuple(self._reactions)

    @property
    def merge_calls(self) -> tuple[tuple[int, str, bool, bool], ...]:
        return tuple(self._merge_calls)
