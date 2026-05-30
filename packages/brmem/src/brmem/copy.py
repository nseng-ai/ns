"""Atomically copy Branch Memory Entries from one branch to another."""

from __future__ import annotations

import fnmatch
import subprocess
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.context import BrmemCliContext
from brmem.gateway import BranchMemoryGateway, BrmemCopyConflictError
from brmem.ref_layout import (
    EntryRef,
    check_branch_name,
    check_namespace,
    ref_name_for_entry,
)
from brmem.validation import check_key_glob, first_failure


class CopyRequest(ClinkrModel):
    namespace: Annotated[
        str | None,
        click.Option(
            ["--namespace"],
            type=click.STRING,
            default=None,
            help="Named Namespace to copy (e.g. 'notes'). Mutually exclusive with --base.",
        ),
    ] = None
    base: Annotated[
        bool,
        click.Option(
            ["--base"],
            is_flag=True,
            default=False,
            help="Copy ad-hoc Base Namespace Entries.",
        ),
    ] = False
    from_branch: Annotated[
        str,
        click.Option(
            ["--from-branch"],
            required=True,
            type=click.STRING,
            help="Source branch whose Branch Memory is copied.",
        ),
    ]
    to_branch: Annotated[
        str,
        click.Option(
            ["--to-branch"],
            required=True,
            type=click.STRING,
            help="Destination branch that receives the copied Entries.",
        ),
    ]
    key_glob: Annotated[
        str | None,
        click.Option(
            ["--key-glob"],
            type=click.STRING,
            default=None,
            help=(
                "Copy only Entries whose Entry Key matches this fnmatch glob "
                "(e.g. 'my-slug/*'). '*' matches any characters including "
                "'/', '?' matches one character, '[seq]' matches a class. "
                "Non-matching destination Entries are preserved. When absent, "
                "every Entry in the selected Namespace is copied and the destination "
                "Branch Memory is replaced entirely."
            ),
        ),
    ] = None
    overwrite: bool = False
    dry_run: bool = False


class CopyPlanItem(ClinkrModel):
    key: str
    # JSON compatibility: these fields carry Entry Locator strings.
    source_ref: str
    destination_ref: str
    source_sha: str


class CopyResult(ClinkrModel):
    namespace: str | None
    from_branch: str
    to_branch: str
    overwrite: bool
    dry_run: bool
    copied: list[CopyPlanItem]
    key_glob: str | None = None


def render_copy(result: CopyResult) -> None:
    verb = "Would copy" if result.dry_run else "Copied"
    click.echo(
        f"{verb} {len(result.copied)} Entr"
        f"{'y' if len(result.copied) == 1 else 'ies'} "
        f"in {_scope_label(result.namespace)} from Branch {result.from_branch} "
        f"to Branch {result.to_branch}."
    )
    if result.key_glob is not None:
        click.echo(f"  (filtered by --key-glob {result.key_glob!r})")
    for item in result.copied:
        click.echo(f"  {item.key}  {item.source_sha}")
        click.echo(f"    Source Entry Locator: {item.source_ref}")
        click.echo(f"    Destination Entry Locator: {item.destination_ref}")


@clinkr_operation(
    name="copy",
    help=(
        "Atomically copy every Entry within the Base Namespace or a named Namespace "
        "from one Branch Memory to another."
    ),
    human_renderer=render_copy,
)
def run_copy(
    ctx: click.Context,
    request: CopyRequest,
) -> ClinkrExit[CopyResult]:
    brmem_context = load_typed_context(ctx, BrmemCliContext)

    Ensure.true(
        not (request.base and request.namespace is not None),
        error_type="base_and_namespace_conflict",
        message="--base and --namespace are mutually exclusive.",
    )
    Ensure.true(
        request.base or request.namespace is not None,
        error_type="copy_scope_missing",
        message="Pass --base or --namespace <name> to choose the Namespace to copy.",
    )

    namespace = _request_namespace(request)
    key_glob_message = check_key_glob(request.key_glob) if request.key_glob is not None else None
    validation_failure = first_failure(
        (
            "invalid_namespace",
            None if namespace is None else check_namespace(namespace),
        ),
        ("invalid_from_branch", check_branch_name(request.from_branch)),
        ("invalid_to_branch", check_branch_name(request.to_branch)),
        ("invalid_key_glob", key_glob_message),
    )
    error_type, message = validation_failure or ("", "")
    Ensure.true(
        validation_failure is None,
        error_type=error_type,
        message=message,
    )

    all_source_entries = _list_scope_entries(
        brmem_context.brmem_gateway,
        namespace,
        request.from_branch,
    )

    if request.key_glob is not None:
        source_entries = [
            entry
            for entry in all_source_entries
            if fnmatch.fnmatchcase(entry.key, request.key_glob)
        ]
    else:
        source_entries = all_source_entries

    scope_label = _scope_label(namespace)
    if request.key_glob is not None:
        empty_message = (
            f"No Entries on Branch {request.from_branch} in {scope_label} "
            f"match --key-glob {request.key_glob!r}."
        )
    else:
        empty_message = f"No Entries found on Branch {request.from_branch} in {scope_label}."
    source_entries = Ensure.truthy(
        source_entries,
        error_type="no_matching_entries",
        message=empty_message,
    )

    all_dest_entries = _list_scope_entries(
        brmem_context.brmem_gateway,
        namespace,
        request.to_branch,
    )
    if request.key_glob is not None:
        # Non-matching destination keys are preserved and never conflict.
        existing_dest_keys = {
            entry.key
            for entry in all_dest_entries
            if fnmatch.fnmatchcase(entry.key, request.key_glob)
        }
    else:
        existing_dest_keys = {entry.key for entry in all_dest_entries}
    conflicting_keys = sorted(existing_dest_keys)
    Ensure.true(
        not conflicting_keys or request.overwrite,
        error_type="destination_conflict",
        message=(
            f"Destination Branch {request.to_branch} already has Entries for: "
            f"{', '.join(conflicting_keys)}. Pass --overwrite to replace them."
        ),
    )

    source_shas = {
        entry.key: _source_sha(
            brmem_context.brmem_gateway,
            namespace,
            entry.key,
            request.from_branch,
        )
        for entry in source_entries
    }
    missing = [key for key, sha in source_shas.items() if sha is None]
    Ensure.true(
        not missing,
        error_type="source_sha_unavailable",
        message=f"Could not resolve source commit for Entry Keys: {', '.join(missing)}",
    )

    plan = _build_plan(
        namespace,
        request.from_branch,
        request.to_branch,
        source_entries,
        source_shas,
    )

    if request.dry_run:
        return ClinkrExit.ok(_result(request, plan))

    try:
        brmem_context.brmem_gateway.copy_entries(
            namespace=namespace,
            from_branch=request.from_branch,
            to_branch=request.to_branch,
            overwrite=request.overwrite,
            key_glob=request.key_glob,
        )
    except BrmemCopyConflictError as exc:
        raise ClinkrFailure(
            error_type="destination_conflict",
            message=str(exc),
        ) from exc
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or "").strip() or str(exc)
        raise ClinkrFailure(
            error_type="git_failure",
            message=f"Failed to copy Branch Memory: {details}",
        ) from exc

    return ClinkrExit.ok(_result(request, plan))


def _request_namespace(request: CopyRequest) -> str | None:
    if request.base:
        return None
    return request.namespace


def _scope_label(namespace: str | None) -> str:
    if namespace is None:
        return "Base Namespace"
    return f"Namespace {namespace}"


def _list_scope_entries(
    gateway: BranchMemoryGateway,
    namespace: str | None,
    branch: str,
) -> list[EntryRef]:
    if namespace is not None:
        return gateway.list_entries(namespace=namespace, branch=branch)
    return [entry for entry in gateway.list_entries(branch=branch) if entry.namespace is None]


def _build_plan(
    namespace: str | None,
    from_branch: str,
    to_branch: str,
    source_entries: list[EntryRef],
    source_shas: dict[str, str | None],
) -> list[CopyPlanItem]:
    plan: list[CopyPlanItem] = []
    for entry in sorted(source_entries, key=lambda e: e.key):
        sha = source_shas[entry.key]
        assert sha is not None  # guarded above
        plan.append(
            CopyPlanItem(
                key=entry.key,
                source_ref=entry.ref_name,
                destination_ref=ref_name_for_entry(namespace, entry.key, to_branch),
                source_sha=sha,
            )
        )
    return plan


def _result(request: CopyRequest, plan: list[CopyPlanItem]) -> CopyResult:
    return CopyResult(
        namespace=_request_namespace(request),
        from_branch=request.from_branch,
        to_branch=request.to_branch,
        overwrite=request.overwrite,
        dry_run=request.dry_run,
        copied=plan,
        key_glob=request.key_glob,
    )


def _source_sha(
    gateway: BranchMemoryGateway,
    namespace: str | None,
    key: str,
    branch: str,
) -> str | None:
    diagnostic = gateway.check(namespace, key, branch)
    if diagnostic is None:
        return None
    return diagnostic.head_sha
