"""Unresolve a PR review thread."""

from dataclasses import dataclass
from typing import Any

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_pr_address.cli.pr_address._gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class UnresolveThreadRequest:
    thread_id: str


@dataclass(frozen=True)
class UnresolveThreadResult:
    thread_id: str
    was_already_unresolved: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "thread_id": self.thread_id,
            "was_already_unresolved": self.was_already_unresolved,
        }


@clinkr_operation(
    name="unresolve-thread",
    help="Unresolve (reopen) a PR review thread by its GraphQL node ID.",
)
def run_unresolve_thread(
    request: UnresolveThreadRequest,
) -> UnresolveThreadResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway()
    result = gateway.unresolve_review_thread(request.thread_id)
    return UnresolveThreadResult(
        thread_id=result.thread_id,
        was_already_unresolved=result.was_already_unresolved,
    )
