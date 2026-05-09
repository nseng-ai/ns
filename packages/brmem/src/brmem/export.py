"""Export branch-memory entries to a filesystem directory."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.gateway import BranchMemoryGateway
from brmem.gateway_access import (
    get_branch_memory_gateway,
    resolve_current_brmem_branch,
)
from brmem.key_validation import check_key
from brmem.ref_layout import EntryRef, check_branch_name, check_namespace
from brmem.validation import first_failure


class ExportRequest(ClinkrModel):
    namespace: Annotated[
        str | None,
        click.Option(
            ["--namespace"],
            type=click.STRING,
            default=None,
            help=(
                "Entry namespace to export. Omit to export only ad-hoc base entries; "
                "omission does not mean all namespaces."
            ),
        ),
    ] = None
    branch: str | None = None
    output_dir: Annotated[
        str,
        click.Option(
            ["--output-dir"],
            required=True,
            type=click.STRING,
            help="Directory that will receive files named by brmem keys.",
        ),
    ]
    overwrite: Annotated[
        bool,
        click.Option(
            ["--overwrite"],
            is_flag=True,
            default=False,
            help="Replace existing regular files at target paths.",
        ),
    ] = False
    dry_run: Annotated[
        bool,
        click.Option(
            ["--dry-run"],
            is_flag=True,
            default=False,
            help="Show planned writes without touching the filesystem.",
        ),
    ] = False


class ExportedEntry(ClinkrModel):
    key: str
    path: str
    ref_name: str
    size_bytes: int


class ExportResult(ClinkrModel):
    namespace: str | None
    branch: str
    output_dir: str
    overwrite: bool
    dry_run: bool
    exported: list[ExportedEntry]


@dataclass(frozen=True)
class _PreparedExport:
    exported_entry: ExportedEntry
    target_path: Path
    content: str


def render_export(result: ExportResult) -> None:
    verb = "Would export" if result.dry_run else "Exported"
    click.echo(
        f"{verb} {_selection_summary(result.namespace, len(result.exported))} "
        f"on branch {result.branch} to {result.output_dir}."
    )
    for item in result.exported:
        click.echo(f"  {item.key} -> {item.path}")


@clinkr_operation(
    name="export",
    help="Export branch-memory entries to a filesystem directory.",
    human_renderer=render_export,
)
def run_export(
    ctx: click.Context,
    request: ExportRequest,
) -> ClinkrExit[ExportResult]:
    validation_failure = first_failure(
        (
            "invalid_namespace",
            None if request.namespace is None else check_namespace(request.namespace),
        ),
        (
            "invalid_branch_name",
            None if request.branch is None else check_branch_name(request.branch),
        ),
    )
    error_type, message = validation_failure or ("", "")
    Ensure.true(
        validation_failure is None,
        error_type=error_type,
        message=message,
    )

    branch = resolve_current_brmem_branch(ctx, request.branch)
    branch_failure = check_branch_name(branch)
    Ensure.true(
        branch_failure is None,
        error_type="invalid_branch_name",
        message=branch_failure or "Invalid branch name.",
    )

    output_dir = _absolute_output_dir(request.output_dir)
    gateway = get_branch_memory_gateway(ctx)
    entries = _matching_entries(gateway, request.namespace, branch)

    if not entries:
        result = ExportResult(
            namespace=request.namespace,
            branch=branch,
            output_dir=str(output_dir),
            overwrite=request.overwrite,
            dry_run=request.dry_run,
            exported=[],
        )
        raise ClinkrExit.negative(
            result,
            message=_empty_selection_message(request.namespace, branch),
        )

    prepared = _prepare_exports(gateway, entries, output_dir)
    _preflight(output_dir, prepared, overwrite=request.overwrite)

    if not request.dry_run:
        _write_exports(prepared)

    return ClinkrExit.ok(
        ExportResult(
            namespace=request.namespace,
            branch=branch,
            output_dir=str(output_dir),
            overwrite=request.overwrite,
            dry_run=request.dry_run,
            exported=[item.exported_entry for item in prepared],
        )
    )


def _matching_entries(
    gateway: BranchMemoryGateway,
    namespace: str | None,
    branch: str,
) -> list[EntryRef]:
    entries = gateway.list_entries(namespace=namespace, branch=branch)
    if namespace is None:
        entries = [entry for entry in entries if entry.namespace is None]
    return sorted(entries, key=lambda entry: entry.key)


def _prepare_exports(
    gateway: BranchMemoryGateway,
    entries: list[EntryRef],
    output_dir: Path,
) -> list[_PreparedExport]:
    prepared: list[_PreparedExport] = []
    seen_targets: dict[Path, str] = {}

    for entry in entries:
        target_path = _target_path(output_dir, entry.key)
        previous_key = seen_targets.get(target_path)
        Ensure.true(
            previous_key is None,
            error_type="duplicate_target_path",
            message=(
                f"Export keys {previous_key!r} and {entry.key!r} map to the same target "
                f"path: {target_path}"
            ),
        )
        seen_targets[target_path] = entry.key

        diagnostic = Ensure.not_none(
            gateway.check(entry.namespace, entry.key, entry.branch),
            error_type="entry_diagnostic_missing",
            message=f"Could not inspect branch-memory entry {entry.ref_name}.",
        )
        content = Ensure.not_none(
            gateway.get(entry.namespace, entry.key, entry.branch),
            error_type="entry_content_missing",
            message=f"Could not read branch-memory entry {entry.ref_name}.",
        )
        prepared.append(
            _PreparedExport(
                exported_entry=ExportedEntry(
                    key=entry.key,
                    path=str(target_path),
                    ref_name=entry.ref_name,
                    size_bytes=diagnostic.size_bytes,
                ),
                target_path=target_path,
                content=content,
            )
        )

    return prepared


def _preflight(
    output_dir: Path,
    prepared: list[_PreparedExport],
    *,
    overwrite: bool,
) -> None:
    _preflight_output_dir(output_dir)
    for item in prepared:
        _preflight_parent_paths(output_dir, item.target_path)
        _preflight_target_path(item.target_path, overwrite=overwrite)


def _preflight_output_dir(output_dir: Path) -> None:
    if output_dir.is_symlink() and not output_dir.exists():
        Ensure.fail(
            error_type="unsafe_output_dir",
            message=f"Output directory is a broken symlink: {output_dir}",
        )
    if output_dir.exists():
        Ensure.true(
            output_dir.is_dir(),
            error_type="output_dir_not_directory",
            message=f"Output directory exists and is not a directory: {output_dir}",
        )


def _preflight_parent_paths(output_dir: Path, target_path: Path) -> None:
    current = target_path.parent
    while current != current.parent:
        if current.exists() or current.is_symlink():
            Ensure.true(
                current.is_dir(),
                error_type="parent_not_directory",
                message=f"Parent path exists and is not a directory: {current}",
            )
        current = current.parent

    current = target_path.parent
    while current != output_dir:
        if current.exists() and current.is_symlink():
            Ensure.fail(
                error_type="unsafe_parent_path",
                message=f"Parent path is a symlink: {current}",
            )
        current = current.parent


def _preflight_target_path(target_path: Path, *, overwrite: bool) -> None:
    if target_path.is_symlink():
        Ensure.fail(
            error_type="unsafe_target_path",
            message=f"Target path is a symlink: {target_path}",
        )
    if target_path.exists():
        if target_path.is_dir():
            Ensure.fail(
                error_type="target_is_directory",
                message=f"Target path is a directory: {target_path}",
            )
        Ensure.true(
            target_path.is_file(),
            error_type="unsafe_target_path",
            message=f"Target path is not a regular file: {target_path}",
        )
        Ensure.true(
            overwrite,
            error_type="target_exists",
            message=f"Target already exists: {target_path}. Pass --overwrite to replace it.",
        )


def _write_exports(prepared: list[_PreparedExport]) -> None:
    for item in prepared:
        try:
            item.target_path.parent.mkdir(parents=True, exist_ok=True)
            item.target_path.write_text(item.content, encoding="utf-8")
        except OSError as exc:
            raise ClinkrFailure(
                error_type="write_failed",
                message=f"Failed to write {item.target_path}: {exc}",
            ) from exc


def _absolute_output_dir(output_dir: str) -> Path:
    path = Path(output_dir)
    if path.is_absolute():
        return path
    return Path.cwd() / path


def _target_path(output_dir: Path, key: str) -> Path:
    validation_message = check_key(key)
    Ensure.true(
        validation_message is None,
        error_type="invalid_key",
        message=validation_message or "Invalid branch-memory key.",
    )
    parts = tuple(key.split("/"))
    unsafe_segment = next((part for part in parts if part in {"", ".", ".."}), None)
    Ensure.true(
        unsafe_segment is None,
        error_type="unsafe_key",
        message=f"Unsafe export key {key!r}: path segment {unsafe_segment!r} is not allowed.",
    )
    return output_dir.joinpath(*parts)


def _empty_selection_message(namespace: str | None, branch: str) -> str:
    if namespace is None:
        return f"No base entries found on branch {branch}."
    return f"No entries found on branch {branch} in namespace {namespace}."


def _selection_summary(namespace: str | None, count: int) -> str:
    if namespace is None:
        return f"{count} base {_entry_word(count)}"
    return f"{count} {_entry_word(count)} from namespace {namespace}"


def _entry_word(count: int) -> str:
    if count == 1:
        return "entry"
    return "entries"
