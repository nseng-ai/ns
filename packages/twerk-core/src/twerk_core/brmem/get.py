"""Read content from a branch-memory entry."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway import (
    EntryRef,
    check_branch_name,
    check_namespace,
    ref_name_for_entry,
)
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, get_git_gateway
from twerk_core.brmem.key_validation import check_key
from twerk_core.brmem.validation import first_failure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead, GitCommandFailure


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
    if request.branch is not None:
        branch = request.branch
    else:
        match get_git_gateway(ctx).get_current_branch(Path.cwd()):
            case GitCommandFailure() as failure:
                return ClinkrExit.failure(error_type="git_failed", message=failure.message)
            case DetachedHead():
                return ClinkrExit.failure(
                    error_type="detached_head",
                    message="Detached HEAD: brmem requires a checked-out branch.",
                )
            case str() as current_branch:
                branch = current_branch

    failure = first_failure(
        ("invalid_namespace", check_namespace(request.namespace)),
        ("invalid_key", check_key(request.key)),
        ("invalid_branch_name", check_branch_name(branch)),
    )
    if failure is not None:
        error_type, message = failure
        return ClinkrExit.failure(error_type=error_type, message=message)

    entry_ref = EntryRef(
        namespace=request.namespace,
        key=request.key,
        branch=branch,
        ref_name=ref_name_for_entry(request.namespace, request.key, branch),
    )

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
