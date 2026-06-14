from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, FileStatus, WorktreeInfo
from asdl_slots.cli.main import build_cli
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import RepoContext, discover_repo_or_sentinel


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _SlotFakes:
    git: FakeGitGateway
    storage: FakeSlotsStorageGateway
    repo_root: Path
    slots_root: Path


def _slot_path(slots_root: Path, slot_name: str) -> Path:
    return slots_root / "repos" / "repo" / "worktrees" / slot_name


def _assigned_slot(slots_root: Path, slot_name: str, branch: str) -> WorktreeInfo:
    return WorktreeInfo(path=_slot_path(slots_root, slot_name), branch=branch, is_bare=False)


def _fake_for_repo(
    tmp_path: Path,
    *,
    branches: tuple[str, ...],
    current_root: Path,
    worktrees: tuple[WorktreeInfo, ...],
    file_status_by_path: dict[Path, FileStatus] | None = None,
    extra_existing: Iterable[Path] = (),
) -> _SlotFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    slots_root = tmp_path / "slots"
    seeded_paths = {wt.path for wt in worktrees}
    storage = FakeSlotsStorageGateway(
        existing_paths={repo_root, Path.cwd(), *seeded_paths, *extra_existing},
    )
    current_branch_by_path = {
        wt.path: wt.branch if wt.branch is not None else DetachedHead() for wt in worktrees
    }
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches=branches,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        file_status_by_path=file_status_by_path,
        existing_paths={repo_root, Path.cwd(), *seeded_paths, *extra_existing},
        repository_root_by_cwd={Path.cwd().resolve(): current_root},
        trunk_branch="master",
    )
    return _SlotFakes(git=git, storage=storage, repo_root=repo_root, slots_root=slots_root)


def _make_obj(fakes: _SlotFakes) -> ClinkrContextObject:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=fakes.slots_root, git=fakes.git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    ctx = SlotsCliContext(
        repo=repo,
        git=fakes.git,
        storage=fakes.storage,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=fakes.slots_root,
    )
    return build_clinkr_context_object(lambda: ctx)


def test_slot_claim_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["claim", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot claim" in result.output
    assert "BRANCH_NAME" in result.output
    assert "Move a local branch from another managed slot" in result.output
    assert "--format" in result.output
    assert "--json-schema" in result.output


def test_slot_claim_moves_branch_from_other_slot(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    current_path = _slot_path(slots_root, "slot-01")
    source_path = _slot_path(slots_root, "slot-10")
    fakes = _fake_for_repo(
        tmp_path,
        branches=("master", "feat/current"),
        current_root=current_path,
        worktrees=(
            _assigned_slot(slots_root, "slot-01", "feat/current"),
            _assigned_slot(slots_root, "slot-10", "master"),
        ),
    )

    result = CliRunner().invoke(cli_group, ["claim", "master"], obj=_make_obj(fakes))

    assert result.exit_code == 0, result.output
    assert "Claimed" in result.output
    assert "slot-01" in result.output
    assert "slot-10" in result.output
    assert "master" in result.output
    assert fakes.git.get_current_branch(source_path) == DetachedHead()
    assert fakes.git.get_current_branch(current_path) == "master"
    assert fakes.git._detach_head_calls == [(source_path, "master")]
    assert fakes.git._checkout_calls == [(current_path, "master")]


def test_slot_claim_from_main_worktree_moves_current_branch_to_available_slot(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    repo_root = tmp_path / "repo"
    repo_root.mkdir(exist_ok=True)
    repo_root = repo_root.resolve()
    target_path = _slot_path(slots_root, "slot-01")
    fakes = _fake_for_repo(
        tmp_path,
        branches=("master",),
        current_root=repo_root,
        worktrees=(
            WorktreeInfo(path=repo_root, branch="master", is_bare=False),
            WorktreeInfo(path=target_path, branch=None, is_bare=False),
        ),
    )

    result = CliRunner().invoke(cli_group, ["claim", "master"], obj=_make_obj(fakes))

    assert result.exit_code == 0, result.output
    assert "Claimed" in result.output
    assert "slot-01" in result.output
    assert "master" in result.output
    assert fakes.git.get_current_branch(repo_root) == DetachedHead()
    assert fakes.git.get_current_branch(target_path) == "master"
    assert fakes.git._detach_head_calls == [(repo_root, "master")]
    assert fakes.git._checkout_calls == [(target_path, "master")]


def test_slot_claim_format_json(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    current_path = _slot_path(slots_root, "slot-01")
    fakes = _fake_for_repo(
        tmp_path,
        branches=("master", "feat/current"),
        current_root=current_path,
        worktrees=(
            _assigned_slot(slots_root, "slot-01", "feat/current"),
            _assigned_slot(slots_root, "slot-10", "master"),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["claim", "master", "--format", "json"],
        obj=_make_obj(fakes),
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["slot_name"] == "slot-01"
    assert data["branch_name"] == "master"
    assert data["replaced_branch_name"] == "feat/current"
    assert data["source_slot_name"] == "slot-10"
    assert data["already_current"] is False


def test_slot_claim_requires_current_slot(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(
        tmp_path,
        branches=("master",),
        current_root=(tmp_path / "repo").resolve(),
        worktrees=(_assigned_slot(slots_root, "slot-10", "master"),),
    )

    result = CliRunner().invoke(cli_group, ["claim", "master"], obj=_make_obj(fakes))

    assert result.exit_code == 2
    assert "must be run from a managed slot" in result.output
    assert fakes.git._detach_head_calls == []
    assert fakes.git._checkout_calls == []
