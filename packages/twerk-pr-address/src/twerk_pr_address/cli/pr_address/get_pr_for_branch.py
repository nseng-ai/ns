"""Look up the open PR for a branch."""

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRLookupError, PRState
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway


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
    state: PRState | None = None
    error: str | None = None
    returncode: int | None = None

    def to_json_dict(self) -> dict[str, Any]:
        if not self.found:
            d: dict[str, Any] = {"found": False}
            if self.error is not None:
                d["error"] = self.error
            if self.returncode is not None:
                d["returncode"] = self.returncode
            return d
        return {
            "found": True,
            "number": self.number,
            "title": self.title,
            "url": self.url,
            "head_ref_name": self.head_ref_name,
            "base_ref_name": self.base_ref_name,
            "state": self.state,
        }


@clinkr_operation(
    name="get-pr-for-branch",
    help="Look up the open PR for a branch.",
)
def run_get_pr_for_branch(
    ctx: click.Context,
    request: GetPRForBranchRequest,
) -> GetPRForBranchResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway(ctx)
    result = gateway.get_pr_for_branch(request.branch)
    if isinstance(result, PRLookupError):
        return GetPRForBranchResult(
            found=False,
            error=result.stderr,
            returncode=result.returncode,
        )
    return GetPRForBranchResult(
        found=True,
        number=result.number,
        title=result.title,
        url=result.url,
        head_ref_name=result.head_ref_name,
        base_ref_name=result.base_ref_name,
        state=result.state,
    )
