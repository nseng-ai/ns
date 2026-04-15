"""Add a discussion comment to a PR."""

import dataclasses
import sys
from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import IssueComment
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


def _resolve_body(ctx: click.Context, param: click.Parameter, value: str) -> str:
    """Resolve the body argument. A value of ``-`` means read from stdin.

    The twerk-pr-address skill uses this with a shell heredoc so that
    multi-line bodies survive shell quoting without escape-sequence mangling.
    """
    if value == "-":
        return sys.stdin.read()
    return value


@dataclass(frozen=True)
class AddIssueCommentRequest:
    pr_number: int
    body: Annotated[str, click.Argument(["body"], callback=_resolve_body)]


@dataclass(frozen=True)
class AddIssueCommentResult:
    comment: IssueComment

    def to_json_dict(self) -> dict[str, Any]:
        return {"comment": dataclasses.asdict(self.comment)}


@clinkr_operation(
    name="add-issue-comment",
    help="Add a discussion comment to a PR.",
)
def run_add_issue_comment(
    ctx: click.Context,
    request: AddIssueCommentRequest,
) -> AddIssueCommentResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway(ctx)
    comment = gateway.add_comment(request.pr_number, request.body)
    return AddIssueCommentResult(comment=comment)
