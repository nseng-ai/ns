"""Look up the open PR for a branch."""

from typing import Any

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRGatewayFailure, PRLookupMiss, PRState
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


def _gateway_failure_message(prefix: str, failure: PRGatewayFailure) -> str:
    detail = failure.stderr or failure.stdout or f"exit code {failure.returncode}"
    return f"{prefix}: {detail}"


class GetPRForBranchRequest(ClinkrModel):
    branch: str


class GetPRForBranchResult(ClinkrModel):
    found: bool
    number: int | None = None
    title: str | None = None
    url: str | None = None
    head_ref_name: str | None = None
    base_ref_name: str | None = None
    state: PRState | None = None
    error: str | None = None
    returncode: int | None = None

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
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
) -> ClinkrExit[GetPRForBranchResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    result = pr_address_context.pr_gateway.get_pr_for_branch(request.branch)
    if isinstance(result, PRGatewayFailure):
        raise ClinkrFailure(
            error_type="pr_gateway_failure",
            message=_gateway_failure_message(
                f"Failed to look up PR for branch {request.branch!r}",
                result,
            ),
        )
    if isinstance(result, PRLookupMiss):
        return ClinkrExit.ok(
            GetPRForBranchResult(
                found=False,
                error=result.stderr,
                returncode=result.returncode,
            )
        )
    return ClinkrExit.ok(
        GetPRForBranchResult(
            found=True,
            number=result.number,
            title=result.title,
            url=result.url,
            head_ref_name=result.head_ref_name,
            base_ref_name=result.base_ref_name,
            state=result.state,
        )
    )
