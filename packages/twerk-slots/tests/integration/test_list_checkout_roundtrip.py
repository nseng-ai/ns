"""End-to-end round trip: `slot checkout <br>` then `slot list` against a
FakeGitGateway with a tmp_path slots_root. Exercises the real CLI wiring
(discover_repo_or_sentinel, allocation, persistence, rendering) against the
real ``RealSlotsStorageGateway`` and real ``RealPoolStateGateway``.

FakeGit is wired to the same real storage gateway so ``add_worktree`` also
creates the worktree directory on disk — mirroring what ``git worktree add``
does for real."""

from __future__ import annotations

import json
from pathlib import Path

from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_slots.cli.main import build_cli
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.pool_state_gateway import RealPoolStateGateway
from twerk_slots.gateway.real_storage import RealSlotsStorageGateway
from twerk_slots.gateway.testing import FakeClipboardGateway, FakeGitGateway
from twerk_slots.repo_context import RepoContext, discover_repo_or_sentinel


def _build_ctx(
    *,
    git: FakeGitGateway,
    storage: RealSlotsStorageGateway,
    pool_state_gw: RealPoolStateGateway,
    slots_root: Path,
) -> SlotsCliContext:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=git)
    assert isinstance(repo, RepoContext)
    return SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=slots_root,
    )


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def test_checkout_then_list_reflects_state(tmp_path: Path) -> None:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir()
    slots_root = tmp_path / "slots"
    pool_json = slots_root / "repos" / "repo" / "pool.json"
    storage = RealSlotsStorageGateway()
    pool_state_gw = RealPoolStateGateway(pool_json_path=pool_json)

    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches={"feat/one", "feat/two"},
        existing_paths={repo_root, Path.cwd()},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        on_add_worktree=storage.ensure_dir,
    )
    ctx = _build_ctx(
        git=git,
        storage=storage,
        pool_state_gw=pool_state_gw,
        slots_root=slots_root,
    )
    cli = build_cli()
    runner = CliRunner()

    checkout = runner.invoke(cli, ["checkout", "feat/one"], obj=_obj(ctx))
    assert checkout.exit_code == 0, checkout.output

    # pool.json persisted with the new assignment.
    assert pool_json.exists()
    state = pool_state_gw.load()
    assert state is not None
    assert len(state.assignments) == 1
    assert state.assignments[0].branch_name == "feat/one"
    assert state.assignments[0].slot_name == "slot-01"

    # Worktree directory was created on disk via RealSlotsStorageGateway.
    assert (slots_root / "repos" / "repo" / "worktrees" / "slot-01").is_dir()

    # `list` reflects the assignment in its JSON output.
    json_list = runner.invoke(cli, ["json", "list"], input="", obj=_obj(ctx))
    assert json_list.exit_code == 0, json_list.output
    payload = json.loads(json_list.output)
    data = payload["data"]
    assigned = [r for r in data["rows"] if r["status"] == "assigned"]
    assert len(assigned) == 1
    assert assigned[0]["branch"] == "feat/one"
    assert assigned[0]["slot_name"] == "slot-01"
    unallocated = [r for r in data["rows"] if r["status"] == "unallocated"]
    assert len(unallocated) == 15

    # Human table also shows the branch.
    human_list = runner.invoke(
        cli,
        ["list"],
        obj=_obj(ctx),
        env={"COLUMNS": "300"},
    )
    assert human_list.exit_code == 0, human_list.output
    assert "feat/one" in human_list.output
    assert "slot-01" in human_list.output


def test_checkout_twice_reuses_existing(tmp_path: Path) -> None:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir()
    slots_root = tmp_path / "slots"
    pool_json = slots_root / "repos" / "repo" / "pool.json"
    storage = RealSlotsStorageGateway()
    pool_state_gw = RealPoolStateGateway(pool_json_path=pool_json)
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches={"feat/one"},
        existing_paths={repo_root, Path.cwd()},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        on_add_worktree=storage.ensure_dir,
    )
    ctx = _build_ctx(
        git=git,
        storage=storage,
        pool_state_gw=pool_state_gw,
        slots_root=slots_root,
    )
    cli = build_cli()
    runner = CliRunner()

    first = runner.invoke(cli, ["checkout", "feat/one"], obj=_obj(ctx))
    second = runner.invoke(cli, ["checkout", "feat/one"], obj=_obj(ctx))

    assert first.exit_code == 0
    assert second.exit_code == 0
    assert "already assigned" in second.output
    assert len(git._add_worktree_calls) == 1
