"""Graphite metadata-store reader for stack snapshots."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from asdl_core.gt.types import (
    GtCommandFailure,
    StackInfo,
    StackWalkDiagnostic,
    UntrackedBranch,
    render_stack_walk_warning,
)


@dataclass(frozen=True)
class _BranchMetadataRow:
    parent_branch_name: str | None
    children: tuple[str, ...]
    validation_result: str | None


_REQUIRED_BRANCH_METADATA_COLUMNS = frozenset(
    {"branch_name", "parent_branch_name", "children", "validation_result"}
)


def _parse_children(
    branch_name: str,
    raw_children: object,
    diagnostics: list[StackWalkDiagnostic],
) -> tuple[str, ...]:
    if raw_children is None:
        return ()
    if not isinstance(raw_children, str):
        diagnostics.append(
            StackWalkDiagnostic(
                scope="load",
                kind="children_not_text",
                branch=branch_name,
            )
        )
        return ()
    if not raw_children:
        return ()

    try:
        parsed = json.loads(raw_children)
    except json.JSONDecodeError:
        diagnostics.append(
            StackWalkDiagnostic(
                scope="load",
                kind="children_invalid_json",
                branch=branch_name,
            )
        )
        return ()

    if not isinstance(parsed, list):
        diagnostics.append(
            StackWalkDiagnostic(
                scope="load",
                kind="children_not_list",
                branch=branch_name,
            )
        )
        return ()

    children = tuple(child for child in parsed if isinstance(child, str))
    if len(children) != len(parsed):
        diagnostics.append(
            StackWalkDiagnostic(
                scope="load",
                kind="children_non_string",
                branch=branch_name,
            )
        )
    return children


def _metadata_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    if value == "":
        return None
    return value


def _load_branch_metadata(
    db_path: Path,
) -> tuple[dict[str, _BranchMetadataRow], list[StackWalkDiagnostic]] | GtCommandFailure:
    diagnostics: list[StackWalkDiagnostic] = []
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
            table_info = connection.execute("PRAGMA table_info(branch_metadata)").fetchall()
            columns = {record[1] for record in table_info if isinstance(record[1], str)}
            missing_required = _REQUIRED_BRANCH_METADATA_COLUMNS.difference(columns)
            if missing_required:
                return GtCommandFailure(
                    message=(
                        "Graphite metadata schema mismatch: branch_metadata missing "
                        f"required column {sorted(missing_required)[0]}"
                    ),
                    returncode=None,
                )

            records = connection.execute(
                """
                SELECT branch_name, parent_branch_name, children, validation_result
                FROM branch_metadata
                """
            ).fetchall()
    except sqlite3.OperationalError as exc:
        message = str(exc)
        if message.startswith("no such table") or message.startswith("no such column"):
            return GtCommandFailure(
                message=f"Graphite metadata schema mismatch: {exc}",
                returncode=None,
            )
        return GtCommandFailure(
            message=f"Graphite metadata store unreadable: {exc}",
            returncode=None,
        )
    except sqlite3.DatabaseError as exc:
        return GtCommandFailure(
            message=f"Graphite metadata store unreadable: {exc}",
            returncode=None,
        )

    rows: dict[str, _BranchMetadataRow] = {}
    for record in records:
        branch_name, parent_branch_name, raw_children, validation_result = record
        if not isinstance(branch_name, str) or not branch_name:
            diagnostics.append(
                StackWalkDiagnostic(scope="load", kind="empty_branch_name", branch=None)
            )
            continue
        parent = _metadata_text(parent_branch_name)
        validation = _metadata_text(validation_result)
        rows[branch_name] = _BranchMetadataRow(
            parent_branch_name=parent,
            children=_parse_children(branch_name, raw_children, diagnostics),
            validation_result=validation,
        )
    return rows, diagnostics


def _walk_ancestors(
    rows: dict[str, _BranchMetadataRow],
    current_branch: str,
    diagnostics: list[StackWalkDiagnostic],
) -> tuple[tuple[str, ...], str]:
    ancestor_names_reversed: list[str] = []
    branch = current_branch
    visited = {current_branch}

    while True:
        row = rows[branch]
        parent = row.parent_branch_name
        if parent is None:
            return tuple(reversed(ancestor_names_reversed)), branch
        if parent in visited:
            diagnostics.append(StackWalkDiagnostic(scope="ancestor", kind="cycle", branch=parent))
            return tuple(reversed(ancestor_names_reversed)), branch

        ancestor_names_reversed.append(parent)
        if parent not in rows:
            diagnostics.append(
                StackWalkDiagnostic(scope="ancestor", kind="missing_row", branch=parent)
            )
            return tuple(reversed(ancestor_names_reversed)), parent

        visited.add(parent)
        branch = parent


def _walk_first_child_descendants(
    rows: dict[str, _BranchMetadataRow],
    current_branch: str,
    diagnostics: list[StackWalkDiagnostic],
) -> tuple[str, ...]:
    descendants: list[str] = []
    branch = current_branch
    visited = {current_branch}

    while True:
        children = rows[branch].children
        if len(children) > 1:
            diagnostics.append(
                StackWalkDiagnostic(
                    scope="descendant",
                    kind="fork",
                    branch=branch,
                    children=children,
                )
            )
        if not children:
            return tuple(descendants)

        child = children[0]
        if child in visited:
            diagnostics.append(StackWalkDiagnostic(scope="descendant", kind="cycle", branch=child))
            return tuple(descendants)

        descendants.append(child)
        if child not in rows:
            diagnostics.append(
                StackWalkDiagnostic(scope="descendant", kind="missing_row", branch=child)
            )
            return tuple(descendants)

        visited.add(child)
        branch = child


def _add_trunk_marker_diagnostics(
    rows: dict[str, _BranchMetadataRow],
    terminus_branch: str,
    diagnostics: list[StackWalkDiagnostic],
) -> None:
    marked_trunks = tuple(
        branch for branch, row in rows.items() if row.validation_result == "TRUNK"
    )
    if terminus_branch not in rows:
        diagnostics.append(
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_missing",
                branch=terminus_branch,
            )
        )
        return
    if rows[terminus_branch].validation_result != "TRUNK":
        diagnostics.append(
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_missing",
                branch=terminus_branch,
            )
        )
    if len(marked_trunks) > 1:
        diagnostics.append(
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_multiple",
                branch=terminus_branch,
                children=marked_trunks,
            )
        )
    if marked_trunks and terminus_branch not in marked_trunks:
        diagnostics.append(
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_mismatch",
                branch=terminus_branch,
                children=marked_trunks,
            )
        )


def read_stack_from_metadata_db(
    db_path: Path,
    current_branch: str,
) -> StackInfo | UntrackedBranch | GtCommandFailure:
    """Read the current Graphite stack snapshot from Graphite's SQLite store."""
    if not db_path.exists():
        return GtCommandFailure(
            message=f"Graphite metadata store not found at {db_path}",
            returncode=None,
        )

    loaded = _load_branch_metadata(db_path)
    if isinstance(loaded, GtCommandFailure):
        return loaded
    rows, diagnostics = loaded

    if current_branch not in rows:
        return UntrackedBranch(
            message=f"current branch is not tracked by Graphite: {current_branch}"
        )

    ancestors, terminus_branch = _walk_ancestors(rows, current_branch, diagnostics)
    descendants = _walk_first_child_descendants(rows, current_branch, diagnostics)
    _add_trunk_marker_diagnostics(rows, terminus_branch, diagnostics)

    return StackInfo(
        trunk=ancestors[0] if ancestors else current_branch,
        current=current_branch,
        ancestors=ancestors,
        children=rows[current_branch].children,
        warnings=tuple(render_stack_walk_warning(diagnostic) for diagnostic in diagnostics),
        descendants=descendants,
        diagnostics=tuple(diagnostics),
    )
