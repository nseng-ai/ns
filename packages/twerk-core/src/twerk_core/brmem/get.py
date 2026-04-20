"""Read content from an artifact path inside a branch-memory entry."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.brmem.validation import validate_entry_artifact_request
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class GetArtifactRequest:
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
class GetArtifactResult:
    namespace: str
    key: str
    branch: str
    path: str
    content: str
    ref_name: str
    target: str
    at: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "key": self.key,
            "branch": self.branch,
            "path": self.path,
            "content": self.content,
            "ref_name": self.ref_name,
            "target": self.target,
            "at": self.at,
        }


def render_get_artifact(result: GetArtifactResult) -> None:
    click.echo(result.content, nl=not result.content.endswith("\n"))


@clinkr_operation(
    name="get",
    help="Read content from an artifact path inside a branch-memory entry.",
    human_renderer=render_get_artifact,
)
def run_get_artifact(
    ctx: click.Context,
    request: GetArtifactRequest,
) -> GetArtifactResult | ClinkrCommandError:
    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return branch

    entry_ref = validate_entry_artifact_request(
        request.namespace,
        request.key,
        branch,
        request.path,
    )
    if isinstance(entry_ref, ClinkrCommandError):
        return entry_ref

    gateway = get_branch_memory_gateway(ctx)
    target = request.at if request.at is not None else entry_ref.ref_name
    content = gateway.get_artifact(
        entry_ref.namespace,
        entry_ref.key,
        entry_ref.branch,
        request.path,
        at=request.at,
    )

    if content is None:
        return ClinkrCommandError(
            error_type="branch_memory_missing",
            message=(
                f"No content at path {request.path} for "
                f"{entry_ref.namespace}/{entry_ref.key} on branch {entry_ref.branch} at {target}. "
                f"Inspect with: git ls-tree -r {target}"
            ),
        )

    return GetArtifactResult(
        namespace=entry_ref.namespace,
        key=entry_ref.key,
        branch=entry_ref.branch,
        path=request.path,
        content=content,
        ref_name=entry_ref.ref_name,
        target=target,
        at=request.at,
    )
