from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from asdl_core.gt.metadata_reader import read_stack_from_metadata_db
from asdl_core.gt.types import (
    ChildrenCorruption,
    DescendantWalk,
    GtCommandFailure,
    StackFork,
    StackInfo,
    TrunkMarkerClean,
    TrunkMarkerProblem,
    UntrackedBranch,
    WalkCompleted,
    WalkCycle,
    WalkRowMissing,
)


@dataclass(frozen=True)
class _BranchRow:
    branch_name: str
    parent_branch_name: str | None
    children: tuple[str, ...] = ()
    validation_result: str | None = None
    raw_children: object | None = None


def _build_metadata_db(tmp_path: Path, branches: list[_BranchRow]) -> Path:
    db_path = tmp_path / ".graphite_metadata.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE branch_metadata (
                branch_name TEXT PRIMARY KEY,
                parent_branch_name TEXT,
                children TEXT NOT NULL,
                validation_result TEXT,
                extra_graphite_column TEXT
            )
            """
        )
        connection.executemany(
            """
            INSERT INTO branch_metadata (
                branch_name,
                parent_branch_name,
                children,
                validation_result,
                extra_graphite_column
            ) VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    branch.branch_name,
                    branch.parent_branch_name,
                    branch.raw_children
                    if branch.raw_children is not None
                    else json.dumps(list(branch.children)),
                    branch.validation_result,
                    None,
                )
                for branch in branches
            ],
        )
    return db_path


def test_gt_metadata_reader_reads_linear_stack(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/mid",), "TRUNK"),
            _BranchRow("feat/mid", "main", ("feat/current",)),
            _BranchRow("feat/current", "feat/mid"),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert result == StackInfo(
        trunk="main",
        current="feat/current",
        ancestors=("main", "feat/mid"),
        children=(),
        descendants=(),
    )
    assert isinstance(result, StackInfo)
    assert isinstance(result.ancestor_termination, WalkCompleted)
    assert result.descendant_walk == DescendantWalk()
    assert result.trunk_marker == TrunkMarkerClean()
    assert result.unwalked_children_corruptions == ()
    assert result.empty_branch_name_rows == 0
    assert result.render_warnings() == ()


def test_gt_metadata_reader_handles_current_trunk(tmp_path: Path) -> None:
    db_path = _build_metadata_db(tmp_path, [_BranchRow("main", None, (), "TRUNK")])

    result = read_stack_from_metadata_db(db_path, "main")

    assert result == StackInfo(
        trunk="main",
        current="main",
        ancestors=(),
        children=(),
        descendants=(),
    )


def test_gt_metadata_reader_preserves_fork_children_and_warns_on_descendant_walk(
    tmp_path: Path,
) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow("feat/current", "main", ("feat/a", "feat/b")),
            _BranchRow("feat/a", "feat/current", ("feat/a2",)),
            _BranchRow("feat/a2", "feat/a"),
            _BranchRow("feat/b", "feat/current"),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.children == ("feat/a", "feat/b")
    assert result.descendants == ("feat/a", "feat/a2")
    assert result.descendant_walk.forks == (
        StackFork(branch="feat/current", children=("feat/a", "feat/b")),
    )
    assert result.descendant_walk.is_clean is False
    assert any("first child only" in warning for warning in result.render_warnings())


def test_gt_metadata_reader_returns_untracked_for_missing_current_branch(
    tmp_path: Path,
) -> None:
    db_path = _build_metadata_db(tmp_path, [_BranchRow("main", None, (), "TRUNK")])

    result = read_stack_from_metadata_db(db_path, "feat/missing")

    assert isinstance(result, UntrackedBranch)
    assert "feat/missing" in result.message


def test_gt_metadata_reader_returns_failure_for_missing_metadata_db(tmp_path: Path) -> None:
    db_path = tmp_path / ".graphite_metadata.db"

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "not found" in result.message
    assert str(db_path) in result.message


def test_gt_metadata_reader_returns_failure_for_schema_mismatch(tmp_path: Path) -> None:
    db_path = tmp_path / ".graphite_metadata.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute("CREATE TABLE branch_metadata (branch_name TEXT PRIMARY KEY)")

    result = read_stack_from_metadata_db(db_path, "main")

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "schema mismatch" in result.message


def test_gt_metadata_reader_warns_for_children_not_text(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow("feat/current", "main", raw_children=sqlite3.Binary(b"[]")),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.children == ()
    assert result.descendant_walk.children_corruptions == (
        ChildrenCorruption(branch="feat/current", kind="not_text"),
    )
    assert result.unwalked_children_corruptions == ()
    assert any("not JSON text" in warning for warning in result.render_warnings())


def test_gt_metadata_reader_warns_for_malformed_children_json(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow("feat/current", "main", raw_children="{not json"),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.children == ()
    assert result.descendant_walk.children_corruptions == (
        ChildrenCorruption(branch="feat/current", kind="invalid_json"),
    )
    assert any("not valid JSON" in warning for warning in result.render_warnings())


def test_gt_metadata_reader_warns_for_children_not_list(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow("feat/current", "main", raw_children=json.dumps({"child": "feat/a"})),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.children == ()
    assert result.descendant_walk.children_corruptions == (
        ChildrenCorruption(branch="feat/current", kind="not_list"),
    )
    assert any("not a JSON list" in warning for warning in result.render_warnings())


def test_gt_metadata_reader_filters_non_string_children_with_warning(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow("feat/current", "main", raw_children=json.dumps(["feat/a", 1])),
            _BranchRow("feat/a", "feat/current"),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.children == ("feat/a",)
    assert result.descendants == ("feat/a",)
    assert result.descendant_walk.children_corruptions == (
        ChildrenCorruption(branch="feat/current", kind="non_string"),
    )
    assert result.unwalked_children_corruptions == ()
    assert any("contains non-string entries" in warning for warning in result.render_warnings())


def test_gt_metadata_reader_partitions_unwalked_children_corruptions(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow("feat/current", "main"),
            _BranchRow("feat/unwalked", "main", raw_children="{not json"),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.descendant_walk.children_corruptions == ()
    assert result.unwalked_children_corruptions == (
        ChildrenCorruption(branch="feat/unwalked", kind="invalid_json"),
    )
    assert any("feat/unwalked" in warning for warning in result.render_warnings())


def test_gt_metadata_reader_warns_for_empty_branch_name(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, (), "TRUNK"),
            _BranchRow("", None),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "main")

    assert isinstance(result, StackInfo)
    assert result.empty_branch_name_rows == 1
    assert any(
        "Graphite metadata row has an empty branch_name" in warning
        for warning in result.render_warnings()
    )


def test_gt_metadata_reader_warns_for_ancestor_cycle(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("feat/a", "feat/b"),
            _BranchRow("feat/b", "feat/a", validation_result="TRUNK"),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/a")

    assert isinstance(result, StackInfo)
    assert result.ancestors == ("feat/b",)
    assert result.ancestor_termination == WalkCycle("feat/a")
    assert any(
        "cycle detected in Graphite parent metadata" in warning
        for warning in result.render_warnings()
    )


def test_gt_metadata_reader_warns_for_missing_parent(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [_BranchRow("feat/current", "feat/missing-parent")],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.ancestors == ("feat/missing-parent",)
    assert result.ancestor_termination == WalkRowMissing("feat/missing-parent")
    assert any(
        "parent branch feat/missing-parent is missing" in warning
        for warning in result.render_warnings()
    )
    assert result.trunk_marker == TrunkMarkerProblem(
        terminus="feat/missing-parent",
        terminus_state="row_missing",
        marked_trunks=(),
    )
    assert any("trunk row marker missing" in warning for warning in result.render_warnings())


def test_gt_metadata_reader_warns_for_descendant_cycle(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow("feat/current", "main", ("feat/a",)),
            _BranchRow("feat/a", "feat/current", ("feat/current",)),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.descendants == ("feat/a",)
    assert result.descendant_walk.termination == WalkCycle("feat/current")
    assert any(
        "cycle detected in Graphite children metadata" in warning
        for warning in result.render_warnings()
    )


def test_gt_metadata_reader_warns_for_missing_child(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow("feat/current", "main", ("feat/missing-child",)),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.descendants == ("feat/missing-child",)
    assert result.descendant_walk.termination == WalkRowMissing("feat/missing-child")
    assert any(
        "child branch feat/missing-child is missing" in warning
        for warning in result.render_warnings()
    )


def test_gt_metadata_reader_warns_for_trunk_marker_anomalies(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",)),
            _BranchRow("other", None, (), "TRUNK"),
            _BranchRow("feat/current", "main", validation_result="TRUNK"),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.trunk_marker == TrunkMarkerProblem(
        terminus="main",
        terminus_state="unmarked",
        marked_trunks=("other", "feat/current"),
    )
    assert any("trunk row marker missing" in warning for warning in result.render_warnings())
    assert any("multiple Graphite metadata rows" in warning for warning in result.render_warnings())
    assert any("trunk marker differs" in warning for warning in result.render_warnings())


def test_gt_metadata_reader_render_warnings_composes_integrity_model(tmp_path: Path) -> None:
    db_path = _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",)),
            _BranchRow("other", None, (), "TRUNK"),
            _BranchRow("feat/current", "main", ("feat/a", "feat/b")),
            _BranchRow("feat/a", "feat/current", raw_children="{not json"),
            _BranchRow("feat/b", "feat/current"),
        ],
    )

    result = read_stack_from_metadata_db(db_path, "feat/current")

    assert isinstance(result, StackInfo)
    assert result.render_warnings() == (
        "children metadata for feat/a is not valid JSON; treating as no children",
        "branch feat/current has 2 Graphite children; descendants follow the first child only",
        "trunk row marker missing",
        "Graphite metadata trunk marker differs from ancestor-walk terminus: other != main",
    )
