"""Real Graphite gateway implementation.

``RealGtGateway.stack()`` reads Graphite's SQLite metadata store at
``<git-common-dir>/.graphite_metadata.db``. ``RealGtGateway.branch_graph()``
reads that store plus ``<git-common-dir>/.graphite_repo_config`` for the
configured trunk. The supported schema contract is the named-column slice
``branch_name``, ``parent_branch_name``, ``children``, and ``validation_result``
from ``branch_metadata``; when Graphite's parent revision columns are present,
``branch_graph()`` also reads them to expose cheap needs-restack facts. Callers
must never depend on ``SELECT *`` or other Graphite-owned columns. Graphite
versions since 1.8.0 have kept the required slice stable while adding nullable
columns via Kysely migrations. If a future migration renames or removes one of
the required columns, metadata reads return a schema-mismatch ``GtCommandFailure``
instead of falling back to human-facing ``gt`` log text parsing.
"""

from __future__ import annotations

import json
import sqlite3
import subprocess
from dataclasses import dataclass
from pathlib import Path

from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.types import (
    GtBranchGraph,
    GtBranchInfo,
    GtCommandFailure,
    GtTrackedBranch,
    NoParent,
    StackInfo,
    UntrackedBranch,
)


@dataclass(frozen=True)
class _BranchMetadataRow:
    parent_branch_name: str | None
    children: tuple[str, ...]
    validation_result: str | None
    needs_restack: bool


_REQUIRED_BRANCH_METADATA_COLUMNS = frozenset(
    {"branch_name", "parent_branch_name", "children", "validation_result"}
)
_RESTACK_METADATA_COLUMNS = frozenset({"parent_branch_revision", "parent_head_revision"})


def _run(argv: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(argv, cwd=cwd, capture_output=True, text=True)
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(argv, 127, stdout="", stderr=str(exc))


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
    result = _run(["git", "rev-parse", "--git-common-dir"], cwd=cwd)
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
    result = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd)
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


def _metadata_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    if value == "":
        return None
    return value


def _needs_restack(parent_revision: str | None, parent_head_revision: str | None) -> bool:
    return (
        parent_revision is not None
        and parent_head_revision is not None
        and parent_revision != parent_head_revision
    )


def _load_branch_metadata(
    db_path: Path,
    *,
    read_restack_metadata: bool,
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

            restack_columns = "NULL, NULL"
            if read_restack_metadata and _RESTACK_METADATA_COLUMNS.issubset(columns):
                restack_columns = "parent_branch_revision, parent_head_revision"

            records = connection.execute(
                f"""
                SELECT branch_name, parent_branch_name, children, validation_result,
                       {restack_columns}
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
        (
            branch_name,
            parent_branch_name,
            raw_children,
            validation_result,
            parent_branch_revision,
            parent_head_revision,
        ) = record
        if not isinstance(branch_name, str) or not branch_name:
            warnings.append("Graphite metadata row has an empty branch_name; row ignored")
            continue
        parent = _metadata_text(parent_branch_name)
        validation = _metadata_text(validation_result)
        rows[branch_name] = _BranchMetadataRow(
            parent_branch_name=parent,
            children=_parse_children(branch_name, raw_children, warnings),
            validation_result=validation,
            needs_restack=_needs_restack(
                _metadata_text(parent_branch_revision),
                _metadata_text(parent_head_revision),
            ),
        )
    return rows, warnings


def _read_repo_config_trunk(common_dir: Path) -> str | GtCommandFailure:
    config_path = common_dir / ".graphite_repo_config"
    if not config_path.exists():
        return GtCommandFailure(
            message=f"Graphite repo config not found at {config_path}",
            returncode=None,
        )

    try:
        raw_config = config_path.read_text(encoding="utf-8")
    except OSError as exc:
        return GtCommandFailure(
            message=f"Graphite repo config unreadable at {config_path}: {exc}",
            returncode=None,
        )

    try:
        config = json.loads(raw_config)
    except json.JSONDecodeError as exc:
        return GtCommandFailure(
            message=f"Graphite repo config malformed at {config_path}: {exc}",
            returncode=None,
        )

    if not isinstance(config, dict):
        return GtCommandFailure(
            message=f"Graphite repo config at {config_path} must be a JSON object with a trunk",
            returncode=None,
        )

    trunk = config.get("trunk")
    if not isinstance(trunk, str) or not trunk:
        return GtCommandFailure(
            message=f"Graphite repo config at {config_path} lacks a non-empty string trunk",
            returncode=None,
        )
    return trunk


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


def _add_graph_trunk_marker_warnings(
    rows: dict[str, _BranchMetadataRow],
    configured_trunk: str,
    warnings: list[str],
) -> None:
    marked_trunks = tuple(
        branch for branch, row in rows.items() if row.validation_result == "TRUNK"
    )
    disagreeing_trunks = tuple(branch for branch in marked_trunks if branch != configured_trunk)
    if disagreeing_trunks:
        warnings.append(
            "Graphite metadata TRUNK marker disagrees with repo-config trunk: "
            f"{disagreeing_trunks[0]} != {configured_trunk}"
        )
    if len(marked_trunks) > 1:
        warnings.append("multiple Graphite metadata rows are marked as trunk")


def _append_reachable_child(
    rows: dict[str, _BranchMetadataRow],
    parent: str,
    child: str,
    children_to_visit: list[str],
    visited: set[str],
    warnings: list[str],
) -> None:
    if child in visited:
        warnings.append(
            f"cycle detected in Graphite children metadata at {child}; edge from {parent} skipped"
        )
        return
    if child not in rows:
        warnings.append(
            f"child branch {child} listed under {parent} is missing from Graphite metadata; skipped"
        )
        return

    child_parent = rows[child].parent_branch_name
    if child_parent != parent:
        actual_parent = child_parent if child_parent is not None else "<none>"
        warnings.append(
            f"child branch {child} metadata parent is {actual_parent}, "
            f"but {parent} lists it as a child"
        )
    children_to_visit.append(child)


def _traverse_branch_graph(
    rows: dict[str, _BranchMetadataRow],
    trunk: str,
    warnings: list[str],
) -> tuple[str, ...]:
    visited: set[str] = set()
    branch_names: list[str] = []
    branches_to_visit = [trunk]

    while branches_to_visit:
        branch = branches_to_visit.pop()
        if branch in visited:
            warnings.append(
                f"cycle detected in Graphite children metadata at {branch}; branch already visited"
            )
            continue

        visited.add(branch)
        branch_names.append(branch)
        children_to_visit: list[str] = []
        for child in rows[branch].children:
            _append_reachable_child(
                rows,
                branch,
                child,
                children_to_visit,
                visited,
                warnings,
            )
        branches_to_visit.extend(reversed(children_to_visit))

    return tuple(branch_names)


def _read_branch_graph_from_metadata_db(
    db_path: Path,
    trunk: str,
) -> GtBranchGraph | GtCommandFailure:
    if not db_path.exists():
        return GtCommandFailure(
            message=f"Graphite metadata store not found at {db_path}",
            returncode=None,
        )

    loaded = _load_branch_metadata(db_path, read_restack_metadata=True)
    if isinstance(loaded, GtCommandFailure):
        return loaded
    rows, warnings = loaded

    if trunk not in rows:
        return GtCommandFailure(
            message=f"Configured Graphite trunk {trunk} is missing from metadata",
            returncode=None,
        )

    _add_graph_trunk_marker_warnings(rows, trunk, warnings)
    branch_names = _traverse_branch_graph(rows, trunk, warnings)
    return GtBranchGraph(
        trunk=trunk,
        branches=tuple(
            GtTrackedBranch(
                name=name,
                parent=rows[name].parent_branch_name,
                children=rows[name].children,
                validation_result=rows[name].validation_result,
                needs_restack=rows[name].needs_restack,
            )
            for name in branch_names
        ),
        warnings=tuple(warnings),
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

    loaded = _load_branch_metadata(db_path, read_restack_metadata=False)
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
        result = _run(["gt", "parent", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        lines = _nonempty_lines(result.stdout)
        if not lines:
            return NoParent()
        return lines[0]

    def children_of(self, cwd: Path) -> tuple[str, ...] | UntrackedBranch | GtCommandFailure:
        result = _run(["gt", "children", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        return _nonempty_lines(result.stdout)

    def trunk(self, cwd: Path) -> str | GtCommandFailure:
        result = _run(["gt", "trunk", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _failure(result)
        lines = _nonempty_lines(result.stdout)
        if not lines:
            return GtCommandFailure(message="gt trunk returned no branch", returncode=0)
        return lines[0]

    def branch_info(self, cwd: Path) -> GtBranchInfo | UntrackedBranch | GtCommandFailure:
        result = _run(["gt", "branch", "info", "--no-interactive"], cwd=cwd)
        if result.returncode != 0:
            return _untracked_or_failure(result)
        return GtBranchInfo(raw_output=result.stdout)

    def restack_upstack(self, cwd: Path, branch: str) -> GtCommandFailure | None:
        # gt restack accepts --branch even when invoked from the branch's own
        # worktree; redundant but explicit and survives if cwd inference
        # changes upstream.
        result = _run(
            ["gt", "restack", "--branch", branch, "--upstack", "--no-interactive"],
            cwd=cwd,
        )
        if result.returncode != 0:
            return _failure(result)
        return None

    def sync(self, cwd: Path, *, restack: bool) -> GtCommandFailure | None:
        args = ["gt", "sync", "--no-interactive", "--force"]
        if not restack:
            args.append("--no-restack")
        result = _run(args, cwd=cwd)
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

    def branch_graph(self, cwd: Path) -> GtBranchGraph | GtCommandFailure:
        common_dir = _resolve_git_common_dir(cwd)
        if common_dir is None:
            return GtCommandFailure(
                message=("Could not resolve git common dir with `git rev-parse --git-common-dir`"),
                returncode=None,
            )

        trunk = _read_repo_config_trunk(common_dir)
        if isinstance(trunk, GtCommandFailure):
            return trunk

        return _read_branch_graph_from_metadata_db(
            common_dir / ".graphite_metadata.db",
            trunk,
        )
