"""Atomically copy branch-memory entries from one branch to another."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway import (
    BrmemCopyConflictError,
    EntryRef,
    check_branch_name,
    check_namespace,
    ref_name_for_entry,
)
from twerk_core.brmem.gateway_access import get_branch_memory_gateway
from twerk_core.brmem.validation import first_failure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class CopyRequest:
    namespace: Annotated[
        str,
        click.Option(
            ["--namespace"],
            required=True,
            type=click.STRING,
            help="Entry namespace (e.g. 'memjectives').",
        ),
    ]
    from_branch: Annotated[
        str,
        click.Option(
            ["--from-branch"],
            required=True,
            type=click.STRING,
            help="Source branch whose snapshot is copied.",
        ),
    ]
    to_branch: Annotated[
        str,
        click.Option(
            ["--to-branch"],
            required=True,
            type=click.STRING,
            help="Destination branch that receives the copied entries.",
        ),
    ]
    overwrite: bool = False
    dry_run: bool = False


@dataclass(frozen=True)
class CopyPlanItem:
    key: str
    source_ref: str
    destination_ref: str
    source_sha: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "source_ref": self.source_ref,
            "destination_ref": self.destination_ref,
            "source_sha": self.source_sha,
        }


@dataclass(frozen=True)
class CopyResult:
    namespace: str
    from_branch: str
    to_branch: str
    overwrite: bool
    dry_run: bool
    copied: list[CopyPlanItem]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "from_branch": self.from_branch,
            "to_branch": self.to_branch,
            "overwrite": self.overwrite,
            "dry_run": self.dry_run,
            "copied": [item.to_json_dict() for item in self.copied],
        }


def render_copy(result: CopyResult) -> None:
    verb = "Would copy" if result.dry_run else "Copied"
    click.echo(
        f"{verb} {len(result.copied)} entr"
        f"{'y' if len(result.copied) == 1 else 'ies'} "
        f"from {result.from_branch} to {result.to_branch} "
        f"in namespace {result.namespace}."
    )
    for item in result.copied:
        click.echo(f"  {item.key}  {item.source_sha}")
        click.echo(f"    {item.source_ref}")
        click.echo(f"    -> {item.destination_ref}")


@clinkr_operation(
    name="copy",
    help=("Atomically copy every entry within a namespace from one branch's snapshot to another."),
    human_renderer=render_copy,
)
def run_copy(
    ctx: click.Context,
    request: CopyRequest,
) -> ClinkrExit[CopyResult]:
    validation_failure = first_failure(
        ("invalid_namespace", check_namespace(request.namespace)),
        ("invalid_from_branch", check_branch_name(request.from_branch)),
        ("invalid_to_branch", check_branch_name(request.to_branch)),
    )
    if validation_failure is not None:
        error_type, message = validation_failure
        return ClinkrExit.failure(error_type=error_type, message=message)

    gateway = get_branch_memory_gateway(ctx)

    source_entries = list(
        gateway.list_entries(
            namespace=request.namespace,
            branch=request.from_branch,
        )
    )

    if not source_entries:
        return ClinkrExit.failure(
            error_type="no_matching_entries",
            message=(
                f"No entries found on branch {request.from_branch} in namespace "
                f"{request.namespace}."
            ),
        )

    existing_dest_keys = {
        entry.key
        for entry in gateway.list_entries(
            namespace=request.namespace,
            branch=request.to_branch,
        )
    }
    conflicting_keys = sorted({entry.key for entry in source_entries} & existing_dest_keys)
    if conflicting_keys and not request.overwrite:
        joined = ", ".join(conflicting_keys)
        return ClinkrExit.failure(
            error_type="destination_conflict",
            message=(
                f"Destination branch {request.to_branch} already has entries for: "
                f"{joined}. Pass --overwrite to replace them."
            ),
        )

    source_shas = {
        entry.key: _source_sha(gateway, request.namespace, entry.key, request.from_branch)
        for entry in source_entries
    }
    missing = [key for key, sha in source_shas.items() if sha is None]
    if missing:
        return ClinkrExit.failure(
            error_type="source_sha_unavailable",
            message=f"Could not resolve source commit for keys: {', '.join(missing)}",
        )

    plan = _build_plan(
        request.namespace,
        request.from_branch,
        request.to_branch,
        source_entries,
        source_shas,
    )

    if request.dry_run:
        return ClinkrExit.ok(_result(request, plan))

    try:
        gateway.copy_entries(
            namespace=request.namespace,
            from_branch=request.from_branch,
            to_branch=request.to_branch,
            overwrite=request.overwrite,
        )
    except BrmemCopyConflictError as exc:
        return ClinkrExit.failure(
            error_type="destination_conflict",
            message=str(exc),
        )
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or "").strip() or str(exc)
        return ClinkrExit.failure(
            error_type="git_failure",
            message=f"Failed to copy branch memory: {details}",
        )

    return ClinkrExit.ok(_result(request, plan))


def _build_plan(
    namespace: str,
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
        namespace=request.namespace,
        from_branch=request.from_branch,
        to_branch=request.to_branch,
        overwrite=request.overwrite,
        dry_run=request.dry_run,
        copied=plan,
    )


def _source_sha(gateway: Any, namespace: str, key: str, branch: str) -> str | None:
    diagnostic = gateway.check(namespace, key, branch)
    if diagnostic is None:
        return None
    return diagnostic.head_sha
