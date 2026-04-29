"""Probe whether a branch-memory entry exists."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from brmem.gateway import (
    EntryRef,
    check_branch_name,
    check_namespace,
    ref_name_for_entry,
)
from brmem.gateway_access import (
    get_branch_memory_gateway,
    resolve_current_brmem_branch,
)
from brmem.key_validation import check_key
from brmem.validation import first_failure
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class CheckRequest:
    key: Annotated[
        str,
        click.Argument(["key"], type=click.STRING),
    ]
    namespace: Annotated[
        str | None,
        click.Option(
            ["--namespace"],
            type=click.STRING,
            default=None,
            help=("Entry namespace (e.g. 'objectives'). Omit for ad-hoc base entries."),
        ),
    ] = None
    branch: str | None = None
    at: str | None = None


@dataclass(frozen=True)
class CheckResult(JsonSerializable):
    namespace: str | None
    key: str
    branch: str
    ref_name: str
    target: str
    at: str | None
    head_sha: str | None
    head_date: str | None
    blob_sha: str | None
    size_bytes: int | None


def render_check(result: CheckResult) -> None:
    namespace_label = result.namespace if result.namespace is not None else "(base)"
    lines = [
        f"namespace: {namespace_label}",
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
) -> ClinkrExit[CheckResult]:
    branch = resolve_current_brmem_branch(ctx, request.branch)

    failure = first_failure(
        (
            "invalid_namespace",
            None if request.namespace is None else check_namespace(request.namespace),
        ),
        ("invalid_key", check_key(request.key)),
        ("invalid_branch_name", check_branch_name(branch)),
    )
    if failure is not None:
        error_type, message = failure
        raise ClinkrExit.failure(error_type=error_type, message=message)

    entry_ref = EntryRef(
        namespace=request.namespace,
        key=request.key,
        branch=branch,
        ref_name=ref_name_for_entry(request.namespace, request.key, branch),
    )

    target = request.at if request.at is not None else entry_ref.ref_name

    gateway = get_branch_memory_gateway(ctx)
    diagnostic = gateway.check(
        entry_ref.namespace,
        entry_ref.key,
        entry_ref.branch,
        at=request.at,
    )

    if diagnostic is None:
        absent = CheckResult(
            namespace=entry_ref.namespace,
            key=entry_ref.key,
            branch=entry_ref.branch,
            ref_name=entry_ref.ref_name,
            target=target,
            at=request.at,
            head_sha=None,
            head_date=None,
            blob_sha=None,
            size_bytes=None,
        )
        namespace_label = entry_ref.namespace if entry_ref.namespace is not None else "(base)"
        raise ClinkrExit.negative(
            absent,
            message=(
                f"not found: key={entry_ref.key} namespace={namespace_label} "
                f"branch={entry_ref.branch} at {target}"
            ),
        )

    return ClinkrExit.ok(
        CheckResult(
            namespace=entry_ref.namespace,
            key=entry_ref.key,
            branch=entry_ref.branch,
            ref_name=entry_ref.ref_name,
            target=target,
            at=request.at,
            head_sha=diagnostic.head_sha,
            head_date=diagnostic.head_date,
            blob_sha=diagnostic.blob_sha,
            size_bytes=diagnostic.size_bytes,
        )
    )
