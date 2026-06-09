"""Graphite metadata-store reader for stack snapshots."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from asdl_core.gt.types import GtCommandFailure, StackInfo, UntrackedBranch


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
    warnings: list[str],
) -> tuple[str, ...]:
    if raw_children is None:
        return ()
    if not isinstance(raw_children, str):
        warnings.append(
            f"children metadata for {branch_name} is not JSON text; treating as no children"
        )
        return ()
    if not raw_children:
        return ()

    try:
        parsed = json.loads(raw_children)
    except json.JSONDecodeError:
        warnings.append(
            f"children metadata for {branch_name} is not valid JSON; treating as no children"
        )
        return ()

    if not isinstance(parsed, list):
        warnings.append(
            f"children metadata for {branch_name} is not a JSON list; treating as no children"
        )
        return ()

    children = tuple(child for child in parsed if isinstance(child, str))
    if len(children) != len(parsed):
        warnings.append(f"children metadata for {branch_name} contains non-string entries")
    return children


def _metadata_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    if value == "":
        return None
    return value


def _load_branch_metadata(
    db_path: Path,
) -> tuple[dict[str, _BranchMetadataRow], list[str]] | GtCommandFailure:
    warnings: list[str] = []
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
            warnings.append("Graphite metadata row has an empty branch_name; row ignored")
            continue
        parent = _metadata_text(parent_branch_name)
        validation = _metadata_text(validation_result)
        rows[branch_name] = _BranchMetadataRow(
            parent_branch_name=parent,
            children=_parse_children(branch_name, raw_children, warnings),
            validation_result=validation,
        )
    return rows, warnings


def _walk_ancestors(
    rows: dict[str, _BranchMetadataRow],
    current_branch: str,
    warnings: list[str],
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
            warnings.append(
                f"cycle detected in Graphite parent metadata at {parent}; ancestor walk stopped"
            )
            return tuple(reversed(ancestor_names_reversed)), branch

        ancestor_names_reversed.append(parent)
        if parent not in rows:
            warnings.append(
                f"parent branch {parent} is missing from Graphite metadata; ancestor walk stopped"
            )
            return tuple(reversed(ancestor_names_reversed)), parent

        visited.add(parent)
        branch = parent


def _walk_first_child_descendants(
    rows: dict[str, _BranchMetadataRow],
    current_branch: str,
    warnings: list[str],
) -> tuple[str, ...]:
    descendants: list[str] = []
    branch = current_branch
    visited = {current_branch}

    while True:
        children = rows[branch].children
        if len(children) > 1:
            warnings.append(
                f"branch {branch} has {len(children)} Graphite children; "
                "descendants follow the first child only"
            )
        if not children:
            return tuple(descendants)

        child = children[0]
        if child in visited:
            warnings.append(
                f"cycle detected in Graphite children metadata at {child}; descendant walk stopped"
            )
            return tuple(descendants)

        descendants.append(child)
        if child not in rows:
            warnings.append(
                f"child branch {child} is missing from Graphite metadata; descendant walk stopped"
            )
            return tuple(descendants)

        visited.add(child)
        branch = child


def _add_trunk_marker_warnings(
    rows: dict[str, _BranchMetadataRow],
    terminus_branch: str,
    warnings: list[str],
) -> None:
    marked_trunks = tuple(
        branch for branch, row in rows.items() if row.validation_result == "TRUNK"
    )
    if terminus_branch not in rows:
        warnings.append("trunk row marker missing")
        return
    if rows[terminus_branch].validation_result != "TRUNK":
        warnings.append("trunk row marker missing")
    if len(marked_trunks) > 1:
        warnings.append("multiple Graphite metadata rows are marked as trunk")
    if marked_trunks and terminus_branch not in marked_trunks:
        warnings.append(
            "Graphite metadata trunk marker differs from ancestor-walk terminus: "
            f"{marked_trunks[0]} != {terminus_branch}"
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
    rows, warnings = loaded

    if current_branch not in rows:
        return UntrackedBranch(
            message=f"current branch is not tracked by Graphite: {current_branch}"
        )

    ancestors, terminus_branch = _walk_ancestors(rows, current_branch, warnings)
    descendants = _walk_first_child_descendants(rows, current_branch, warnings)
    _add_trunk_marker_warnings(rows, terminus_branch, warnings)

    return StackInfo(
        trunk=ancestors[0] if ancestors else current_branch,
        current=current_branch,
        ancestors=ancestors,
        children=rows[current_branch].children,
        warnings=tuple(warnings),
        descendants=descendants,
    )
