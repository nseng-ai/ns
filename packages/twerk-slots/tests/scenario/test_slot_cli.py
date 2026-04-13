from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_slots.cli.main import build_cli
from twerk_slots.gateway import real_git
from twerk_slots.gateway.git import FileStatus, WorktreeInfo
from twerk_slots.gateway.testing import (
    FakeClipboardGateway,
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _SlotFakes:
    git: FakeGitGateway
    storage: FakeSlotsStorageGateway
    pool_state: FakePoolStateGateway
    clipboard: FakeClipboardGateway
    repo_root: Path


def _make_obj(fakes: _SlotFakes, slots_root: Path) -> dict[str, object]:
    return {
        "git_gateway": fakes.git,
        "storage_gateway": fakes.storage,
        "pool_state_gateway": fakes.pool_state,
        "clipboard_gateway": fakes.clipboard,
        "slots_root": slots_root,
    }


def _fake_for_repo(
    tmp_path: Path,
    *,
    branches: tuple[str, ...] = (),
    worktrees: tuple[WorktreeInfo, ...] = (),
    current_branch_by_path: dict[Path, str | None] | None = None,
    previous_branch_by_path: dict[Path, str | None] | None = None,
    trunk_branch: str | None = None,
    file_status_by_path: dict[Path, FileStatus] | None = None,
    extra_existing: Iterable[Path] = (),
    repository_root_by_cwd: dict[Path, Path] | None = None,
) -> _SlotFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    pool_json_path = tmp_path / "slots" / "repos" / "repo" / "pool.json"
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
        storage=storage,
    )
    return _SlotFakes(
        git=git,
        storage=storage,
        pool_state=FakePoolStateGateway(pool_json_path),
        clipboard=FakeClipboardGateway(),
        repo_root=repo_root,
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
    fakes = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "slot-01" in result.output
    assert "slot-16" in result.output
    assert "unallocated" in result.output


def test_slot_list_with_assignment(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slots_root = tmp_path / "slots"

    # First checkout to seed pool state, then list.
    CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x"],
        obj=_make_obj(fakes, slots_root),
    )

    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(fakes, slots_root),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "feat/x" in result.output
    assert "assigned" in result.output


def test_slot_list_available_after_free(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slots_root = tmp_path / "slots"

    checkout_res = CliRunner().invoke(
        cli_group,
        ["checkout", "feat/x"],
        obj=_make_obj(fakes, slots_root),
    )
    assert checkout_res.exit_code == 0, checkout_res.output

    free_res = CliRunner().invoke(
        cli_group,
        ["free", "--wt", "slot-01"],
        obj=_make_obj(fakes, slots_root),
    )
    assert free_res.exit_code == 0, free_res.output

    json_res = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input="",
        obj=_make_obj(fakes, slots_root),
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
    fakes = _fake_for_repo(tmp_path)

    list_res = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )
    alias_res = CliRunner().invoke(
        cli_group,
        ["ls"],
        obj=_make_obj(fakes, tmp_path / "slots"),
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
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slots_root = tmp_path / "slots"

    CliRunner().invoke(cli_group, ["checkout", "feat/x"], obj=_make_obj(fakes, slots_root))

    result = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input="",
        obj=_make_obj(fakes, slots_root),
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


# -- real-gateway fallback --------------------------------------------------


def test_slot_list_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Simulate a CWD that git says is not a repo — we expect a not_in_repo
    # error, which confirms the real gateway is actually invoked when no
    # fake is injected.
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse"]:
            return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    result = CliRunner().invoke(cli_group, ["list"])

    assert result.exit_code == 1
    assert "Not inside a git repository" in result.output
