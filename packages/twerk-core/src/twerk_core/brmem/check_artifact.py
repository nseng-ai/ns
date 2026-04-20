"""Probe whether an artifact path is present in a branch-memory entry."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway import (
    InvalidArtifactPathError,
    InvalidBranchNameError,
    InvalidKeyError,
    InvalidNamespaceError,
    ref_name_for_entry,
)
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class CheckArtifactRequest:
    path: Annotated[
        str,
        click.Argument(["path"], type=click.STRING),
    ]
    namespace: Annotated[
        str,
        click.Option(["--namespace"], required=True, type=click.STRING),
    ]
    key: Annotated[
        str,
        click.Option(["--key"], required=True, type=click.STRING),
    ]
    branch: str | None = None
    at: str | None = None


@dataclass(frozen=True)
class CheckArtifactResult:
    namespace: str
    key: str
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
            "namespace": self.namespace,
            "key": self.key,
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


def render_check_artifact(result: CheckArtifactResult) -> None:
    lines = [
        f"namespace: {result.namespace}",
        f"key: {result.key}",
        f"branch: {result.branch}",
        f"path: {result.path}",
        f"ref: {result.ref_name}",
        f"target: {result.target}",
        f"blob: {result.blob_sha}",
        f"size: {result.size_bytes}",
        f"last_commit: {result.last_commit_sha} ({result.last_commit_date})",
    ]
    click.echo("\n".join(lines))


@clinkr_operation(
    name="check-artifact",
    help="Check whether an artifact path is present in a branch-memory entry.",
    human_renderer=render_check_artifact,
)
def run_check_artifact(
    ctx: click.Context,
    request: CheckArtifactRequest,
) -> CheckArtifactResult | ClinkrCommandError:
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

    target = request.at if request.at is not None else ref_name

    gateway = get_branch_memory_gateway(ctx)
    try:
        diagnostic = gateway.check_artifact(
            request.namespace, request.key, branch, request.path, at=request.at
        )
    except InvalidNamespaceError as exc:
        return ClinkrCommandError(error_type="invalid_namespace", message=str(exc))
    except InvalidKeyError as exc:
        return ClinkrCommandError(error_type="invalid_key", message=str(exc))
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))
    except InvalidArtifactPathError as exc:
        return ClinkrCommandError(error_type="invalid_artifact_path", message=str(exc))

    if diagnostic is None:
        return CheckArtifactResult(
            namespace=request.namespace,
            key=request.key,
            branch=branch,
            path=request.path,
            ref_name=ref_name,
            target=target,
            exists=False,
            at=request.at,
            absent_message=(
                f"not found: {request.path} in namespace={request.namespace} "
                f"key={request.key} branch={branch} at {target}"
            ),
        )

    return CheckArtifactResult(
        namespace=request.namespace,
        key=request.key,
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
