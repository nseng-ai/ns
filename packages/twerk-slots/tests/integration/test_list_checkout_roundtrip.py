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

from twerk_slots.cli.main import build_cli
from twerk_slots.gateway.pool_state_gateway import RealPoolStateGateway
from twerk_slots.gateway.real_storage import RealSlotsStorageGateway
from twerk_slots.gateway.testing import FakeClipboardGateway, FakeGitGateway


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
        storage=storage,
    )
    obj = {
        "git_gateway": git,
        "storage_gateway": storage,
        "pool_state_gateway": pool_state_gw,
        "clipboard_gateway": FakeClipboardGateway(),
        "slots_root": slots_root,
    }
    cli = build_cli()
    runner = CliRunner()

    checkout = runner.invoke(cli, ["checkout", "feat/one"], obj=obj)
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
    json_list = runner.invoke(cli, ["json", "list"], input="", obj=obj)
    assert json_list.exit_code == 0, json_list.output
    payload = json.loads(json_list.output)
    assigned = [r for r in payload["rows"] if r["status"] == "assigned"]
    assert len(assigned) == 1
    assert assigned[0]["branch"] == "feat/one"
    assert assigned[0]["slot_name"] == "slot-01"
    unallocated = [r for r in payload["rows"] if r["status"] == "unallocated"]
    assert len(unallocated) == 15

    # Human table also shows the branch.
    human_list = runner.invoke(
        cli,
        ["list"],
        obj=obj,
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
        storage=storage,
    )
    obj = {
        "git_gateway": git,
        "storage_gateway": storage,
        "pool_state_gateway": pool_state_gw,
        "clipboard_gateway": FakeClipboardGateway(),
        "slots_root": slots_root,
    }
    cli = build_cli()
    runner = CliRunner()

    first = runner.invoke(cli, ["checkout", "feat/one"], obj=obj)
    second = runner.invoke(cli, ["checkout", "feat/one"], obj=obj)

    assert first.exit_code == 0
    assert second.exit_code == 0
    assert "already assigned" in second.output
    assert len(git._add_worktree_calls) == 1
