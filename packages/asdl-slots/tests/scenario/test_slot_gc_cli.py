"""Scenario tests for `slot gc`."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRState, PRSummary
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import FileStatus, GitCommandFailure, WorktreeInfo, WorktreeOccupancy
from asdl_slots.cli.main import build_cli
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import NoRepoSentinel, RepoContext, discover_repo_or_sentinel


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@dataclass
class _SlotFakes:
    git: FakeGitGateway
    storage: FakeSlotsStorageGateway
    clipboard: FakeClipboardGateway
    repo_root: Path


def _make_obj(
    fakes: _SlotFakes,
    slots_root: Path,
    *,
    pr: FakePRGateway | None = None,
) -> ClinkrContextObject:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=fakes.git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    ctx = SlotsCliContext(
        repo=repo,
        git=fakes.git,
        storage=fakes.storage,
        clipboard=fakes.clipboard,
        pr=pr or FakePRGateway(),
        slots_root=slots_root,
    )
    return build_clinkr_context_object(lambda: ctx)


def _obj(context: object) -> ClinkrContextObject:
    return build_clinkr_context_object(lambda: context)


def _fake_for_repo(
    tmp_path: Path,
    *,
    operations_by_path: dict[Path, WorktreeOccupancy] | None = None,
) -> _SlotFakes:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    storage = FakeSlotsStorageGateway(
        existing_paths={repo_root, Path.cwd()},
    )
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        operations_by_path=operations_by_path,
        existing_paths={repo_root, Path.cwd()},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        on_add_worktree=storage.ensure_dir,
    )
    return _SlotFakes(
        git=git,
        storage=storage,
        clipboard=FakeClipboardGateway(),
        repo_root=repo_root,
    )


def _slot_path(slots_root: Path, slot_name: str) -> Path:
    return slots_root / "repos" / "repo" / "worktrees" / slot_name


def _seed_pool(
    fakes: _SlotFakes,
    slots_root: Path,
    *,
    assignments: tuple[tuple[str, str], ...],
    pool_size: int = 4,
    file_status_by_slot: dict[str, FileStatus] | None = None,
) -> dict[str, Path]:
    """Seed a managed slot pool of size ``pool_size`` into the FakeGitGateway."""
    file_status_by_slot = file_status_by_slot or {}
    assigned_branch_by_slot = {slot_name: branch for slot_name, branch in assignments}
    paths: dict[str, Path] = {}

    for slot_num in range(1, pool_size + 1):
        slot_name = f"slot-{slot_num:02d}"
        worktree_path = _slot_path(slots_root, slot_name)
        fakes.storage._existing_paths.add(worktree_path)
        fakes.git._existing_paths.add(worktree_path)
        if slot_name in assigned_branch_by_slot:
            branch = assigned_branch_by_slot[slot_name]
            fakes.git._branches.add(branch)
            fakes.git._worktrees.append(
                WorktreeInfo(path=worktree_path, branch=branch, is_bare=False),
            )
            fakes.git._current_branch_by_path[worktree_path] = branch
            if slot_name in file_status_by_slot:
                fakes.git._file_status_by_path[worktree_path] = file_status_by_slot[slot_name]
            paths[slot_name] = worktree_path
        else:
            fakes.git._worktrees.append(
                WorktreeInfo(path=worktree_path, branch=None, is_bare=False),
            )
    return paths


def _seed_assigned(
    fakes: _SlotFakes,
    slots_root: Path,
    *,
    slot_name: str = "slot-01",
    branch: str = "feat/x",
    pool_size: int = 4,
    file_status: FileStatus | None = None,
) -> Path:
    return _seed_pool(
        fakes,
        slots_root,
        assignments=((slot_name, branch),),
        pool_size=pool_size,
        file_status_by_slot={slot_name: file_status} if file_status is not None else None,
    )[slot_name]


def _assigned_worktrees(fakes: _SlotFakes) -> dict[str, str]:
    return {
        wt.path.name: wt.branch
        for wt in fakes.git.list_worktrees()
        if wt.path.name.startswith("slot-") and wt.branch is not None
    }


def _make_pr(number: int, state: PRState, branch: str) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"PR {number}",
        url=f"https://github.com/dagster-io/asdl/pull/{number}",
        head_ref_name=branch,
        base_ref_name="master",
        state=state,
    )


# -- help / shape -----------------------------------------------------------


def test_slot_gc_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gc", "-h"])

    assert result.exit_code == 0
    assert "Usage: slot gc" in result.output
    assert "merged or closed PR" in result.output
    assert "--format" in result.output
    assert "--json-schema" in result.output
    assert "--delete-branches" in result.output
    assert "local branches" in result.output


def test_slot_gc_appears_in_group_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "gc" in result.output


# -- error paths ------------------------------------------------------------


def test_slot_gc_not_in_repo_errors(cli_group: ClinkrGroup) -> None:
    sentinel = NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    result = CliRunner().invoke(cli_group, ["gc"], obj=_obj(sentinel))

    assert result.exit_code == 2
    assert "Not inside a git repository" in result.output


def test_slot_gc_pool_empty_errors(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path)
    # No managed slot worktrees → inventory.pool_size == 0.

    result = CliRunner().invoke(cli_group, ["gc"], obj=_make_obj(fakes, tmp_path / "slots"))

    assert result.exit_code == 2
    assert "No managed slots configured" in result.output
    assert "slot init --size N" in result.output


# -- happy paths ------------------------------------------------------------


def test_slot_gc_force_frees_merged_assignment(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "-f"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    assert "freed" in result.output.lower()
    assert "slot-01" in result.output
    assert "feat/done" in result.output
    # No prompt was shown.
    assert "Free 1 slot" not in result.output
    # Worktree detached at trunk; assigned-slot inventory drained.
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]
    assert fakes.git.delete_local_branch_calls == ()
    assert fakes.git.branch_exists("feat/done")
    assert _assigned_worktrees(fakes) == {}


@pytest.mark.parametrize(
    ("branch", "state", "pr_number"),
    [("feat/done", "MERGED", 7), ("feat/closed", "CLOSED", 8)],
)
def test_slot_gc_force_deletes_local_branch_for_completed_assignment(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    branch: str,
    state: PRState,
    pr_number: int,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, branch=branch)
    pr = FakePRGateway(prs_by_branch={branch: _make_pr(pr_number, state, branch)})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "-f", "--delete-branches"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    assert f"force-deleted local branch {branch}" in result.output.lower()
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]
    assert fakes.git.delete_local_branch_calls == ((branch, True),)
    assert fakes.git.delete_remote_branch_calls == ()
    assert not fakes.git.branch_exists(branch)
    assert _assigned_worktrees(fakes) == {}


def test_slot_gc_prompts_and_accepts(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(fakes, slots_root, pr=pr),
        input="y\n",
    )

    assert result.exit_code == 0, result.output
    assert "would free" in result.output.lower()
    assert "freed" in result.output.lower()
    assert "Free 1 slot" in result.output
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]


def test_slot_gc_prompt_default_accepts(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(fakes, slots_root, pr=pr),
        input="\n",
    )

    assert result.exit_code == 0, result.output
    assert "[Y/n]" in result.output
    assert "freed" in result.output.lower()
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]


def test_slot_gc_prompts_and_declines(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(fakes, slots_root, pr=pr),
        input="n\n",
    )

    assert result.exit_code == 0, result.output
    assert "would free" in result.output.lower()
    assert "Cancelled" in result.output
    # No mutation: assigned slot still present, no detach called.
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/done"}
    assert fakes.git._detach_head_calls == []


def test_slot_gc_delete_branches_prompts_and_accepts(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--delete-branches"],
        obj=_make_obj(fakes, slots_root, pr=pr),
        input="y\n",
    )

    assert result.exit_code == 0, result.output
    assert "local branch: force-delete feat/done" in result.output
    assert "delete local branches" in result.output
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]
    assert fakes.git.delete_local_branch_calls == (("feat/done", True),)


def test_slot_gc_delete_branches_prompts_and_declines(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--delete-branches"],
        obj=_make_obj(fakes, slots_root, pr=pr),
        input="n\n",
    )

    assert result.exit_code == 0, result.output
    assert "local branch: force-delete feat/done" in result.output
    assert "delete local branches" in result.output
    assert "Cancelled" in result.output
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/done"}
    assert fakes.git._detach_head_calls == []
    assert fakes.git.delete_local_branch_calls == ()


def test_slot_gc_no_candidates_skips_prompt(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/wip")
    pr = FakePRGateway(prs_by_branch={"feat/wip": _make_pr(9, "OPEN", "feat/wip")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--delete-branches"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    assert "Free 1 slot" not in result.output
    assert "Cancelled" not in result.output
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/wip"}
    assert fakes.git.delete_local_branch_calls == ()


def test_slot_gc_delete_branches_keeps_no_pr_branch(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/no-pr")

    result = CliRunner().invoke(
        cli_group,
        ["gc", "-f", "--delete-branches", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=FakePRGateway()),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    entry = payload["data"]["entries"][0]
    assert entry["action"] == "kept_no_pr"
    assert entry["cleanup"] == []
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/no-pr"}
    assert fakes.git.delete_local_branch_calls == ()


def test_slot_gc_dry_run_and_force_conflict(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/done")

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run", "-f"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 2
    assert "mutually exclusive" in result.output.lower()


def test_slot_gc_delete_branches_skips_dirty_worktree(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(
        fakes,
        slots_root,
        branch="feat/dirty",
        file_status=FileStatus(staged=False, modified=True, untracked=False),
    )
    pr = FakePRGateway(prs_by_branch={"feat/dirty": _make_pr(12, "MERGED", "feat/dirty")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "-f", "--delete-branches", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    entry = payload["data"]["entries"][0]
    assert entry["action"] == "skipped_dirty"
    assert entry["cleanup"] == []
    assert fakes.git._detach_head_calls == []
    assert fakes.git.delete_local_branch_calls == ()
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/dirty"}


def test_slot_gc_skips_operation_slot(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    slot_path = _slot_path(slots_root, "slot-01")
    fakes = _fake_for_repo(
        tmp_path,
        operations_by_path={
            slot_path: WorktreeOccupancy(
                path=slot_path,
                branch="feat/rebase",
                operation="rebase",
            ),
        },
    )
    _seed_pool(fakes, slots_root, assignments=(), pool_size=1)
    pr = FakePRGateway(prs_by_branch={"feat/rebase": _make_pr(7, "MERGED", "feat/rebase")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "-f", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    data = payload["data"]
    assert data["freed_count"] == 0
    assert data["skipped_count"] == 1
    entry = data["entries"][0]
    assert entry["slot_name"] == "slot-01"
    assert entry["branch_name"] == "feat/rebase"
    assert entry["action"] == "skipped_operation"
    assert "rebase" in entry["message"]
    assert fakes.git._detach_head_calls == []


def test_slot_gc_skips_operation_slot_in_human_output(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    slot_path = _slot_path(slots_root, "slot-01")
    fakes = _fake_for_repo(
        tmp_path,
        operations_by_path={
            slot_path: WorktreeOccupancy(
                path=slot_path,
                branch="feat/rebase",
                operation="rebase",
            ),
        },
    )
    _seed_pool(fakes, slots_root, assignments=(), pool_size=1)

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run"],
        obj=_make_obj(fakes, slots_root),
    )

    assert result.exit_code == 0, result.output
    assert "skipped" in result.output.lower()
    assert "operation" in result.output.lower()
    assert "slot-01" in result.output
    assert "feat/rebase" in result.output
    assert "rebase" in result.output
    assert fakes.git._detach_head_calls == []


def test_slot_gc_dry_run_preserves_state(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    assert "would free" in result.output.lower()
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/done"}
    assert fakes.git._detach_head_calls == []
    assert fakes.git.delete_local_branch_calls == ()


def test_slot_gc_dry_run_delete_branches_plans_without_mutating(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run", "--delete-branches"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    assert "would free" in result.output.lower()
    assert "local branch: force-delete feat/done" in result.output
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/done"}
    assert fakes.git._detach_head_calls == []
    assert fakes.git.delete_local_branch_calls == ()
    assert fakes.git.branch_exists("feat/done")


def test_slot_gc_dry_run_delete_branches_json_includes_cleanup(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run", "--delete-branches", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    cleanup = payload["data"]["entries"][0]["cleanup"]
    assert cleanup == [
        {
            "slot_name": "slot-01",
            "branch_name": "feat/done",
            "action": "local_branch",
            "status": "planned",
            "pr_number": None,
            "message": None,
        }
    ]
    assert fakes.git._detach_head_calls == []
    assert fakes.git.delete_local_branch_calls == ()


# -- machine mode -----------------------------------------------------------


def test_slot_gc_format_json_payload(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_pool(
        fakes,
        slots_root,
        assignments=(("slot-01", "feat/done"), ("slot-02", "feat/wip")),
    )
    pr = FakePRGateway(
        prs_by_branch={
            "feat/done": _make_pr(7, "MERGED", "feat/done"),
            "feat/wip": _make_pr(8, "OPEN", "feat/wip"),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["gc", "-f", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert result.stderr == ""
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["freed_count"] == 1
    assert data["kept_count"] == 1
    assert data["skipped_count"] == 0
    assert data["error_count"] == 0
    assert data["dry_run"] is False
    assert data["cancelled"] is False
    actions_by_slot = {e["slot_name"]: e["action"] for e in data["entries"]}
    assert actions_by_slot == {"slot-01": "freed", "slot-02": "kept_open_pr"}


def test_slot_gc_delete_branch_failure_is_negative_after_free(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, branch="feat/done")
    fakes.git._delete_local_branch_failure_by_branch["feat/done"] = GitCommandFailure(
        message="cannot delete branch 'feat/done' checked out at '/repo-other'",
        returncode=1,
    )
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "-f", "--delete-branches", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 1, result.output
    payload = json.loads(result.stdout)
    assert payload["exit_code"] == 1
    data = payload["data"]
    assert data["freed_count"] == 1
    assert data["cleanup_error_count"] == 1
    entry = data["entries"][0]
    assert entry["action"] == "freed"
    cleanup = entry["cleanup"][0]
    assert cleanup["action"] == "local_branch"
    assert cleanup["status"] == "error"
    assert "checked out" in cleanup["message"]
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]
    assert fakes.git.delete_local_branch_calls == (("feat/done", True),)
    assert fakes.git.branch_exists("feat/done")


def test_slot_gc_delete_branch_failure_stops_later_cleanup(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    paths = _seed_pool(
        fakes,
        slots_root,
        assignments=(("slot-01", "feat/one"), ("slot-02", "feat/two")),
    )
    fakes.git._delete_local_branch_failure_by_branch["feat/one"] = GitCommandFailure(
        message="cannot delete branch 'feat/one' checked out at '/repo-other'",
        returncode=1,
    )
    pr = FakePRGateway(
        prs_by_branch={
            "feat/one": _make_pr(7, "MERGED", "feat/one"),
            "feat/two": _make_pr(8, "MERGED", "feat/two"),
        }
    )

    result = CliRunner().invoke(
        cli_group,
        ["gc", "-f", "--delete-branches", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )

    assert result.exit_code == 1, result.output
    payload = json.loads(result.stdout)
    data = payload["data"]
    assert data["freed_count"] == 2
    assert data["cleanup_error_count"] == 1
    entries_by_slot = {entry["slot_name"]: entry for entry in data["entries"]}
    assert entries_by_slot["slot-01"]["action"] == "freed"
    assert entries_by_slot["slot-01"]["cleanup"][0]["status"] == "error"
    assert entries_by_slot["slot-02"]["action"] == "freed"
    assert entries_by_slot["slot-02"]["cleanup"] == []
    assert fakes.git._detach_head_calls == [(paths["slot-01"], "main"), (paths["slot-02"], "main")]
    assert fakes.git.delete_local_branch_calls == (("feat/one", True),)
    assert fakes.git.branch_exists("feat/two")


def test_slot_gc_format_json_interactive_cancel_has_json_stdout(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
        input="no\n",
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert "would free" in result.stderr.lower()
    assert "Free 1 slot(s)? [Y/n]" in result.stderr
    data = payload["data"]
    assert data["cancelled"] is True
    assert data["freed_count"] == 0
    assert fakes.git._detach_head_calls == []
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/done"}


def test_slot_gc_format_json_interactive_yes_has_json_stdout(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
        input="yes\n",
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert "would free" in result.stderr.lower()
    assert "Free 1 slot(s)? [Y/n]" in result.stderr
    data = payload["data"]
    assert data["cancelled"] is False
    assert data["freed_count"] == 1
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]


def test_slot_gc_format_json_interactive_blank_defaults_to_yes(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    worktree_path = _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
        input="\n",
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert "would free" in result.stderr.lower()
    assert "Free 1 slot(s)? [Y/n]" in result.stderr
    data = payload["data"]
    assert data["cancelled"] is False
    assert data["freed_count"] == 1
    assert fakes.git._detach_head_calls == [(worktree_path, "main")]


def test_slot_gc_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gc", "--json-schema"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert set(payload) == {"input_json_schema", "output_json_schema"}


# -- --format json + --json-schema on the primary command ------------------------


def test_slot_gc_format_json_dry_run_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    fakes = _fake_for_repo(tmp_path)
    _seed_assigned(fakes, slots_root, branch="feat/done")
    pr = FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")})

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run", "--format", "json"],
        obj=_make_obj(fakes, slots_root, pr=pr),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["dry_run"] is True
    assert _assigned_worktrees(fakes) == {"slot-01": "feat/done"}


def test_slot_gc_format_json_failure_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    fakes = _fake_for_repo(tmp_path)
    # No managed slots → inventory.pool_size == 0.

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--format", "json"],
        obj=_make_obj(fakes, tmp_path / "slots"),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "pool_empty"


def test_slot_gc_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gc", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert set(payload) == {"input_json_schema", "output_json_schema"}
