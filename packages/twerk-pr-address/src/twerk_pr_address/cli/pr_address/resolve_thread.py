"""Resolve a PR review thread."""

from dataclasses import dataclass
from typing import Any

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_pr_address.cli.pr_address._gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class ResolveThreadRequest:
    thread_id: str


@dataclass(frozen=True)
class ResolveThreadResult:
    thread_id: str
    was_already_resolved: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "thread_id": self.thread_id,
            "was_already_resolved": self.was_already_resolved,
        }


@clinkr_operation(
    name="resolve-thread",
    help="Resolve a PR review thread by its GraphQL node ID.",
)
def run_resolve_thread(
    request: ResolveThreadRequest,
) -> ResolveThreadResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway()
    result = gateway.resolve_review_thread(request.thread_id)
    return ResolveThreadResult(
        thread_id=result.thread_id,
        was_already_resolved=result.was_already_resolved,
    )
