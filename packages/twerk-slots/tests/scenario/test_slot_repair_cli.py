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
from twerk_slots.gateway.git import WorktreeInfo
from twerk_slots.gateway.testing import (
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.pool_state import PoolState, SlotAssignment


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _SlotFakes:
    git: FakeGitGateway
    storage: FakeSlotsStorageGateway
    pool_state: FakePoolStateGateway
    repo_root: Path
    worktrees_dir: Path


def _make_obj(fakes: _SlotFakes, slots_root: Path) -> dict[str, object]:
    return {
        "git_gateway": fakes.git,
        "storage_gateway": fakes.storage,
        "pool_state_gateway": fakes.pool_state,
        "slots_root": slots_root,
    }


def _fake_for_repo(
    tmp_path: Path,
    *,
    branches: tuple[str, ...] = (),
    worktrees: tuple[WorktreeInfo, ...] = (),
    current_branch_by_path: dict[Path, str | None] | None = None,
    extra_existing: Iterable[Path] = (),
) -> _SlotFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    slots_root = tmp_path / "slots"
    worktrees_dir = slots_root / "repos" / "repo" / "worktrees"
    pool_json_path = slots_root / "repos" / "repo" / "pool.json"
    base_paths = {repo_root, Path.cwd(), worktrees_dir, *extra_existing}
    storage = FakeSlotsStorageGateway(existing_paths=base_paths)
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches=branches,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        existing_paths=base_paths,
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        storage=storage,
    )
    return _SlotFakes(
        git=git,
        storage=storage,
        pool_state=FakePoolStateGateway(pool_json_path),
        repo_root=repo_root,
        worktrees_dir=worktrees_dir,
    )


def _seed_pool(
    fakes: _SlotFakes,
    *,
    pool_size: int,
    assignments: tuple[SlotAssignment, ...],
) -> None:
    fakes.pool_state.save(PoolState(pool_size=pool_size, assignments=assignments))


def _assignment(
    slot_name: str,
    branch_name: str,
    worktrees_dir: Path,
) -> SlotAssignment:
    return SlotAssignment(
        slot_name=slot_name,
        branch_name=branch_name,
        assigned_at="2026-04-01T00:00:00+00:00",
        worktree_path=worktrees_dir / slot_name,
    )


# -- help / shape -----------------------------------------------------------


def test_slot_repair_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["repair", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot repair" in result.output
    assert "--force" in result.output
    assert "--dry-run" in result.output


def test_slot_repair_appears_in_group_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "repair" in result.output


# -- baseline: no pool / clean state ---------------------------------------


def test_slot_repair_errors_when_no_pool_configured(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path)

    result = CliRunner().invoke(
        cli_group,
        ["repair"],
        obj=_make_obj(fakes, tmp_path / "slots"),
    )

    assert result.exit_code == 1
    assert "No pool configured" in result.output


def test_slot_repair_clean_state_reports_no_issues(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path)
    slot_path = fakes.worktrees_dir / "slot-01"
    fakes.storage._existing_paths.add(slot_path)
    fakes.git._existing_paths.add(slot_path)
    fakes.git._branches.add("feat/x")
    fakes.git._worktrees.append(WorktreeInfo(path=slot_path, branch="feat/x", is_bare=False))
    _seed_pool(
        fakes,
        pool_size=4,
        assignments=(_assignment("slot-01", "feat/x", fakes.worktrees_dir),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["repair"],
        obj=_make_obj(fakes, tmp_path / "slots"),
    )

    assert result.exit_code == 0, result.output
    assert "No issues found" in result.output
    # Pool state unchanged.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert len(saved.assignments) == 1


# -- per-code detection ----------------------------------------------------


def test_slot_repair_detects_orphan_state(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    # worktree path absent from storage -> orphan-state.
    slot_path = fakes.worktrees_dir / "slot-01"
    # Still register a git worktree so git-registry-missing isn't also raised,
    # keeping the test focused on orphan-state detection.
    fakes.git._worktrees.append(WorktreeInfo(path=slot_path, branch="feat/x", is_bare=False))
    _seed_pool(
        fakes,
        pool_size=4,
        assignments=(_assignment("slot-01", "feat/x", fakes.worktrees_dir),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["repair"],
        obj=_make_obj(fakes, tmp_path / "slots"),
    )

    assert result.exit_code == 0, result.output
    assert "orphan-state" in result.output
    assert "slot-01" in result.output


def test_slot_repair_detects_orphan_dir_informational(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(tmp_path)
    # pool_size=2 but slot-05 dir exists on disk.
    stray = fakes.worktrees_dir / "slot-05"
    fakes.storage._existing_paths.add(stray)
    _seed_pool(fakes, pool_size=2, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["repair"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "orphan-dir" in result.output
    assert "slot-05" in result.output
    assert "require manual intervention" in result.output


def test_slot_repair_detects_missing_branch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path)
    slot_path = fakes.worktrees_dir / "slot-01"
    fakes.storage._existing_paths.add(slot_path)
    fakes.git._existing_paths.add(slot_path)
    # branch 'feat/gone' is NOT seeded.
    fakes.git._worktrees.append(WorktreeInfo(path=slot_path, branch="feat/gone", is_bare=False))
    _seed_pool(
        fakes,
        pool_size=4,
        assignments=(_assignment("slot-01", "feat/gone", fakes.worktrees_dir),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["repair"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "missing-branch" in result.output


def test_slot_repair_detects_branch_mismatch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/expected", "feat/actual"))
    slot_path = fakes.worktrees_dir / "slot-01"
    fakes.storage._existing_paths.add(slot_path)
    fakes.git._existing_paths.add(slot_path)
    fakes.git._worktrees.append(WorktreeInfo(path=slot_path, branch="feat/actual", is_bare=False))
    _seed_pool(
        fakes,
        pool_size=4,
        assignments=(_assignment("slot-01", "feat/expected", fakes.worktrees_dir),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["repair"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "branch-mismatch" in result.output
    assert "feat/expected" in result.output
    assert "feat/actual" in result.output


def test_slot_repair_detects_git_registry_missing(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    slot_path = fakes.worktrees_dir / "slot-01"
    fakes.storage._existing_paths.add(slot_path)
    # No git worktree seeded -> git-registry-missing.
    _seed_pool(
        fakes,
        pool_size=4,
        assignments=(_assignment("slot-01", "feat/x", fakes.worktrees_dir),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["repair"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "git-registry-missing" in result.output


def test_slot_repair_detects_untracked_worktree_informational(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/rogue",))
    # pool_size=2 but git registry has slot-05.
    stray_path = fakes.worktrees_dir / "slot-05"
    fakes.git._worktrees.append(WorktreeInfo(path=stray_path, branch="feat/rogue", is_bare=False))
    _seed_pool(fakes, pool_size=2, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["repair"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "untracked-worktree" in result.output
    assert "slot-05" in result.output
    assert "require manual intervention" in result.output


# -- --force / --dry-run / conflict ----------------------------------------


def test_slot_repair_force_mutates_pool_state(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/keep",))
    slot_01 = fakes.worktrees_dir / "slot-01"
    slot_02 = fakes.worktrees_dir / "slot-02"
    fakes.storage._existing_paths.add(slot_02)
    fakes.git._existing_paths.add(slot_02)
    fakes.git._worktrees.append(WorktreeInfo(path=slot_02, branch="feat/keep", is_bare=False))
    # slot-01 is orphan-state AND git-registry-missing (repairable);
    # slot-02 is clean.
    _seed_pool(
        fakes,
        pool_size=4,
        assignments=(
            _assignment("slot-01", "feat/gone", fakes.worktrees_dir),
            _assignment("slot-02", "feat/keep", fakes.worktrees_dir),
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["repair", "--force"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "Removed" in result.output
    assert "slot-01" in result.output
    # Pool state now only has slot-02.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert tuple(a.slot_name for a in saved.assignments) == ("slot-02",)
    # slot-01 worktree path never existed, unaffected.
    assert not fakes.storage.path_exists(slot_01)


def test_slot_repair_dry_run_does_not_mutate(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    _seed_pool(
        fakes,
        pool_size=4,
        assignments=(_assignment("slot-01", "feat/x", fakes.worktrees_dir),),
    )

    before = fakes.pool_state.load()

    result = CliRunner().invoke(
        cli_group,
        ["repair", "--dry-run"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "DRY RUN" in result.output
    assert "Would remove" in result.output
    # Pool state unchanged.
    assert fakes.pool_state.load() == before


def test_slot_repair_rejects_force_and_dry_run_together(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(fakes, pool_size=4, assignments=())

    result = CliRunner().invoke(
        cli_group,
        ["repair", "--force", "--dry-run"],
        obj=_make_obj(fakes, tmp_path / "slots"),
    )

    assert result.exit_code == 1
    assert "not both" in result.output


# -- mixed issues -----------------------------------------------------------


def test_slot_repair_mixed_repairable_and_informational_preview(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/rogue",))
    # slot-01 orphan-state (repairable).
    # slot-05 in git registry, outside pool_size=2 (untracked-worktree, informational).
    stray = fakes.worktrees_dir / "slot-05"
    fakes.git._worktrees.append(WorktreeInfo(path=stray, branch="feat/rogue", is_bare=False))
    _seed_pool(
        fakes,
        pool_size=2,
        assignments=(_assignment("slot-01", "feat/gone", fakes.worktrees_dir),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["repair"],
        obj=_make_obj(fakes, tmp_path / "slots"),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0, result.output
    assert "orphan-state" in result.output
    assert "untracked-worktree" in result.output
    assert "Would remove" in result.output
    # No mutation without --force.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert len(saved.assignments) == 1


# -- JSON mode --------------------------------------------------------------


def test_slot_repair_json_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["json", "repair", "--schema"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}


def test_slot_repair_json_force_returns_structured_payload(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    _seed_pool(
        fakes,
        pool_size=4,
        assignments=(_assignment("slot-01", "feat/gone", fakes.worktrees_dir),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["json", "repair"],
        input=json.dumps({"force": True}),
        obj=_make_obj(fakes, tmp_path / "slots"),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["success"] is True
    assert payload["dry_run"] is False
    # Issues include orphan-state and git-registry-missing for slot-01.
    codes = {i["code"] for i in payload["issues"]}
    assert "orphan-state" in codes
    # Applied reports the repaired slot.
    applied_slots = {row["slot_name"] for row in payload["applied"]}
    assert applied_slots == {"slot-01"}
    # Pool state mutated.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert saved.assignments == ()


def test_slot_repair_json_preview_returns_empty_applied(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    fakes = _fake_for_repo(tmp_path, branches=("feat/x",))
    _seed_pool(
        fakes,
        pool_size=4,
        assignments=(_assignment("slot-01", "feat/x", fakes.worktrees_dir),),
    )

    result = CliRunner().invoke(
        cli_group,
        ["json", "repair"],
        input=json.dumps({}),
        obj=_make_obj(fakes, tmp_path / "slots"),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["success"] is True
    assert payload["applied"] == []
    # Even though repairable issues were found, no mutation happened.
    saved = fakes.pool_state.load()
    assert saved is not None
    assert len(saved.assignments) == 1


# -- real-gateway fallback --------------------------------------------------


def test_slot_repair_not_in_repo_errors(
    cli_group: ClinkrGroup, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse"]:
            return subprocess.CompletedProcess(cmd, 128, stdout="", stderr="fatal")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git.subprocess, "run", fake_run)

    result = CliRunner().invoke(cli_group, ["repair"])

    assert result.exit_code == 1
    assert "Not inside a git repository" in result.output
