"""Add a reaction to a comment."""

from dataclasses import dataclass
from typing import Any

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_pr_address.cli.pr_address._gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class AddReactionRequest:
    comment_id: int
    reaction: str


@dataclass(frozen=True)
class AddReactionResult:
    id: int
    comment_id: int
    content: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "comment_id": self.comment_id,
            "content": self.content,
        }


@clinkr_operation(
    name="add-reaction",
    help="Add a reaction to a comment.",
)
def run_add_reaction(
    request: AddReactionRequest,
) -> AddReactionResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway()
    result = gateway.add_reaction(request.comment_id, request.reaction)
    return AddReactionResult(
        id=result.id,
        comment_id=result.comment_id,
        content=result.content,
    )
