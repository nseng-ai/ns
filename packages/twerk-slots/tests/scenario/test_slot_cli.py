from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
)
from twerk_slots.cli.main import build_cli
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.testing import (
    FakeClipboardGateway,
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.repo_context import NoRepoSentinel, RepoContext, discover_repo_or_sentinel


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


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
    assert "json" in result.output


def test_slot_list_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot list" in result.output
    assert "List worktree pool slots." in result.output


def test_slot_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


# -- list -------------------------------------------------------------------


def test_slot_list_empty_pool(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=lambda: ctx,
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "slot-16" in result.output
    assert "unallocated" in result.output


def test_slot_list_with_assignment(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path, branches=("feat/x",))

    # First checkout to seed pool state, then list.
    CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x"],
        obj=lambda: ctx,
    )

    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=lambda: ctx,
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "feat/x" in result.output
    assert "assigned" in result.output


def test_slot_list_available_after_free(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path, branches=("feat/x",))

    checkout_res = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x"],
        obj=lambda: ctx,
    )
    assert checkout_res.exit_code == 0, checkout_res.output

    free_res = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01"],
        obj=lambda: ctx,
    )
    assert free_res.exit_code == 0, free_res.output

    json_res = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input="",
        obj=lambda: ctx,
    )
    payload = _json_output(json_res.output)

    assert json_res.exit_code == 0
    slot_01 = next(r for r in payload["rows"] if r["slot_name"] == "slot-01")
    assert slot_01["status"] == "available"
    assert slot_01["branch"] is None
    assert slot_01["worktree_path"] is not None
    assert "slot-01" in slot_01["worktree_path"]
    # Other slots remain unallocated (no worktree on disk).
    unallocated = [r for r in payload["rows"] if r["status"] == "unallocated"]
    assert len(unallocated) == 15


def test_slot_ls_alias(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path)

    list_res = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=lambda: ctx,
        env={"COLUMNS": "200"},
    )
    alias_res = CliRunner().invoke(
        cli_group,
        ["ls"],
        obj=lambda: ctx,
        env={"COLUMNS": "200"},
    )

    assert list_res.exit_code == 0
    assert alias_res.exit_code == 0
    assert alias_res.output == list_res.output


def test_slot_json_list_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["json", "list", "--schema"])
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}


def test_slot_json_list_returns_rows(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _fake_for_repo(tmp_path, branches=("feat/x",))

    CliRunner().invoke(cli_group, ["checkout", "feat/x"], obj=lambda: ctx)

    result = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input="",
        obj=lambda: ctx,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert payload["success"] is True
    assert payload["pool_size"] == 16
    assert payload["repo_name"] == "repo"
    assigned_rows = [r for r in payload["rows"] if r["status"] == "assigned"]
    assert len(assigned_rows) == 1
    assert assigned_rows[0]["branch"] == "feat/x"
    unallocated_rows = [r for r in payload["rows"] if r["status"] == "unallocated"]
    assert len(unallocated_rows) == 15


def test_slot_public_commands_have_json_counterparts(cli_group: ClinkrGroup) -> None:
    json_group = cli_group.commands["json"]
    public_commands = {name for name in cli_group.commands if name != "json"}

    assert public_commands <= set(json_group.commands)


# -- not-in-repo error surface ----------------------------------------------


def test_slot_list_surfaces_no_repo_sentinel(cli_group: ClinkrGroup) -> None:
    sentinel = NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    result = CliRunner().invoke(cli_group, ["list"], obj=lambda: sentinel)

    assert result.exit_code == 1
    assert "Not inside a git repository" in result.output
