"""Probe whether a branch has a brmem ref."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway import (
    InvalidBranchNameError,
    encode_branch_name,
    ref_name_for_branch,
)
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class CheckBranchRequest:
    branch: Annotated[
        str | None,
        click.Argument(["branch"], required=False),
    ] = None


@dataclass(frozen=True)
class CheckBranchResult:
    branch: str
    encoded: str
    ref_name: str
    exists: bool
    head_sha: str | None = None
    head_date: str | None = None
    path_count: int | None = None
    absent_message: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "encoded": self.encoded,
            "ref_name": self.ref_name,
            "exists": self.exists,
            "head_sha": self.head_sha,
            "head_date": self.head_date,
            "path_count": self.path_count,
        }


def render_check_branch(result: CheckBranchResult) -> None:
    lines = [
        f"branch: {result.branch}",
        f"encoded: {result.encoded}",
        f"ref: {result.ref_name}",
        f"head: {result.head_sha} ({result.head_date})",
        f"path_count: {result.path_count}",
    ]
    click.echo("\n".join(lines))


@clinkr_operation(
    name="check",
    help="Check whether a branch has a brmem ref.",
    human_renderer=render_check_branch,
)
def run_check_branch(
    ctx: click.Context,
    request: CheckBranchRequest,
) -> ClinkrExit[CheckBranchResult]:
    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return ClinkrExit.fail(
            error_type=branch.error_type,
            message=branch.message,
            exit_code=2,
        )

    try:
        encoded = encode_branch_name(branch)
        ref_name = ref_name_for_branch(branch)
    except InvalidBranchNameError as exc:
        return ClinkrExit.fail(
            error_type="invalid_branch_name",
            message=str(exc),
            exit_code=2,
        )

    gateway = get_branch_memory_gateway(ctx)
    try:
        diagnostic = gateway.check_branch(branch)
    except InvalidBranchNameError as exc:
        return ClinkrExit.fail(
            error_type="invalid_branch_name",
            message=str(exc),
            exit_code=2,
        )

    if diagnostic is None:
        return ClinkrExit.negative(
            CheckBranchResult(
                branch=branch,
                encoded=encoded,
                ref_name=ref_name,
                exists=False,
                absent_message=f"not found: no brmem ref for branch {branch}",
            ),
            exit_code=1,
        )

    return ClinkrExit.ok(
        CheckBranchResult(
            branch=branch,
            encoded=encoded,
            ref_name=ref_name,
            exists=True,
            head_sha=diagnostic.head_sha,
            head_date=diagnostic.head_date,
            path_count=diagnostic.path_count,
        )
    )
