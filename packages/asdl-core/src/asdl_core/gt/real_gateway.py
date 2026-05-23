"""Real Graphite gateway implementation.

``RealGtGateway.stack()`` reads Graphite's SQLite metadata store at
``<git-common-dir>/.graphite_metadata.db``. The supported schema contract is the
named-column slice ``branch_name``, ``parent_branch_name``, ``children``, and
``validation_result`` from ``branch_metadata``; callers must never depend on
``SELECT *`` or other Graphite-owned columns. Graphite versions since 1.8.0 have
kept this slice stable while adding nullable columns via Kysely migrations. If a
future migration renames or removes one of these columns, stack reads return a
schema-mismatch ``GtCommandFailure`` instead of falling back to human-facing
``gt`` log text parsing.
"""

from __future__ import annotations

import json
import sqlite3
import subprocess
from dataclasses import dataclass
from pathlib import Path

from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.types import (
    GtBranchInfo,
    GtCommandFailure,
    NoParent,
    StackInfo,
    UntrackedBranch,
)


@dataclass(frozen=True)
class _BranchMetadataRow:
    parent_branch_name: str | None
    children: tuple[str, ...]
    validation_result: str | None


def _run_gt(args: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    cmd = ["gt", *args]
    try:
        return subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(
            cmd,
            127,
            stdout="",
            stderr=str(exc),
        )


def _run_git(args: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    cmd = ["git", *args]
    try:
        return subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(
            cmd,
            127,
            stdout="",
            stderr=str(exc),
        )


def _failure(result: subprocess.CompletedProcess[str]) -> GtCommandFailure:
    return GtCommandFailure(
        message=(result.stderr or result.stdout).strip() or "gt command failed",
        returncode=result.returncode,
    )


# `gt` does not expose a stable exit code or machine-readable error type for
# "branch is untracked"; we match against its current human-readable phrase.
# If gt changes wording, expand this tuple. Grep on `_UNTRACKED_PHRASES` to
# find every brittle bit at once.
_UNTRACKED_PHRASES: tuple[str, ...] = ("untracked branch",)


def _untracked_or_failure(
    result: subprocess.CompletedProcess[str],
) -> UntrackedBranch | GtCommandFailure:
    message = (result.stderr or result.stdout).strip() or "gt command failed"
    lowered = message.lower()
    if any(phrase in lowered for phrase in _UNTRACKED_PHRASES):
        return UntrackedBranch(message=message)
    return GtCommandFailure(message=message, returncode=result.returncode)


def _nonempty_lines(stdout: str) -> tuple[str, ...]:
    return tuple(line.strip() for line in stdout.splitlines() if line.strip())


def _resolve_git_common_dir(cwd: Path) -> Path | None:
    result = _run_git(["rev-parse", "--git-common-dir"], cwd=cwd)
    if result.returncode != 0:
        return None
    lines = _nonempty_lines(result.stdout)
    if not lines:
        return None
    common_dir = Path(lines[0])
    if common_dir.is_absolute():
        return common_dir
    return cwd / common_dir


def _resolve_current_branch(cwd: Path) -> str | None:
    result = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd)
    if result.returncode != 0:
        return None
    lines = _nonempty_lines(result.stdout)
    if not lines:
        return None
    return lines[0]


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


def _load_branch_metadata(
    db_path: Path,
) -> tuple[dict[str, _BranchMetadataRow], list[str]] | GtCommandFailure:
    warnings: list[str] = []
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
            records = connection.execute(
                """
                SELECT branch_name, parent_branch_name, children, validation_result
                FROM branch_metadata
                """
            ).fetchall()
    except sqlite3.OperationalError as exc:
        return GtCommandFailure(
            message=f"Graphite metadata schema mismatch: {exc}",
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
        parent = parent_branch_name if isinstance(parent_branch_name, str) else None
        if parent == "":
            parent = None
        validation = validation_result if isinstance(validation_result, str) else None
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


def _read_stack_from_metadata_db(
    db_path: Path,
    current_branch: str,
) -> StackInfo | UntrackedBranch | GtCommandFailure:
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


class RealGtGateway(GtGateway):
    """Real Graphite gateway backed by Graphite metadata and the ``gt`` CLI."""

    def parent_of(self, cwd: Path) -> str | NoParent | UntrackedBranch | GtCommandFailure:
        result = _run_gt(["parent", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        lines = _nonempty_lines(result.stdout)
        if not lines:
            return NoParent()
        return lines[0]

    def children_of(self, cwd: Path) -> tuple[str, ...] | UntrackedBranch | GtCommandFailure:
        result = _run_gt(["children", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        return _nonempty_lines(result.stdout)

    def trunk(self, cwd: Path) -> str | GtCommandFailure:
        result = _run_gt(["trunk", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _failure(result)
        lines = _nonempty_lines(result.stdout)
        if not lines:
            return GtCommandFailure(message="gt trunk returned no branch", returncode=0)
        return lines[0]

    def branch_info(self, cwd: Path) -> GtBranchInfo | UntrackedBranch | GtCommandFailure:
        result = _run_gt(["branch", "info", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        return GtBranchInfo(raw_output=result.stdout)

    def restack_upstack(self, cwd: Path, branch: str) -> GtCommandFailure | None:
        # gt restack accepts --branch even when invoked from the branch's own
        # worktree; redundant but explicit and survives if cwd inference
        # changes upstream.
        result = _run_gt(
            ["restack", "--branch", branch, "--upstack", "--no-interactive"],
            cwd=cwd,
        )
        if result.returncode != 0:
            return _failure(result)
        return None

    def sync(self, cwd: Path, *, restack: bool) -> GtCommandFailure | None:
        args = ["sync", "--no-interactive", "--force"]
        if not restack:
            args.append("--no-restack")
        result = _run_gt(args, cwd=cwd)
        if result.returncode != 0:
            return _failure(result)
        return None

    def stack(self, cwd: Path) -> StackInfo | UntrackedBranch | GtCommandFailure:
        common_dir = _resolve_git_common_dir(cwd)
        if common_dir is None:
            return GtCommandFailure(
                message=("Could not resolve git common dir with `git rev-parse --git-common-dir`"),
                returncode=None,
            )

        current_branch = _resolve_current_branch(cwd)
        if current_branch is None:
            return GtCommandFailure(
                message=("Could not resolve current branch with `git rev-parse --abbrev-ref HEAD`"),
                returncode=None,
            )

        return _read_stack_from_metadata_db(
            common_dir / ".graphite_metadata.db",
            current_branch,
        )
