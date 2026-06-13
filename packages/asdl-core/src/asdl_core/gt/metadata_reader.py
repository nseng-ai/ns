"""Graphite metadata-store reader for stack snapshots."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from asdl_core.gt.types import (
    ChildrenCorruption,
    ChildrenCorruptionKind,
    DescendantWalk,
    GtCommandFailure,
    StackFork,
    StackInfo,
    StackWalkDiagnostic,
    StackWalkKind,
    StackWalkScope,
    TrunkMarkerClean,
    TrunkMarkerProblem,
    TrunkMarkerStatus,
    UntrackedBranch,
    WalkCompleted,
    WalkCycle,
    WalkRowMissing,
    WalkTermination,
)


@dataclass(frozen=True)
class _BranchMetadataRow:
    parent_branch_name: str | None
    children: tuple[str, ...]
    validation_result: str | None
    children_corruption: ChildrenCorruption | None


_REQUIRED_BRANCH_METADATA_COLUMNS = frozenset(
    {"branch_name", "parent_branch_name", "children", "validation_result"}
)


def _parse_children(
    branch_name: str,
    raw_children: object,
) -> tuple[tuple[str, ...], ChildrenCorruption | None]:
    if raw_children is None:
        return (), None
    if not isinstance(raw_children, str):
        return (), ChildrenCorruption(branch=branch_name, kind="not_text")
    if not raw_children:
        return (), None

    try:
        parsed = json.loads(raw_children)
    except json.JSONDecodeError:
        return (), ChildrenCorruption(branch=branch_name, kind="invalid_json")

    if not isinstance(parsed, list):
        return (), ChildrenCorruption(branch=branch_name, kind="not_list")

    children = tuple(child for child in parsed if isinstance(child, str))
    if len(children) != len(parsed):
        return children, ChildrenCorruption(branch=branch_name, kind="non_string")
    return children, None


def _metadata_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    if value == "":
        return None
    return value


def _load_branch_metadata(
    db_path: Path,
) -> tuple[dict[str, _BranchMetadataRow], int] | GtCommandFailure:
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
    empty_branch_name_rows = 0
    for record in records:
        branch_name, parent_branch_name, raw_children, validation_result = record
        if not isinstance(branch_name, str) or not branch_name:
            empty_branch_name_rows += 1
            continue
        parent = _metadata_text(parent_branch_name)
        validation = _metadata_text(validation_result)
        children, children_corruption = _parse_children(branch_name, raw_children)
        rows[branch_name] = _BranchMetadataRow(
            parent_branch_name=parent,
            children=children,
            validation_result=validation,
            children_corruption=children_corruption,
        )
    return rows, empty_branch_name_rows


def _walk_ancestors(
    rows: dict[str, _BranchMetadataRow],
    current_branch: str,
) -> tuple[tuple[str, ...], str, WalkTermination]:
    ancestor_names_reversed: list[str] = []
    branch = current_branch
    visited = {current_branch}

    while True:
        row = rows[branch]
        parent = row.parent_branch_name
        if parent is None:
            return tuple(reversed(ancestor_names_reversed)), branch, WalkCompleted()
        if parent in visited:
            return tuple(reversed(ancestor_names_reversed)), branch, WalkCycle(parent)

        ancestor_names_reversed.append(parent)
        if parent not in rows:
            return tuple(reversed(ancestor_names_reversed)), parent, WalkRowMissing(parent)

        visited.add(parent)
        branch = parent


def _walk_first_child_descendants(
    rows: dict[str, _BranchMetadataRow],
    current_branch: str,
) -> tuple[tuple[str, ...], DescendantWalk]:
    descendants: list[str] = []
    forks: list[StackFork] = []
    children_corruptions: list[ChildrenCorruption] = []
    branch = current_branch
    visited = {current_branch}

    while True:
        row = rows[branch]
        if row.children_corruption is not None:
            children_corruptions.append(row.children_corruption)
        if len(row.children) > 1:
            forks.append(StackFork(branch=branch, children=row.children))
        if not row.children:
            return tuple(descendants), DescendantWalk(
                forks=tuple(forks),
                children_corruptions=tuple(children_corruptions),
                termination=WalkCompleted(),
            )

        child = row.children[0]
        if child in visited:
            return tuple(descendants), DescendantWalk(
                forks=tuple(forks),
                children_corruptions=tuple(children_corruptions),
                termination=WalkCycle(child),
            )

        descendants.append(child)
        if child not in rows:
            return tuple(descendants), DescendantWalk(
                forks=tuple(forks),
                children_corruptions=tuple(children_corruptions),
                termination=WalkRowMissing(child),
            )

        visited.add(child)
        branch = child


def _trunk_marker_status(
    rows: dict[str, _BranchMetadataRow],
    terminus_branch: str,
) -> TrunkMarkerStatus:
    marked_trunks = tuple(
        branch for branch, row in rows.items() if row.validation_result == "TRUNK"
    )
    if terminus_branch not in rows:
        return TrunkMarkerProblem(
            terminus=terminus_branch,
            terminus_state="row_missing",
            marked_trunks=marked_trunks,
        )

    terminus_state = "marked" if rows[terminus_branch].validation_result == "TRUNK" else "unmarked"
    if terminus_state == "marked" and marked_trunks == (terminus_branch,):
        return TrunkMarkerClean()
    return TrunkMarkerProblem(
        terminus=terminus_branch,
        terminus_state=terminus_state,
        marked_trunks=marked_trunks,
    )


def _children_corruption_diagnostic_kind(
    kind: ChildrenCorruptionKind,
) -> StackWalkKind:
    if kind == "not_text":
        return "children_not_text"
    if kind == "invalid_json":
        return "children_invalid_json"
    if kind == "not_list":
        return "children_not_list"
    if kind == "non_string":
        return "children_non_string"
    raise AssertionError(f"unhandled children corruption kind: {kind}")


def _children_corruption_diagnostic(corruption: ChildrenCorruption) -> StackWalkDiagnostic:
    return StackWalkDiagnostic(
        scope="load",
        kind=_children_corruption_diagnostic_kind(corruption.kind),
        branch=corruption.branch,
    )


def _termination_diagnostic(
    scope: StackWalkScope,
    termination: WalkCycle | WalkRowMissing,
) -> StackWalkDiagnostic:
    if isinstance(termination, WalkCycle):
        return StackWalkDiagnostic(scope=scope, kind="cycle", branch=termination.branch)
    if isinstance(termination, WalkRowMissing):
        return StackWalkDiagnostic(scope=scope, kind="missing_row", branch=termination.branch)
    raise AssertionError(f"unhandled walk termination: {termination}")


def _trunk_marker_diagnostics(status: TrunkMarkerProblem) -> tuple[StackWalkDiagnostic, ...]:
    if status.terminus_state == "row_missing":
        return (
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_missing",
                branch=status.terminus,
            ),
        )

    diagnostics: list[StackWalkDiagnostic] = []
    if status.terminus_state == "unmarked":
        diagnostics.append(
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_missing",
                branch=status.terminus,
            )
        )
    if len(status.marked_trunks) > 1:
        diagnostics.append(
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_multiple",
                branch=status.terminus,
                children=status.marked_trunks,
            )
        )
    if status.marked_trunks and status.terminus not in status.marked_trunks:
        diagnostics.append(
            StackWalkDiagnostic(
                scope="trunk_marker",
                kind="marker_mismatch",
                branch=status.terminus,
                children=status.marked_trunks,
            )
        )
    return tuple(diagnostics)


def _legacy_diagnostics(
    *,
    empty_branch_name_rows: int,
    unwalked_children_corruptions: tuple[ChildrenCorruption, ...],
    ancestor_termination: WalkTermination,
    descendant_walk: DescendantWalk,
    trunk_marker: TrunkMarkerStatus,
) -> tuple[StackWalkDiagnostic, ...]:
    diagnostics: list[StackWalkDiagnostic] = []
    diagnostics.extend(
        StackWalkDiagnostic(scope="load", kind="empty_branch_name", branch=None)
        for _ in range(empty_branch_name_rows)
    )
    diagnostics.extend(
        _children_corruption_diagnostic(corruption) for corruption in unwalked_children_corruptions
    )
    diagnostics.extend(
        _children_corruption_diagnostic(corruption)
        for corruption in descendant_walk.children_corruptions
    )
    if isinstance(ancestor_termination, WalkCycle | WalkRowMissing):
        diagnostics.append(_termination_diagnostic("ancestor", ancestor_termination))
    diagnostics.extend(
        StackWalkDiagnostic(
            scope="descendant",
            kind="fork",
            branch=fork.branch,
            children=fork.children,
        )
        for fork in descendant_walk.forks
    )
    if isinstance(descendant_walk.termination, WalkCycle | WalkRowMissing):
        diagnostics.append(_termination_diagnostic("descendant", descendant_walk.termination))
    if isinstance(trunk_marker, TrunkMarkerProblem):
        diagnostics.extend(_trunk_marker_diagnostics(trunk_marker))
    return tuple(diagnostics)


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
    rows, empty_branch_name_rows = loaded

    if current_branch not in rows:
        return UntrackedBranch(
            message=f"current branch is not tracked by Graphite: {current_branch}"
        )

    ancestors, terminus_branch, ancestor_termination = _walk_ancestors(rows, current_branch)
    descendants, descendant_walk = _walk_first_child_descendants(rows, current_branch)
    trunk_marker = _trunk_marker_status(rows, terminus_branch)

    consumed_corruption_branches = {
        corruption.branch for corruption in descendant_walk.children_corruptions
    }
    unwalked_children_corruptions = tuple(
        row.children_corruption
        for row in rows.values()
        if row.children_corruption is not None
        and row.children_corruption.branch not in consumed_corruption_branches
    )
    diagnostics = _legacy_diagnostics(
        empty_branch_name_rows=empty_branch_name_rows,
        unwalked_children_corruptions=unwalked_children_corruptions,
        ancestor_termination=ancestor_termination,
        descendant_walk=descendant_walk,
        trunk_marker=trunk_marker,
    )

    stack_info = StackInfo(
        trunk=ancestors[0] if ancestors else current_branch,
        current=current_branch,
        ancestors=ancestors,
        children=rows[current_branch].children,
        descendants=descendants,
        diagnostics=diagnostics,
        ancestor_termination=ancestor_termination,
        descendant_walk=descendant_walk,
        trunk_marker=trunk_marker,
        unwalked_children_corruptions=unwalked_children_corruptions,
        empty_branch_name_rows=empty_branch_name_rows,
    )
    return StackInfo(
        trunk=stack_info.trunk,
        current=stack_info.current,
        ancestors=stack_info.ancestors,
        children=stack_info.children,
        warnings=stack_info.render_warnings(),
        descendants=stack_info.descendants,
        diagnostics=stack_info.diagnostics,
        ancestor_termination=stack_info.ancestor_termination,
        descendant_walk=stack_info.descendant_walk,
        trunk_marker=stack_info.trunk_marker,
        unwalked_children_corruptions=stack_info.unwalked_children_corruptions,
        empty_branch_name_rows=stack_info.empty_branch_name_rows,
    )
