"""Read content from a branch-memory entry."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.brmem.validation import validate_entry_ref
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class GetRequest:
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
class GetResult:
    namespace: str
    key: str
    branch: str
    content: str
    ref_name: str
    target: str
    at: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "key": self.key,
            "branch": self.branch,
            "content": self.content,
            "ref_name": self.ref_name,
            "target": self.target,
            "at": self.at,
        }


def render_get(result: GetResult) -> None:
    click.echo(result.content, nl=not result.content.endswith("\n"))


@clinkr_operation(
    name="get",
    help="Read content from a branch-memory entry.",
    human_renderer=render_get,
)
def run_get(
    ctx: click.Context,
    request: GetRequest,
) -> ClinkrExit[GetResult]:
    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return ClinkrExit.failure(error_type=branch.error_type, message=branch.message)

    entry_ref = validate_entry_ref(request.namespace, request.key, branch)
    if isinstance(entry_ref, ClinkrCommandError):
        return ClinkrExit.failure(error_type=entry_ref.error_type, message=entry_ref.message)

    gateway = get_branch_memory_gateway(ctx)
    target = request.at if request.at is not None else entry_ref.ref_name
    content = gateway.get(
        entry_ref.namespace,
        entry_ref.key,
        entry_ref.branch,
        at=request.at,
    )

    if content is None:
        return ClinkrExit.failure(
            error_type="branch_memory_missing",
            message=(
                f"No content for key {request.key} in namespace {entry_ref.namespace} "
                f"on branch {entry_ref.branch} at {target}. "
                f"Inspect with: git show {target}:content"
            ),
        )

    return ClinkrExit.ok(
        GetResult(
            namespace=entry_ref.namespace,
            key=entry_ref.key,
            branch=entry_ref.branch,
            content=content,
            ref_name=entry_ref.ref_name,
            target=target,
            at=request.at,
        )
    )
