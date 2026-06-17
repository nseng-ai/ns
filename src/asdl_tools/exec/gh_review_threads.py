"""Hidden GitHub exec operations for PR review threads."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRReviewComment, PRReviewThread, PRReviewThreadState
from asdl_tools.exec.context import load_asdl_exec_context


class ReviewThreadsRequest(ClinkrModel):
    pr_number: Annotated[
        int,
        click.Argument(["pr_number"], type=click.INT, required=True),
    ]
    include_resolved: Annotated[
        bool,
        click.Option(
            ["--include-resolved"],
            is_flag=True,
            default=False,
            help="Include already-resolved review threads.",
        ),
    ] = False
    thread_id: Annotated[
        tuple[str, ...],
        click.Option(
            ["--thread-id"],
            type=click.STRING,
            multiple=True,
            help="Only include the given GraphQL review-thread id. Repeatable.",
        ),
    ] = ()
    repo: Annotated[
        str | None,
        click.Option(
            ["--repo", "-R"],
            type=click.STRING,
            default=None,
            help="Repository in owner/name form. Defaults to gh's current repository context.",
        ),
    ] = None


class ResolveReviewThreadsRequest(ClinkrModel):
    thread_id: Annotated[
        tuple[str, ...],
        click.Argument(["thread_id"], type=click.STRING, nargs=-1, required=True),
    ]
    repo: Annotated[
        str | None,
        click.Option(
            ["--repo", "-R"],
            type=click.STRING,
            default=None,
            help="Reserved for consistency with other gh exec commands.",
        ),
    ] = None


class PRReviewCommentDto(ClinkrModel):
    id: int
    body: str
    author: str
    path: str
    line: int | None
    start_line: int | None
    created_at: str


class PRReviewThreadDto(ClinkrModel):
    id: str
    path: str
    line: int | None
    start_line: int | None
    is_resolved: bool
    is_outdated: bool
    comments: tuple[PRReviewCommentDto, ...]


class ReviewThreadsResult(ClinkrModel):
    pr_number: int
    include_resolved: bool
    requested_thread_ids: tuple[str, ...]
    threads: tuple[PRReviewThreadDto, ...]


class PRReviewThreadStateDto(ClinkrModel):
    thread_id: str
    is_resolved: bool


class ResolveReviewThreadsResult(ClinkrModel):
    states: tuple[PRReviewThreadStateDto, ...]


def render_review_threads(result: ReviewThreadsResult) -> None:
    if not result.threads:
        click.echo("No matching PR review threads.")
        return
    for thread in result.threads:
        status = "resolved" if thread.is_resolved else "unresolved"
        line = "?" if thread.line is None else str(thread.line)
        click.echo(f"{thread.id} {status} {thread.path}:{line} comments={len(thread.comments)}")


def render_resolve_review_threads(result: ResolveReviewThreadsResult) -> None:
    for state in result.states:
        status = "resolved" if state.is_resolved else "unresolved"
        click.echo(f"{state.thread_id} {status}")


@clinkr_operation(
    name="review-threads",
    help="List PR review threads without writing GraphQL by hand.",
    human_renderer=render_review_threads,
)
def run_review_threads(
    ctx: click.Context,
    request: ReviewThreadsRequest,
) -> ClinkrExit[ReviewThreadsResult]:
    gateway = load_asdl_exec_context(ctx).pr_gateway(request.repo)
    threads = gateway.get_review_threads(
        request.pr_number,
        include_resolved=request.include_resolved,
    )
    requested = set(request.thread_id)
    if requested:
        threads = tuple(thread for thread in threads if thread.id in requested)
    return ClinkrExit.ok(
        ReviewThreadsResult(
            pr_number=request.pr_number,
            include_resolved=request.include_resolved,
            requested_thread_ids=request.thread_id,
            threads=tuple(_thread_dto(thread) for thread in threads),
        )
    )


@clinkr_operation(
    name="resolve-review-threads",
    help="Resolve one or more PR review threads by GraphQL thread id.",
    human_renderer=render_resolve_review_threads,
)
def run_resolve_review_threads(
    ctx: click.Context,
    request: ResolveReviewThreadsRequest,
) -> ClinkrExit[ResolveReviewThreadsResult]:
    gateway = load_asdl_exec_context(ctx).pr_gateway(request.repo)
    states = tuple(
        _state_dto(gateway.resolve_review_thread(thread_id)) for thread_id in request.thread_id
    )
    return ClinkrExit.ok(ResolveReviewThreadsResult(states=states))


def _thread_dto(thread: PRReviewThread) -> PRReviewThreadDto:
    return PRReviewThreadDto(
        id=thread.id,
        path=thread.path,
        line=thread.line,
        start_line=thread.start_line,
        is_resolved=thread.is_resolved,
        is_outdated=thread.is_outdated,
        comments=tuple(_comment_dto(comment) for comment in thread.comments),
    )


def _comment_dto(comment: PRReviewComment) -> PRReviewCommentDto:
    return PRReviewCommentDto(
        id=comment.id,
        body=comment.body,
        author=comment.author,
        path=comment.path,
        line=comment.line,
        start_line=comment.start_line,
        created_at=comment.created_at,
    )


def _state_dto(state: PRReviewThreadState) -> PRReviewThreadStateDto:
    return PRReviewThreadStateDto(thread_id=state.thread_id, is_resolved=state.is_resolved)
