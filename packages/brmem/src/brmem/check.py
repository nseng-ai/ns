"""Probe whether a Branch Memory Entry exists."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.context import load_brmem_context
from brmem.key_validation import check_key
from brmem.ref_layout import (
    EntryRef,
    check_branch_name,
    check_namespace,
    namespace_value_label,
    normalize_namespace_option,
    ref_name_for_entry,
)
from brmem.validation import first_failure


class CheckRequest(ClinkrModel):
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
            help=("Namespace (e.g. 'notes'). Omit for ad-hoc base Entries."),
        ),
    ] = None
    branch: str | None = None
    at: str | None = None


class CheckResult(ClinkrModel):
    namespace: str
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
    namespace_label = namespace_value_label(result.namespace)
    lines = [
        f"Namespace: {namespace_label}",
        f"Entry Key: {result.key}",
        f"Branch: {result.branch}",
        f"Entry Locator: {result.ref_name}",
        f"Target: {result.target}",
        f"Head: {result.head_sha} ({result.head_date})",
        f"Blob: {result.blob_sha}",
        f"Size: {result.size_bytes}",
    ]
    click.echo("\n".join(lines))


@clinkr_operation(
    name="check",
    help="Check whether a Branch Memory Entry exists.",
    human_renderer=render_check,
)
def run_check(
    ctx: click.Context,
    request: CheckRequest,
) -> ClinkrExit[CheckResult]:
    brmem_context = load_brmem_context(ctx)
    branch = (
        request.branch
        if request.branch is not None
        else Ensure.ideal_state(brmem_context.git_gateway.get_current_branch(Path.cwd()))
    )

    namespace = normalize_namespace_option(request.namespace)

    failure = first_failure(
        ("invalid_namespace", check_namespace(namespace)),
        ("invalid_key", check_key(request.key)),
        ("invalid_branch_name", check_branch_name(branch)),
    )
    error_type, message = failure or ("", "")
    Ensure.true(
        failure is None,
        error_type=error_type,
        message=message,
    )

    entry_ref = EntryRef(
        namespace=namespace,
        key=request.key,
        branch=branch,
        ref_name=ref_name_for_entry(namespace, request.key, branch),
    )

    target = request.at if request.at is not None else entry_ref.ref_name

    diagnostic = brmem_context.brmem_gateway.check(
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
        namespace_label = namespace_value_label(entry_ref.namespace)
        raise ClinkrExit.negative(
            absent,
            message=(
                f"not found: Entry Key={entry_ref.key} Namespace={namespace_label} "
                f"Branch={entry_ref.branch} at {target}"
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
