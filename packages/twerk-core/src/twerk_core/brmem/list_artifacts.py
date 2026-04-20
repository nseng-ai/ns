"""List artifact paths inside a branch-memory entry."""

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
class ListArtifactsRequest:
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
class ListArtifactsResult:
    namespace: str
    key: str
    branch: str
    ref_name: str
    target: str
    artifacts: list[str]
    at: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "key": self.key,
            "branch": self.branch,
            "ref_name": self.ref_name,
            "target": self.target,
            "artifacts": list(self.artifacts),
            "at": self.at,
        }


def render_list_artifacts(result: ListArtifactsResult) -> None:
    for path in result.artifacts:
        click.echo(path)


@clinkr_operation(
    name="list-artifacts",
    help="List artifact paths inside a branch-memory entry.",
    human_renderer=render_list_artifacts,
)
def run_list_artifacts(
    ctx: click.Context,
    request: ListArtifactsRequest,
) -> ListArtifactsResult | ClinkrCommandError:
    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return branch

    gateway = get_branch_memory_gateway(ctx)

    try:
        ref_name = ref_name_for_entry(request.namespace, request.key, branch)
    except InvalidNamespaceError as exc:
        return ClinkrCommandError(error_type="invalid_namespace", message=str(exc))
    except InvalidKeyError as exc:
        return ClinkrCommandError(error_type="invalid_key", message=str(exc))
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))

    target = request.at if request.at is not None else ref_name

    try:
        artifacts = gateway.list_artifacts(request.namespace, request.key, branch, at=request.at)
    except InvalidNamespaceError as exc:
        return ClinkrCommandError(error_type="invalid_namespace", message=str(exc))
    except InvalidKeyError as exc:
        return ClinkrCommandError(error_type="invalid_key", message=str(exc))
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))

    return ListArtifactsResult(
        namespace=request.namespace,
        key=request.key,
        branch=branch,
        ref_name=ref_name,
        target=target,
        artifacts=artifacts,
        at=request.at,
    )
