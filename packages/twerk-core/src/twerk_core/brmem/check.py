"""Probe whether a path is present in branch memory."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.brmem.gateway import (
    InvalidBranchNameError,
    InvalidMemoryPathError,
    ref_name_for_branch,
)
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class CheckBranchMemoryRequest:
    path: str
    branch: str | None = None
    at: str | None = None


@dataclass(frozen=True)
class CheckBranchMemoryResult:
    branch: str
    path: str
    ref_name: str
    target: str
    exists: bool
    at: str | None = None
    blob_sha: str | None = None
    size_bytes: int | None = None
    last_commit_sha: str | None = None
    last_commit_date: str | None = None
    absent_message: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "path": self.path,
            "ref_name": self.ref_name,
            "target": self.target,
            "exists": self.exists,
            "at": self.at,
            "blob_sha": self.blob_sha,
            "size_bytes": self.size_bytes,
            "last_commit_sha": self.last_commit_sha,
            "last_commit_date": self.last_commit_date,
        }


def render_check_branch_memory(result: CheckBranchMemoryResult) -> None:
    lines = [
        f"path: {result.path}",
        f"branch: {result.branch}",
        f"ref: {result.ref_name}",
        f"target: {result.target}",
        f"blob: {result.blob_sha}",
        f"size: {result.size_bytes}",
        f"last_commit: {result.last_commit_sha} ({result.last_commit_date})",
    ]
    click.echo("\n".join(lines))


@clinkr_operation(
    name="check",
    help="Check whether a path is present in branch memory.",
    human_renderer=render_check_branch_memory,
)
def run_check_branch_memory(
    ctx: click.Context,
    request: CheckBranchMemoryRequest,
) -> CheckBranchMemoryResult | ClinkrCommandError:
    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return branch

    try:
        ref_name = ref_name_for_branch(branch)
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))

    target = request.at if request.at is not None else ref_name

    gateway = get_branch_memory_gateway(ctx)
    try:
        diagnostic = gateway.check_path(branch, request.path, at=request.at)
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))
    except InvalidMemoryPathError as exc:
        return ClinkrCommandError(error_type="invalid_memory_path", message=str(exc))

    if diagnostic is None:
        return CheckBranchMemoryResult(
            branch=branch,
            path=request.path,
            ref_name=ref_name,
            target=target,
            exists=False,
            at=request.at,
            absent_message=(f"not found: {request.path} in branch {branch} at {target}"),
        )

    return CheckBranchMemoryResult(
        branch=branch,
        path=request.path,
        ref_name=ref_name,
        target=target,
        exists=True,
        at=request.at,
        blob_sha=diagnostic.blob_sha,
        size_bytes=diagnostic.size_bytes,
        last_commit_sha=diagnostic.last_commit_sha,
        last_commit_date=diagnostic.last_commit_date,
    )
