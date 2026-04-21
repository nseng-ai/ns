"""Scenario tests for `slot gc`."""

from __future__ import annotations

import dataclasses
import json
from collections.abc import Iterable
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRState, PRSummary
from twerk_core.git.types import FileStatus, WorktreeInfo
from twerk_slots.cli.main import build_cli
from twerk_slots.context import SlotsCliContext
from twerk_slots.context_testing import build_test_slots_context
from twerk_slots.gateway.testing import (
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import NoRepoSentinel, RepoContext, discover_repo_or_sentinel


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _build_ctx_for_repo(
    tmp_path: Path,
    *,
    extra_existing: Iterable[Path] = (),
    pr: FakePRGateway | None = None,
) -> SlotsCliContext:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir(exist_ok=True)
    pool_json_path = tmp_path / "slots" / "repos" / "repo" / "pool.json"
    slots_root = tmp_path / "slots"
    storage = FakeSlotsStorageGateway(
        existing_paths={repo_root, Path.cwd(), *extra_existing},
    )
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        existing_paths={repo_root, Path.cwd(), *extra_existing},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        on_add_worktree=storage.ensure_dir,
    )
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    return build_test_slots_context(
        repo=repo,
        slots_root=slots_root,
        git=git,
        storage=storage,
        pool_state=FakePoolStateGateway(pool_json_path),
        pr=pr,
    )


def _fakes(
    ctx: SlotsCliContext,
) -> tuple[FakeGitGateway, FakeSlotsStorageGateway, FakePoolStateGateway]:
    assert isinstance(ctx.git, FakeGitGateway)
    assert isinstance(ctx.storage, FakeSlotsStorageGateway)
    assert isinstance(ctx.pool_state, FakePoolStateGateway)
    return ctx.git, ctx.storage, ctx.pool_state


def _seed_assigned(
    ctx: SlotsCliContext,
    *,
    slot_name: str,
    branch: str,
    pool_size: int = 4,
    file_status: FileStatus | None = None,
) -> Path:
    git, storage, pool_state = _fakes(ctx)
    worktree_path = ctx.slots_root / "repos" / "repo" / "worktrees" / slot_name
    storage._existing_paths.add(worktree_path)
    git._existing_paths.add(worktree_path)
    git._branches.add(branch)
    git._worktrees.append(
        WorktreeInfo(path=worktree_path, branch=branch, is_bare=False),
    )
    git._current_branch_by_path[worktree_path] = branch
    if file_status is not None:
        git._file_status_by_path[worktree_path] = file_status
    existing = pool_state.load().assignments
    pool_state.save(
        PoolState(
            pool_size=pool_size,
            assignments=(
                *existing,
                SlotAssignment(
                    slot_name=slot_name,
                    branch_name=branch,
                    assigned_at="2026-04-01T00:00:00+00:00",
                    worktree_path=worktree_path,
                ),
            ),
        ),
    )
    return worktree_path


def _make_pr(number: int, state: PRState, branch: str) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"PR {number}",
        url=f"https://github.com/dagster-io/twerk/pull/{number}",
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
    ctx = _build_ctx_for_repo(tmp_path)
    # No `save` — pool_state.exists() is False.

    result = CliRunner().invoke(cli_group, ["gc"], obj=_obj(ctx))

    assert result.exit_code == 2
    assert "No pool configured" in result.output


# -- happy paths ------------------------------------------------------------


def test_slot_gc_force_frees_merged_assignment(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    worktree_path = _seed_assigned(ctx, slot_name="slot-01", branch="feat/done")
    ctx = dataclasses.replace(
        ctx,
        pr=FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")}),
    )

    result = CliRunner().invoke(cli_group, ["gc", "-f"], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    assert "freed" in result.output.lower()
    assert "slot-01" in result.output
    assert "feat/done" in result.output
    # No prompt was shown.
    assert "Free 1 slot" not in result.output
    # Pool state drained.
    git, _, pool_state = _fakes(ctx)
    assert pool_state.load().assignments == ()
    # Worktree detached at trunk.
    assert git._detach_head_calls == [(worktree_path, "main")]


def test_slot_gc_prompts_and_accepts(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    _seed_assigned(ctx, slot_name="slot-01", branch="feat/done")
    ctx = dataclasses.replace(
        ctx,
        pr=FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")}),
    )

    result = CliRunner().invoke(cli_group, ["gc"], obj=_obj(ctx), input="y\n")

    assert result.exit_code == 0, result.output
    # Preview shown before prompt.
    assert "would free" in result.output.lower()
    # Final state rendered after execution.
    assert "freed" in result.output.lower()
    assert "Free 1 slot" in result.output
    # Pool actually drained.
    _, _, pool_state = _fakes(ctx)
    assert pool_state.load().assignments == ()


def test_slot_gc_prompts_and_declines(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    _seed_assigned(ctx, slot_name="slot-01", branch="feat/done")
    ctx = dataclasses.replace(
        ctx,
        pr=FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")}),
    )

    result = CliRunner().invoke(cli_group, ["gc"], obj=_obj(ctx), input="n\n")

    assert result.exit_code == 0, result.output
    assert "would free" in result.output.lower()
    assert "Cancelled" in result.output
    # Pool unchanged.
    git, _, pool_state = _fakes(ctx)
    assert len(pool_state.load().assignments) == 1
    assert git._checkout_calls == []


def test_slot_gc_no_candidates_skips_prompt(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    _seed_assigned(ctx, slot_name="slot-01", branch="feat/wip")
    ctx = dataclasses.replace(
        ctx,
        pr=FakePRGateway(prs_by_branch={"feat/wip": _make_pr(9, "OPEN", "feat/wip")}),
    )

    result = CliRunner().invoke(cli_group, ["gc"], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    assert "Free 1 slot" not in result.output
    assert "Cancelled" not in result.output
    # Open-PR slot remains.
    _, _, pool_state = _fakes(ctx)
    assert len(pool_state.load().assignments) == 1


def test_slot_gc_dry_run_and_force_conflict(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    _seed_assigned(ctx, slot_name="slot-01", branch="feat/done")

    result = CliRunner().invoke(cli_group, ["gc", "--dry-run", "-f"], obj=_obj(ctx))

    assert result.exit_code != 0
    assert "mutually exclusive" in result.output.lower()


def test_slot_gc_dry_run_preserves_state(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    _seed_assigned(ctx, slot_name="slot-01", branch="feat/done")
    ctx = dataclasses.replace(
        ctx,
        pr=FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")}),
    )

    result = CliRunner().invoke(cli_group, ["gc", "--dry-run"], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    assert "would free" in result.output.lower()
    # Pool unchanged.
    git, _, pool_state = _fakes(ctx)
    assert len(pool_state.load().assignments) == 1
    assert git._checkout_calls == []


# -- JSON mode --------------------------------------------------------------


def test_slot_gc_json_mode_payload(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    _seed_assigned(ctx, slot_name="slot-01", branch="feat/done")
    _seed_assigned(ctx, slot_name="slot-02", branch="feat/wip")
    ctx = dataclasses.replace(
        ctx,
        pr=FakePRGateway(
            prs_by_branch={
                "feat/done": _make_pr(7, "MERGED", "feat/done"),
                "feat/wip": _make_pr(8, "OPEN", "feat/wip"),
            },
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["json", "gc"],
        input=json.dumps({"dry_run": False, "force": True}),
        obj=_obj(ctx),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
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


def test_slot_gc_json_mode_without_force_aborts(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    _seed_assigned(ctx, slot_name="slot-01", branch="feat/done")
    ctx = dataclasses.replace(
        ctx,
        pr=FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")}),
    )

    # No `force: true` → click.confirm hits EOF on stdin (already drained by
    # JSON request parsing) and aborts.
    result = CliRunner().invoke(
        cli_group,
        ["json", "gc"],
        input=json.dumps({"dry_run": False}),
        obj=_obj(ctx),
    )

    assert result.exit_code != 0
    # Pool unchanged.
    _, _, pool_state = _fakes(ctx)
    assert len(pool_state.load().assignments) == 1


def test_slot_gc_json_schema(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["json", "gc", "--schema"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}


# -- --format json + --schema on the primary command ------------------------


def test_slot_gc_format_json_dry_run_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    _seed_assigned(ctx, slot_name="slot-01", branch="feat/done")
    ctx = dataclasses.replace(
        ctx,
        pr=FakePRGateway(prs_by_branch={"feat/done": _make_pr(7, "MERGED", "feat/done")}),
    )

    result = CliRunner().invoke(cli_group, ["gc", "--dry-run", "--format", "json"], obj=_obj(ctx))
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["dry_run"] is True
    # Pool unchanged.
    _, _, pool_state = _fakes(ctx)
    assert len(pool_state.load().assignments) == 1


def test_slot_gc_format_json_failure_envelope(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _build_ctx_for_repo(tmp_path)
    # No `save` — pool_state.exists() is False.

    result = CliRunner().invoke(cli_group, ["gc", "--format", "json"], obj=_obj(ctx))
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "pool_empty"


def test_slot_gc_format_json_matches_json_subtree(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    (tmp_path / "a").mkdir()
    (tmp_path / "b").mkdir()
    ctx_a = _build_ctx_for_repo(tmp_path / "a")
    ctx_b = _build_ctx_for_repo(tmp_path / "b")

    flag_result = CliRunner().invoke(cli_group, ["gc", "--format", "json"], obj=_obj(ctx_a))
    subtree_result = CliRunner().invoke(
        cli_group,
        ["json", "gc"],
        input=json.dumps({"dry_run": False, "force": False}),
        obj=_obj(ctx_b),
    )

    assert flag_result.exit_code == 2
    assert subtree_result.exit_code == 2
    assert json.loads(flag_result.stdout) == json.loads(subtree_result.stdout)


def test_slot_gc_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gc", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}
