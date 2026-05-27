from __future__ import annotations

import json
import sqlite3
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest

from asdl_core.gt.real_gateway import RealGtGateway
from asdl_core.gt.types import (
    GtBranchGraph,
    GtCommandFailure,
    GtTrackedBranch,
    StackInfo,
    UntrackedBranch,
)


@dataclass(frozen=True)
class _BranchRow:
    branch_name: str
    parent_branch_name: str | None
    children: tuple[str, ...] = ()
    validation_result: str | None = None
    raw_children: str | None = None
    parent_branch_revision: str | None = None
    parent_head_revision: str | None = None


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
                parent_branch_revision TEXT,
                parent_head_revision TEXT
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
                parent_branch_revision,
                parent_head_revision
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    branch.branch_name,
                    branch.parent_branch_name,
                    branch.raw_children
                    if branch.raw_children is not None
                    else json.dumps(list(branch.children)),
                    branch.validation_result,
                    branch.parent_branch_revision,
                    branch.parent_head_revision,
                )
                for branch in branches
            ],
        )
    return db_path


def _write_repo_config(common_dir: Path, *, trunk: str = "main") -> Path:
    config_path = common_dir / ".graphite_repo_config"
    config_path.write_text(json.dumps({"trunk": trunk}), encoding="utf-8")
    return config_path


def _patch_git_rev_parse(
    monkeypatch: pytest.MonkeyPatch,
    *,
    common_dir: Path | None,
    current_branch: str = "feat/current",
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "rev-parse", "--git-common-dir"]:
            if common_dir is None:
                return subprocess.CompletedProcess(
                    cmd,
                    128,
                    stdout="",
                    stderr="fatal: not a git repository",
                )
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{common_dir}\n", stderr="")
        if cmd == ["git", "rev-parse", "--abbrev-ref", "HEAD"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{current_branch}\n", stderr="")
        raise AssertionError(f"unexpected subprocess invocation: {cmd!r}")

    monkeypatch.setattr("asdl_core.gt.real_gateway.subprocess.run", fake_run)


def _patch_git_common_dir_only(
    monkeypatch: pytest.MonkeyPatch,
    *,
    common_dir: Path | None,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd == ["git", "rev-parse", "--git-common-dir"]:
            if common_dir is None:
                return subprocess.CompletedProcess(
                    cmd,
                    128,
                    stdout="",
                    stderr="fatal: not a git repository",
                )
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{common_dir}\n", stderr="")
        if cmd and cmd[0] == "gt":
            raise AssertionError(f"branch_graph must not invoke gt: {cmd!r}")
        raise AssertionError(f"unexpected subprocess invocation: {cmd!r}")

    monkeypatch.setattr("asdl_core.gt.real_gateway.subprocess.run", fake_run)


def test_real_gt_gateway_missing_gt_returns_command_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError("gt: not found")

    monkeypatch.setattr("asdl_core.gt.real_gateway.subprocess.run", fake_run)

    result = RealGtGateway().trunk(Path("/repo"))

    assert isinstance(result, GtCommandFailure)
    assert result.returncode == 127
    assert "gt: not found" in result.message


def test_real_gt_gateway_stack_reads_linear_metadata_stack(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/mid",), "TRUNK"),
            _BranchRow("feat/mid", "main", ("feat/current",)),
            _BranchRow("feat/current", "feat/mid"),
        ],
    )
    _patch_git_rev_parse(monkeypatch, common_dir=tmp_path, current_branch="feat/current")

    result = RealGtGateway().stack(tmp_path)

    assert result == StackInfo(
        trunk="main",
        current="feat/current",
        ancestors=("main", "feat/mid"),
        children=(),
        warnings=(),
        descendants=(),
    )


def test_real_gt_gateway_stack_handles_current_trunk(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(tmp_path, [_BranchRow("main", None, (), "TRUNK")])
    _patch_git_rev_parse(monkeypatch, common_dir=tmp_path, current_branch="main")

    result = RealGtGateway().stack(tmp_path)

    assert result == StackInfo(
        trunk="main",
        current="main",
        ancestors=(),
        children=(),
        warnings=(),
        descendants=(),
    )


def test_real_gt_gateway_stack_preserves_fork_children_and_warns_on_descendant_walk(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow("feat/current", "main", ("feat/a", "feat/b")),
            _BranchRow("feat/a", "feat/current", ("feat/a2",)),
            _BranchRow("feat/a2", "feat/a"),
            _BranchRow("feat/b", "feat/current"),
        ],
    )
    _patch_git_rev_parse(monkeypatch, common_dir=tmp_path, current_branch="feat/current")

    result = RealGtGateway().stack(tmp_path)

    assert isinstance(result, StackInfo)
    assert result.children == ("feat/a", "feat/b")
    assert result.descendants == ("feat/a", "feat/a2")
    assert any("first child only" in warning for warning in result.warnings)


def test_real_gt_gateway_stack_returns_untracked_for_missing_current_branch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(tmp_path, [_BranchRow("main", None, (), "TRUNK")])
    _patch_git_rev_parse(monkeypatch, common_dir=tmp_path, current_branch="feat/missing")

    result = RealGtGateway().stack(tmp_path)

    assert isinstance(result, UntrackedBranch)
    assert "feat/missing" in result.message


def test_real_gt_gateway_stack_returns_failure_for_missing_metadata_db(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_git_rev_parse(monkeypatch, common_dir=tmp_path, current_branch="feat/current")

    result = RealGtGateway().stack(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "not found" in result.message
    assert str(tmp_path / ".graphite_metadata.db") in result.message


def test_real_gt_gateway_stack_returns_failure_for_schema_mismatch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db_path = tmp_path / ".graphite_metadata.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute("CREATE TABLE branch_metadata (branch_name TEXT PRIMARY KEY)")
    _patch_git_rev_parse(monkeypatch, common_dir=tmp_path, current_branch="main")

    result = RealGtGateway().stack(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "schema mismatch" in result.message


def test_real_gt_gateway_stack_returns_failure_when_common_dir_resolution_fails(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_git_rev_parse(monkeypatch, common_dir=None, current_branch="feat/current")

    result = RealGtGateway().stack(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "git common dir" in result.message


def test_real_gt_gateway_branch_graph_reads_linear_graph(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/a",), "TRUNK"),
            _BranchRow("feat/a", "main", ("feat/b",)),
            _BranchRow("feat/b", "feat/a"),
        ],
    )
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert result == GtBranchGraph(
        trunk="main",
        branches=(
            GtTrackedBranch(
                name="main",
                parent=None,
                children=("feat/a",),
                validation_result="TRUNK",
            ),
            GtTrackedBranch(
                name="feat/a",
                parent="main",
                children=("feat/b",),
                validation_result=None,
            ),
            GtTrackedBranch(
                name="feat/b",
                parent="feat/a",
                children=(),
                validation_result=None,
            ),
        ),
        warnings=(),
    )


def test_real_gt_gateway_branch_graph_marks_parent_head_drift_as_needs_restack(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/current",), "TRUNK"),
            _BranchRow(
                "feat/current",
                "main",
                validation_result="VALID",
                parent_branch_revision="old-parent-head",
                parent_head_revision="new-parent-head",
            ),
        ],
    )
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert result.branches[1] == GtTrackedBranch(
        name="feat/current",
        parent="main",
        children=(),
        validation_result="VALID",
        needs_restack=True,
    )


def test_real_gt_gateway_branch_graph_tolerates_missing_restack_columns(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db_path = tmp_path / ".graphite_metadata.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE branch_metadata (
                branch_name TEXT PRIMARY KEY,
                parent_branch_name TEXT,
                children TEXT NOT NULL,
                validation_result TEXT
            )
            """
        )
        connection.execute(
            """
            INSERT INTO branch_metadata (
                branch_name,
                parent_branch_name,
                children,
                validation_result
            ) VALUES (?, ?, ?, ?)
            """,
            ("main", None, "[]", "TRUNK"),
        )
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert result.branches[0].needs_restack is False


def test_real_gt_gateway_branch_graph_preserves_fork_child_order(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/a", "feat/b"), "TRUNK"),
            _BranchRow("feat/a", "main", ("feat/a2",)),
            _BranchRow("feat/a2", "feat/a"),
            _BranchRow("feat/b", "main"),
        ],
    )
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert tuple(branch.name for branch in result.branches) == (
        "main",
        "feat/a",
        "feat/a2",
        "feat/b",
    )
    assert result.branches[0].children == ("feat/a", "feat/b")


def test_real_gt_gateway_branch_graph_does_not_resolve_current_branch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(tmp_path, [_BranchRow("main", None, (), "TRUNK")])
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert result.trunk == "main"


def test_real_gt_gateway_branch_graph_scopes_to_configured_trunk(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/a",), "TRUNK"),
            _BranchRow("feat/a", "main"),
            _BranchRow("other-trunk", None, ("other/child",), "TRUNK"),
            _BranchRow("other/child", "other-trunk"),
            _BranchRow("orphan", "missing-parent"),
        ],
    )
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert tuple(branch.name for branch in result.branches) == ("main", "feat/a")
    assert any("TRUNK marker disagrees" in warning for warning in result.warnings)


def test_real_gt_gateway_branch_graph_returns_failure_for_schema_mismatch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db_path = tmp_path / ".graphite_metadata.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute("CREATE TABLE branch_metadata (branch_name TEXT PRIMARY KEY)")
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "schema mismatch" in result.message


def test_real_gt_gateway_branch_graph_returns_failure_for_missing_metadata_db(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "not found" in result.message
    assert str(tmp_path / ".graphite_metadata.db") in result.message


def test_real_gt_gateway_branch_graph_returns_failure_for_missing_repo_config(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(tmp_path, [_BranchRow("main", None, (), "TRUNK")])
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "repo config" in result.message
    assert "not found" in result.message


def test_real_gt_gateway_branch_graph_returns_failure_for_malformed_repo_config(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(tmp_path, [_BranchRow("main", None, (), "TRUNK")])
    (tmp_path / ".graphite_repo_config").write_text("not json", encoding="utf-8")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "repo config" in result.message
    assert "malformed" in result.message


def test_real_gt_gateway_branch_graph_returns_failure_for_missing_configured_trunk(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(tmp_path, [_BranchRow("master", None, (), "TRUNK")])
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtCommandFailure)
    assert result.returncode is None
    assert "main" in result.message
    assert "missing from metadata" in result.message


def test_real_gt_gateway_branch_graph_warns_for_malformed_child_metadata(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, validation_result="TRUNK", raw_children='["feat/a", 42]'),
            _BranchRow("feat/a", "main", raw_children="not json"),
        ],
    )
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert tuple(branch.name for branch in result.branches) == ("main", "feat/a")
    assert any("non-string entries" in warning for warning in result.warnings)
    assert any("not valid JSON" in warning for warning in result.warnings)


def test_real_gt_gateway_branch_graph_warns_for_missing_reachable_child_row(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/missing", "feat/present"), "TRUNK"),
            _BranchRow("feat/present", "main"),
        ],
    )
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert tuple(branch.name for branch in result.branches) == ("main", "feat/present")
    assert any("feat/missing" in warning for warning in result.warnings)
    assert any("missing from Graphite metadata" in warning for warning in result.warnings)


def test_real_gt_gateway_branch_graph_warns_for_parent_child_disagreement(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/a",), "TRUNK"),
            _BranchRow("feat/a", "other-parent"),
        ],
    )
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert tuple(branch.name for branch in result.branches) == ("main", "feat/a")
    assert any("other-parent" in warning for warning in result.warnings)
    assert any("lists it as a child" in warning for warning in result.warnings)


def test_real_gt_gateway_branch_graph_warns_and_terminates_on_cycle(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(
        tmp_path,
        [
            _BranchRow("main", None, ("feat/a",), "TRUNK"),
            _BranchRow("feat/a", "main", ("main",)),
        ],
    )
    _write_repo_config(tmp_path, trunk="main")
    _patch_git_common_dir_only(monkeypatch, common_dir=tmp_path)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert tuple(branch.name for branch in result.branches) == ("main", "feat/a")
    assert any("cycle detected" in warning for warning in result.warnings)


def test_real_gt_gateway_branch_graph_does_not_invoke_gt(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _build_metadata_db(tmp_path, [_BranchRow("main", None, (), "TRUNK")])
    _write_repo_config(tmp_path, trunk="main")
    invocations: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        invocations.append(cmd)
        if cmd == ["git", "rev-parse", "--git-common-dir"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{tmp_path}\n", stderr="")
        if cmd and cmd[0] == "gt":
            raise AssertionError(f"branch_graph must not invoke gt: {cmd!r}")
        raise AssertionError(f"unexpected subprocess invocation: {cmd!r}")

    monkeypatch.setattr("asdl_core.gt.real_gateway.subprocess.run", fake_run)

    result = RealGtGateway().branch_graph(tmp_path)

    assert isinstance(result, GtBranchGraph)
    assert invocations == [["git", "rev-parse", "--git-common-dir"]]
