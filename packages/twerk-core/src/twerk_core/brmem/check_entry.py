"""Probe whether a branch-memory entry ref exists right now."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway import (
    InvalidBranchNameError,
    InvalidKeyError,
    InvalidNamespaceError,
    ref_name_for_entry,
)
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class CheckEntryRequest:
    namespace: Annotated[
        str,
        click.Option(["--namespace"], required=True, type=click.STRING),
    ]
    key: Annotated[
        str,
        click.Option(["--key"], required=True, type=click.STRING),
    ]
    branch: str | None = None


@dataclass(frozen=True)
class CheckEntryResult:
    namespace: str
    key: str
    branch: str
    ref_name: str
    exists: bool
    head_sha: str | None = None
    head_date: str | None = None
    artifact_count: int | None = None
    absent_message: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "key": self.key,
            "branch": self.branch,
            "ref_name": self.ref_name,
            "exists": self.exists,
            "head_sha": self.head_sha,
            "head_date": self.head_date,
            "artifact_count": self.artifact_count,
        }


def render_check_entry(result: CheckEntryResult) -> None:
    lines = [
        f"namespace: {result.namespace}",
        f"key: {result.key}",
        f"branch: {result.branch}",
        f"ref: {result.ref_name}",
        f"head: {result.head_sha} ({result.head_date})",
        f"artifact_count: {result.artifact_count}",
    ]
    click.echo("\n".join(lines))


@clinkr_operation(
    name="check-entry",
    help="Check whether a branch-memory entry ref exists.",
    human_renderer=render_check_entry,
)
def run_check_entry(
    ctx: click.Context,
    request: CheckEntryRequest,
) -> CheckEntryResult | ClinkrCommandError:
    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return branch

    try:
        ref_name = ref_name_for_entry(request.namespace, request.key, branch)
    except InvalidNamespaceError as exc:
        return ClinkrCommandError(error_type="invalid_namespace", message=str(exc))
    except InvalidKeyError as exc:
        return ClinkrCommandError(error_type="invalid_key", message=str(exc))
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))

    gateway = get_branch_memory_gateway(ctx)
    try:
        diagnostic = gateway.check_entry(request.namespace, request.key, branch)
    except InvalidNamespaceError as exc:
        return ClinkrCommandError(error_type="invalid_namespace", message=str(exc))
    except InvalidKeyError as exc:
        return ClinkrCommandError(error_type="invalid_key", message=str(exc))
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))

    if diagnostic is None:
        return CheckEntryResult(
            namespace=request.namespace,
            key=request.key,
            branch=branch,
            ref_name=ref_name,
            exists=False,
            absent_message=(
                f"no entry: namespace={request.namespace} key={request.key} "
                f"branch={branch} ref={ref_name}"
            ),
        )

    return CheckEntryResult(
        namespace=request.namespace,
        key=request.key,
        branch=branch,
        ref_name=ref_name,
        exists=True,
        head_sha=diagnostic.head_sha,
        head_date=diagnostic.head_date,
        artifact_count=diagnostic.artifact_count,
    )
