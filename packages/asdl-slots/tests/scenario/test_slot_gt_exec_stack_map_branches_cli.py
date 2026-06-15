from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, WorktreeInfo
from asdl_core.gt.testing import FakeGtGateway
from asdl_core.gt.types import (
    DescendantWalk,
    GtCommandFailure,
    StackFork,
    StackInfo,
    UntrackedBranch,
)
from asdl_slots.cli.main import build_cli
from asdl_slots.cli.slot.gt.context import SlotGtContext
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import RepoContext


@dataclass(frozen=True)
class _BranchRow:
    branch_name: str
    parent_branch_name: str | None
    children: tuple[str, ...] = ()
    validation_result: str | None = None


@dataclass(frozen=True)
class _StackMapFakes:
    ctx: SlotGtContext
    repo_root: Path
    git_common_dir: Path


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _machine_payload(result_output: str) -> dict[str, Any]:
    payload = json.loads(result_output)
    assert isinstance(payload, dict)
    return payload


def _build_metadata_db(git_common_dir: Path, rows: list[_BranchRow]) -> None:
    git_common_dir.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(git_common_dir / ".graphite_metadata.db") as connection:
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
        connection.executemany(
            """
            INSERT INTO branch_metadata (
                branch_name,
                parent_branch_name,
                children,
                validation_result
            ) VALUES (?, ?, ?, ?)
            """,
            [
                (
                    row.branch_name,
                    row.parent_branch_name,
                    json.dumps(list(row.children)),
                    row.validation_result,
                )
                for row in rows
            ],
        )


def _stack(
    *,
    current: str = "feature/current",
    trunk: str = "main",
    ancestors: tuple[str, ...] = ("main",),
    descendants: tuple[str, ...] = (),
    descendant_walk: DescendantWalk | None = None,
) -> StackInfo:
    return StackInfo(
        trunk=trunk,
        current=current,
        ancestors=ancestors,
        children=descendants[:1],
        descendants=descendants,
        descendant_walk=descendant_walk if descendant_walk is not None else DescendantWalk(),
    )


def _build_fakes(
    tmp_path: Path,
    *,
    rows: list[_BranchRow] | None = None,
    current_branch_result: str | DetachedHead | GitCommandFailure | None = None,
    stack_result: StackInfo | UntrackedBranch | GtCommandFailure | None = None,
    slot_branch: str | None = "feature/slot",
    recent_branch_isos: dict[str, str | None] | None = None,
    local_branches: set[str] | None = None,
    create_db: bool = True,
) -> _StackMapFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    git_common_dir = tmp_path / "common-git"
    metadata_rows = rows if rows is not None else _default_rows()
    if create_db:
        _build_metadata_db(git_common_dir, metadata_rows)

    slot_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-04"
    worktrees = [WorktreeInfo(path=repo_root, branch="feature/current", is_bare=False)]
    if slot_branch is not None:
        worktrees.append(WorktreeInfo(path=slot_path, branch=slot_branch, is_bare=False))

    if local_branches is not None:
        branch_names = set(local_branches)
    else:
        branch_names = {row.branch_name for row in metadata_rows if row.branch_name}
        branch_names.update(recent_branch_isos or {})
        branch_names.add("feature/current")
    branch_result = (
        current_branch_result if current_branch_result is not None else "feature/current"
    )
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=git_common_dir,
        branches=branch_names,
        worktrees=tuple(worktrees),
        current_branch_by_path={repo_root: branch_result},
        branch_head_iso_by_branch=recent_branch_isos or {},
        existing_paths={repo_root, slot_path},
        repository_root_by_cwd={repo_root: repo_root},
        trunk_branch="main",
    )
    repo = RepoContext(
        root=repo_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=tmp_path / "slots" / "repos" / "repo",
        worktrees_dir=tmp_path / "slots" / "repos" / "repo" / "worktrees",
    )
    slots_ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=FakeSlotsStorageGateway(existing_paths={repo_root}),
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=tmp_path / "slots",
    )
    gt = FakeGtGateway(
        branch_by_cwd={repo_root: "feature/current"},
        stack_by_branch={"feature/current": stack_result if stack_result is not None else _stack()},
    )
    return _StackMapFakes(
        ctx=SlotGtContext(slots=slots_ctx, gt=gt),
        repo_root=repo_root,
        git_common_dir=git_common_dir,
    )


def _default_rows() -> list[_BranchRow]:
    return [
        _BranchRow("main", None, ("feature/current", "feature/slot", "feature/recent"), "TRUNK"),
        _BranchRow("feature/current", "main", ("feature/child",), "VALID"),
        _BranchRow("feature/child", "feature/current", (), "VALID"),
        _BranchRow("feature/slot", "main", ("feature/slot-child",), "VALID"),
        _BranchRow("feature/slot-child", "feature/slot", (), "VALID"),
        _BranchRow("feature/recent", "main", (), "VALID"),
        _BranchRow("feature/restack", "main", (), "BAD_PARENT_NAME"),
    ]


def test_slot_gt_exec_stack_map_branches_help_works(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "exec", "stack-map-branches", "-h"])

    assert result.exit_code == 0, result.output
    assert "Usage: slot gt exec stack-map-branches" in result.output
    assert "--recent-limit" in result.output


def test_stack_map_branches_json_includes_graph_slots_and_recent_branches(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fakes = _build_fakes(
        tmp_path,
        recent_branch_isos={"feature/recent": "2026-01-02T00:00:00+00:00"},
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-map-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert result.exit_code == 0, result.output
    assert payload["data"]["current"] == "feature/current"
    assert payload["data"]["trunk"] == "main"
    assert payload["data"]["scope"] == "stack-map"
    branch_names = [branch["name"] for branch in payload["data"]["branches"]]
    assert branch_names == [
        "feature/child",
        "feature/current",
        "feature/recent",
        "feature/restack",
        "feature/slot",
        "feature/slot-child",
        "main",
    ]
    assert {"parent": "main", "child": "feature/slot"} in payload["data"]["edges"]
    assert payload["data"]["slots"] == [
        {
            "slot_name": "slot-04",
            "branch": "feature/slot",
            "worktree_path": str(tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-04"),
            "status": "assigned",
        }
    ]


def test_stack_map_branches_recent_untracked_branch_is_skipped(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fakes = _build_fakes(
        tmp_path,
        slot_branch=None,
        recent_branch_isos={
            "feature/recent": "2026-01-02T00:00:00+00:00",
            "feature/untracked": "2026-01-03T00:00:00+00:00",
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-map-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    branch_names = [branch["name"] for branch in payload["data"]["branches"]]
    assert "feature/recent" in branch_names
    assert "feature/untracked" not in branch_names
    assert payload["data"]["warnings"] == []


def test_stack_map_branches_excludes_stale_metadata_branches(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    rows = [
        _BranchRow("main", None, ("feature/current", "stale-1"), "TRUNK"),
        _BranchRow("feature/current", "main", (), "VALID"),
        _BranchRow("stale-1", "main", ("stale-2",), "VALID"),
        _BranchRow("stale-2", "stale-1", (), "VALID"),
    ]
    fakes = _build_fakes(
        tmp_path,
        rows=rows,
        slot_branch=None,
        local_branches={"main", "feature/current"},
        stack_result=_stack(current="feature/current", trunk="main", ancestors=("main",)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-map-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert result.exit_code == 0, result.output
    branch_names = [branch["name"] for branch in payload["data"]["branches"]]
    assert branch_names == ["feature/current", "main"]
    assert "stale-1" not in branch_names and "stale-2" not in branch_names


def test_stack_map_branches_marks_needs_restack_without_failing(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fakes = _build_fakes(
        tmp_path,
        slot_branch="feature/restack",
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-map-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    restack = next(
        branch for branch in payload["data"]["branches"] if branch["name"] == "feature/restack"
    )
    assert restack["needs_restack"] is True


def test_stack_map_branches_forked_graph_warns_instead_of_failing(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fork = StackFork(branch="feature/current", children=("feature/a", "feature/b"))
    fakes = _build_fakes(
        tmp_path,
        rows=[
            _BranchRow("main", None, ("feature/current",), "TRUNK"),
            _BranchRow("feature/current", "main", ("feature/a", "feature/b"), "VALID"),
            _BranchRow("feature/a", "feature/current"),
            _BranchRow("feature/b", "feature/current"),
        ],
        slot_branch=None,
        stack_result=_stack(
            descendants=("feature/a",),
            descendant_walk=DescendantWalk(forks=(fork,)),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-map-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert result.exit_code == 0, result.output
    assert any(
        "branch feature/current has 2 Graphite children" in warning
        for warning in payload["data"]["warnings"]
    )
    branch_names = [branch["name"] for branch in payload["data"]["branches"]]
    assert "feature/a" in branch_names
    assert "feature/b" in branch_names


@pytest.mark.parametrize(
    ("stack_result", "error_type", "message"),
    [
        (
            UntrackedBranch(message="current branch is not tracked by Graphite: feature/current"),
            "untracked_branch",
            "run `gt track` first",
        ),
        (
            GtCommandFailure(message="metadata unavailable", returncode=1),
            "gt_stack_read_failed",
            "metadata unavailable",
        ),
    ],
)
def test_stack_map_branches_stack_read_failures(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    stack_result: UntrackedBranch | GtCommandFailure,
    error_type: str,
    message: str,
) -> None:
    fakes = _build_fakes(tmp_path, stack_result=stack_result)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-map-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == error_type
    assert message in payload["message"]


def test_stack_map_branches_detached_head(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_fakes(tmp_path, current_branch_result=DetachedHead())

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-map-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "detached_head"


def test_stack_map_branches_missing_metadata_db(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_fakes(tmp_path, create_db=False)

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-map-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "gt_metadata_read_failed"
    assert "not found" in payload["message"]


def test_stack_map_branches_schema_mismatch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _build_fakes(tmp_path, create_db=False)
    fakes.git_common_dir.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(fakes.git_common_dir / ".graphite_metadata.db") as connection:
        connection.execute("CREATE TABLE branch_metadata (branch_name TEXT PRIMARY KEY)")

    result = CliRunner().invoke(
        cli_group,
        ["gt", "exec", "stack-map-branches", "--format", "json"],
        obj=_obj(fakes.ctx),
    )

    payload = _machine_payload(result.stdout)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "gt_metadata_read_failed"
    assert "schema mismatch" in payload["message"]
