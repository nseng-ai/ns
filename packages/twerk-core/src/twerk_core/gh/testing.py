"""Test utilities for the GitHub gateway."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

from twerk_core.gh.check_runs_gateway import CheckRunsGateway
from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.types import (
    CheckRun,
    CheckRunAnnotation,
    CheckRunOutput,
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
        self._prs_by_branch = prs_by_branch or {}
        self._raise_on = dict(raise_on or {})
        self._next_comment_id = 1
        self._next_reaction_id = 1

        # Mutation tracking — public-but-underscored, read in tests for assertions.
        self._resolved_thread_ids: list[str] = []
        self._unresolved_thread_ids: list[str] = []
        self._thread_replies: list[tuple[str, str]] = []
        self._comments: list[tuple[int, str]] = []
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


# The per-request annotation cap the real gateway has to respect. The fake
# mirrors the chunking so tests can assert the real gateway's batch count
# via ``_append_batches`` without having to reason about the REST surface.
_FAKE_ANNOTATIONS_PER_REQUEST = 50


class FakeCheckRunsGateway(CheckRunsGateway):
    """In-memory fake implementation of CheckRunsGateway.

    Constructor-only configuration with mutation tracking for assertions.
    The fake mirrors the real gateway's 50-annotations-per-request chunking
    so tests can assert on the number of batches without exercising the
    REST surface.

    Key shape: check runs are stored by ``(head_sha, name)``. ``upsert`` on
    an existing key replaces the stored check run, matching the real
    gateway's behavior for reruns against the same head SHA.
    """

    def __init__(
        self,
        *,
        check_runs: Sequence[CheckRun] = (),
        annotations_by_id: dict[int, Sequence[CheckRunAnnotation]] | None = None,
    ) -> None:
        self._check_runs: dict[tuple[str, str], CheckRun] = {
            (run.head_sha, run.name): run for run in check_runs
        }
        self._annotations_by_id: dict[int, list[CheckRunAnnotation]] = {
            run_id: list(entries) for run_id, entries in (annotations_by_id or {}).items()
        }
        self._next_check_run_id = max((run.id for run in check_runs), default=0) + 1

        # Mutation tracking — public-but-underscored, read in tests for
        # assertions. ``_upserted_calls`` records each top-level upsert with
        # the annotation total. ``_upserted_outputs`` records the output
        # body passed to each upsert call (parallel index with
        # ``_upserted_calls``). ``_append_batches`` records the size of
        # every REST batch the real gateway would have sent, including the
        # initial POST/PATCH body's chunk.
        self._upserted_calls: list[tuple[str, str, int]] = []
        self._upserted_outputs: list[CheckRunOutput] = []
        self._append_batches: list[int] = []

    def find_check_run(self, head_sha: str, name: str) -> CheckRun | None:
        return self._check_runs.get((head_sha, name))

    def list_check_runs(
        self,
        head_sha: str,
        *,
        name_prefix: str | None = None,
    ) -> tuple[CheckRun, ...]:
        runs = [run for (sha, _name), run in self._check_runs.items() if sha == head_sha]
        if name_prefix is not None:
            runs = [run for run in runs if run.name.startswith(name_prefix)]
        return tuple(runs)

    def upsert_check_run(
        self,
        *,
        head_sha: str,
        name: str,
        output: CheckRunOutput,
        annotations: Sequence[CheckRunAnnotation],
        conclusion: Literal["neutral"] = "neutral",
    ) -> CheckRun:
        existing = self._check_runs.get((head_sha, name))
        if existing is None:
            check_run_id = self._next_check_run_id
            self._next_check_run_id += 1
            html_url = f"https://github.com/fake/fake/runs/{check_run_id}?check_suite_focus=true"
        else:
            check_run_id = existing.id
            html_url = existing.html_url

        check_run = CheckRun(
            id=check_run_id,
            name=name,
            head_sha=head_sha,
            status="completed",
            conclusion=conclusion,
            html_url=html_url,
        )
        self._check_runs[(head_sha, name)] = check_run

        annotation_list = list(annotations)
        self._annotations_by_id[check_run_id] = list(annotation_list)
        self._upserted_calls.append((head_sha, name, len(annotation_list)))
        self._upserted_outputs.append(output)

        # Record the batch sizes the real gateway would have sent so tests
        # can assert pagination behavior without exercising REST.
        if not annotation_list:
            self._append_batches.append(0)
        else:
            for i in range(0, len(annotation_list), _FAKE_ANNOTATIONS_PER_REQUEST):
                self._append_batches.append(
                    len(annotation_list[i : i + _FAKE_ANNOTATIONS_PER_REQUEST])
                )

        return check_run

    def list_annotations(self, check_run_id: int) -> tuple[CheckRunAnnotation, ...]:
        return tuple(self._annotations_by_id.get(check_run_id, ()))
