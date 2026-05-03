"""End-to-end round trip: `slot checkout <br>` then `slot list` against a
FakeGitGateway with a tmp_path slots_root. Exercises the real CLI wiring
(discover_repo_or_sentinel, planner, rendering) against the real
``RealSlotsStorageGateway``.

The new inventory-driven checkout requires a pre-seeded managed slot
worktree, mirroring what `slot init` would have produced. We seed it
directly in the FakeGitGateway and on disk so checkout can allocate into
the existing detached slot rather than creating a worktree on demand."""

from __future__ import annotations

import json
from pathlib import Path

from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import WorktreeInfo
from asdl_slots.cli.main import build_cli
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.real_storage import RealSlotsStorageGateway
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.repo_context import RepoContext, discover_repo_or_sentinel


def _build_ctx(
    *,
    git: FakeGitGateway,
    storage: RealSlotsStorageGateway,
    slots_root: Path,
) -> SlotsCliContext:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=git)
    assert isinstance(repo, RepoContext)
    return SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=slots_root,
    )


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _seed_slot_dir(slots_root: Path, n: int) -> Path:
    path = slots_root / "repos" / "repo" / "worktrees" / f"slot-{n:02d}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_checkout_then_list_reflects_state(tmp_path: Path) -> None:
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir()
    slots_root = tmp_path / "slots"
    storage = RealSlotsStorageGateway()

    slot_01 = _seed_slot_dir(slots_root, 1)
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches={"feat/one", "feat/two"},
        worktrees=(WorktreeInfo(path=slot_01, branch=None, is_bare=False),),
        existing_paths={repo_root, Path.cwd(), slot_01},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        on_add_worktree=storage.ensure_dir,
    )
    ctx = _build_ctx(
        git=git,
        storage=storage,
        slots_root=slots_root,
    )
    cli = build_cli()
    runner = CliRunner()

    checkout = runner.invoke(cli, ["checkout", "feat/one"], obj=_obj(ctx))
    assert checkout.exit_code == 0, checkout.output

    # `list` reflects the assignment in its JSON output. Inventory is derived
    # from Git worktree state, so the only row is the seeded slot now bound
    # to feat/one.
    json_list = runner.invoke(cli, ["list", "--format", "json"], obj=_obj(ctx))
    assert json_list.exit_code == 0, json_list.output
    payload = json.loads(json_list.output)
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["pool_size"] == 1
    assert len(data["rows"]) == 1
    assigned = [r for r in data["rows"] if r["status"] == "assigned"]
    assert len(assigned) == 1
    assert assigned[0]["branch"] == "feat/one"
    assert assigned[0]["slot_name"] == "slot-01"

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
    storage = RealSlotsStorageGateway()
    slot_01 = _seed_slot_dir(slots_root, 1)
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        branches={"feat/one"},
        worktrees=(WorktreeInfo(path=slot_01, branch=None, is_bare=False),),
        existing_paths={repo_root, Path.cwd(), slot_01},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        on_add_worktree=storage.ensure_dir,
    )
    ctx = _build_ctx(
        git=git,
        storage=storage,
        slots_root=slots_root,
    )
    cli = build_cli()
    runner = CliRunner()

    first = runner.invoke(cli, ["checkout", "feat/one"], obj=_obj(ctx))
    second = runner.invoke(cli, ["checkout", "feat/one"], obj=_obj(ctx))

    assert first.exit_code == 0
    assert second.exit_code == 0
    assert "already assigned" in second.output
    # Only one git checkout into the slot — the second invocation reuses.
    assert git._checkout_calls == [(slot_01, "feat/one")]
