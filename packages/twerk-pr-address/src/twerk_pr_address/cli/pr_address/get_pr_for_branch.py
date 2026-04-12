"""Look up the open PR for a branch."""

from dataclasses import dataclass
from typing import Any

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_pr_address.cli.pr_address._gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class GetPRForBranchRequest:
    branch: str


@dataclass(frozen=True)
class GetPRForBranchResult:
    found: bool
    number: int | None = None
    title: str | None = None
    url: str | None = None
    head_ref_name: str | None = None
    base_ref_name: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        if not self.found:
            return {"found": False}
        return {
            "found": True,
            "number": self.number,
            "title": self.title,
            "url": self.url,
            "head_ref_name": self.head_ref_name,
            "base_ref_name": self.base_ref_name,
        }


@clinkr_operation(
    name="get-pr-for-branch",
    help="Look up the open PR for a branch.",
)
def run_get_pr_for_branch(
    request: GetPRForBranchRequest,
) -> GetPRForBranchResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway()
    pr = gateway.get_pr_for_branch(request.branch)
    if pr is None:
        return GetPRForBranchResult(found=False)
    return GetPRForBranchResult(
        found=True,
        number=pr.number,
        title=pr.title,
        url=pr.url,
        head_ref_name=pr.head_ref_name,
        base_ref_name=pr.base_ref_name,
    )
