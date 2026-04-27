from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
)
from twerk_slots.cli.main import build_cli
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.testing.clipboard import FakeClipboardGateway
from twerk_slots.gateway.testing.pool_state import FakePoolStateGateway
from twerk_slots.gateway.testing.storage import FakeSlotsStorageGateway
from twerk_slots.repo_context import NoRepoSentinel, RepoContext, discover_repo_or_sentinel


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _fake_for_repo(
    tmp_path: Path,
    *,
    slots_root: Path | None = None,
    branches: tuple[str, ...] = (),
    worktrees: tuple[WorktreeInfo, ...] = (),
    current_branch_by_path: dict[Path, str | DetachedHead | GitCommandFailure] | None = None,
    previous_branch_by_path: dict[Path, str | None] | None = None,
    trunk_branch: str = "main",
    file_status_by_path: dict[Path, FileStatus] | None = None,
    extra_existing: Iterable[Path] = (),
    repository_root_by_cwd: dict[Path, Path] | None = None,
) -> SlotsCliContext:
    resolved_slots_root = slots_root if slots_root is not None else (tmp_path / "slots")
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    pool_json_path = resolved_slots_root / "repos" / "repo" / "pool.json"
    storage = FakeSlotsStorageGateway(
        existing_paths={repo_root, Path.cwd(), *extra_existing},
    )
    root_map = (
        dict(repository_root_by_cwd)
        if repository_root_by_cwd is not None
        else {Path.cwd().resolve(): repo_root}
    )
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches=branches,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        previous_branch_by_path=previous_branch_by_path,
        trunk_branch=trunk_branch,
        file_status_by_path=file_status_by_path,
        existing_paths={repo_root, Path.cwd(), *extra_existing},
        repository_root_by_cwd=root_map,
        on_add_worktree=storage.ensure_dir,
    )
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=resolved_slots_root, git=git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    return SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=FakePoolStateGateway(pool_json_path),
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=resolved_slots_root,
    )


def _json_output(text: str) -> dict[str, object]:
    return json.loads(text)


def _machine_data(text: str) -> dict[str, object]:
    payload = _json_output(text)
    assert payload["exit_code"] == 0
    data = payload.get("data")
    assert isinstance(data, dict)
    return data


# -- help / shape -----------------------------------------------------------


def test_slot_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: slot" in result.output
    assert "Manage worktree pool slots." in result.output
    assert "--version" in result.output
    assert "list" in result.output
    assert "checkout" in result.output
    assert "free" in result.output


def test_slot_list_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot list" in result.output
    assert "List worktree pool slots." in result.output
    assert "--format" in result.output
    assert "--schema" in result.output


def test_slot_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


# -- list -------------------------------------------------------------------


def _managed_wt(worktrees_dir: Path, n: int, branch: str | None) -> WorktreeInfo:
    return WorktreeInfo(
        path=worktrees_dir / f"slot-{n:02d}",
        branch=branch,
        is_bare=False,
    )


def _worktrees_dir(tmp_path: Path) -> Path:
    return tmp_path / "slots" / "repos" / "repo" / "worktrees"


def test_slot_list_empty_pool(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["list", "--format", "json"],
        obj=_obj(ctx),
    )
    payload = _machine_data(result.output)

    assert result.exit_code == 0, result.output
    assert payload["pool_size"] == 0
    assert payload["rows"] == []


def test_slot_list_with_assigned_slot(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        worktrees=(_managed_wt(wt_dir, 1, "feat/x"),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_obj(ctx),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "feat/x" in result.output
    assert "assigned" in result.output

    json_res = CliRunner().invoke(cli_group, ["list", "--format", "json"], obj=_obj(ctx))
    payload = _machine_data(json_res.output)
    assert payload["rows"][0]["status"] == "assigned"
    assert payload["rows"][0]["branch"] == "feat/x"


def test_slot_list_available_when_detached(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        worktrees=(_managed_wt(wt_dir, 1, None),),
    )

    json_res = CliRunner().invoke(cli_group, ["list", "--format", "json"], obj=_obj(ctx))
    payload = _machine_data(json_res.output)

    assert json_res.exit_code == 0
    rows = payload["rows"]
    assert isinstance(rows, list)
    assert len(rows) == 1
    slot_01 = rows[0]
    assert slot_01["slot_name"] == "slot-01"
    assert slot_01["status"] == "available"
    assert slot_01["branch"] is None
    assert slot_01["worktree_path"].endswith("slot-01")


def test_slot_ls_alias(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        worktrees=(_managed_wt(wt_dir, 1, None),),
    )

    list_res = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_obj(ctx),
        env={"COLUMNS": "200"},
    )
    alias_res = CliRunner().invoke(
        cli_group,
        ["ls"],
        obj=_obj(ctx),
        env={"COLUMNS": "200"},
    )

    assert list_res.exit_code == 0
    assert alias_res.exit_code == 0
    assert alias_res.output == list_res.output


def test_slot_list_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--schema"])
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema"}


def test_slot_list_format_json_returns_rows(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        worktrees=(
            _managed_wt(wt_dir, 1, "feat/x"),
            _managed_wt(wt_dir, 2, None),
        ),
    )

    result = CliRunner().invoke(cli_group, ["list", "--format", "json"], obj=_obj(ctx))
    payload = _machine_data(result.output)

    assert result.exit_code == 0
    assert payload["pool_size"] == 2
    assert payload["repo_name"] == "repo"
    rows = payload["rows"]
    assert isinstance(rows, list)
    assert len(rows) == 2
    statuses = {r["slot_name"]: r["status"] for r in rows}
    assert statuses == {"slot-01": "assigned", "slot-02": "available"}


def test_slot_list_sorts_by_numeric_suffix(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        branches=("feat/a", "feat/b", "feat/c"),
        worktrees=(
            _managed_wt(wt_dir, 3, "feat/c"),
            _managed_wt(wt_dir, 1, "feat/a"),
            _managed_wt(wt_dir, 2, "feat/b"),
        ),
    )

    json_res = CliRunner().invoke(cli_group, ["list", "--format", "json"], obj=_obj(ctx))
    payload = _machine_data(json_res.output)

    assert [r["slot_name"] for r in payload["rows"]] == ["slot-01", "slot-02", "slot-03"]


def test_slot_list_surfaces_manual_gap(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        branches=("feat/a", "feat/c"),
        worktrees=(
            _managed_wt(wt_dir, 1, "feat/a"),
            _managed_wt(wt_dir, 3, "feat/c"),
        ),
    )

    json_res = CliRunner().invoke(cli_group, ["list", "--format", "json"], obj=_obj(ctx))
    payload = _machine_data(json_res.output)

    assert payload["pool_size"] == 2
    assert [r["slot_name"] for r in payload["rows"]] == ["slot-01", "slot-03"]


def test_slot_list_drops_assigned_at_field(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    wt_dir = _worktrees_dir(tmp_path)
    ctx = _fake_for_repo(
        tmp_path,
        branches=("feat/x",),
        worktrees=(_managed_wt(wt_dir, 1, "feat/x"),),
    )

    json_res = CliRunner().invoke(cli_group, ["list", "--format", "json"], obj=_obj(ctx))
    payload = _machine_data(json_res.output)

    for row in payload["rows"]:
        assert "assigned_at" not in row


def test_slot_list_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--schema"])
    payload = _json_output(result.stdout)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema"}


# -- not-in-repo error surface ----------------------------------------------


def test_slot_list_surfaces_no_repo_sentinel(cli_group: ClinkrGroup) -> None:
    sentinel = NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    result = CliRunner().invoke(cli_group, ["list"], obj=_obj(sentinel))

    assert result.exit_code == 2
    assert "Not inside a git repository" in result.output


def test_slot_list_no_repo_format_json_envelope(cli_group: ClinkrGroup) -> None:
    sentinel = NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    result = CliRunner().invoke(cli_group, ["list", "--format", "json"], obj=_obj(sentinel))
    payload = _json_output(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "not_in_repo"
    assert "Not inside a git repository" in payload["message"]
