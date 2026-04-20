"""Probe whether a branch-memory entry exists."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.brmem.validation import validate_entry_ref
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class CheckRequest:
    key: Annotated[
        str,
        click.Argument(["key"], type=click.STRING),
    ]
    namespace: Annotated[
        str,
        click.Option(["--namespace"], required=True, type=click.STRING),
    ]
    branch: str | None = None
    at: str | None = None


@dataclass(frozen=True)
class CheckResult:
    namespace: str
    key: str
    branch: str
    ref_name: str
    target: str
    exists: bool
    at: str | None = None
    head_sha: str | None = None
    head_date: str | None = None
    blob_sha: str | None = None
    size_bytes: int | None = None
    absent_message: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "key": self.key,
            "branch": self.branch,
            "ref_name": self.ref_name,
            "target": self.target,
            "exists": self.exists,
            "at": self.at,
            "head_sha": self.head_sha,
            "head_date": self.head_date,
            "blob_sha": self.blob_sha,
            "size_bytes": self.size_bytes,
        }


def render_check(result: CheckResult) -> None:
    lines = [
        f"namespace: {result.namespace}",
        f"key: {result.key}",
        f"branch: {result.branch}",
        f"ref: {result.ref_name}",
        f"target: {result.target}",
        f"head: {result.head_sha} ({result.head_date})",
        f"blob: {result.blob_sha}",
        f"size: {result.size_bytes}",
    ]
    click.echo("\n".join(lines))


@clinkr_operation(
    name="check",
    help="Check whether a branch-memory entry exists.",
    human_renderer=render_check,
)
def run_check(
    ctx: click.Context,
    request: CheckRequest,
) -> CheckResult | ClinkrCommandError:
    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return branch

    entry_ref = validate_entry_ref(request.namespace, request.key, branch)
    if isinstance(entry_ref, ClinkrCommandError):
        return entry_ref

    target = request.at if request.at is not None else entry_ref.ref_name

    gateway = get_branch_memory_gateway(ctx)
    diagnostic = gateway.check(
        entry_ref.namespace,
        entry_ref.key,
        entry_ref.branch,
        at=request.at,
    )

    if diagnostic is None:
        return CheckResult(
            namespace=entry_ref.namespace,
            key=entry_ref.key,
            branch=entry_ref.branch,
            ref_name=entry_ref.ref_name,
            target=target,
            exists=False,
            at=request.at,
            absent_message=(
                f"not found: key={entry_ref.key} namespace={entry_ref.namespace} "
                f"branch={entry_ref.branch} at {target}"
            ),
        )

    return CheckResult(
        namespace=entry_ref.namespace,
        key=entry_ref.key,
        branch=entry_ref.branch,
        ref_name=entry_ref.ref_name,
        target=target,
        exists=True,
        at=request.at,
        head_sha=diagnostic.head_sha,
        head_date=diagnostic.head_date,
        blob_sha=diagnostic.blob_sha,
        size_bytes=diagnostic.size_bytes,
    )
