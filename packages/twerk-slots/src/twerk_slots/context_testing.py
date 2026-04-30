"""Test-only helper for building ``SlotsCliContext`` with fake defaults.

Lives in ``src/twerk_slots`` (not under ``tests/``) so any test in any
slots package can import it without cross-tests path hacks. Mirrors the
``twerk_core.gh.pr_testing`` pattern for the same reason.
"""

from __future__ import annotations

from pathlib import Path

from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.clipboard import ClipboardGateway
from twerk_slots.gateway.storage import SlotsStorageGateway
from twerk_slots.gateway.testing.clipboard import FakeClipboardGateway
from twerk_slots.gateway.testing.storage import FakeSlotsStorageGateway
from twerk_slots.repo_context import RepoContext


def build_test_slots_context(
    repo: RepoContext,
    *,
    slots_root: Path,
    git: GitGateway | None = None,
    storage: SlotsStorageGateway | None = None,
    clipboard: ClipboardGateway | None = None,
    pr: PRGateway | None = None,
) -> SlotsCliContext:
    """Assemble a ``SlotsCliContext`` for tests, filling omitted gateways with fakes.

    Callers pass in the fakes they need to mutate or inspect; the rest fall
    back to fresh defaults (empty clipboard, empty PR map, storage seeded
    with the repo's own dirs, and so on).
    """
    resolved_storage = (
        storage
        if storage is not None
        else FakeSlotsStorageGateway(
            existing_paths={repo.root, repo.repo_dir, repo.worktrees_dir},
        )
    )
    return SlotsCliContext(
        repo=repo,
        git=git
        if git is not None
        else FakeGitGateway(
            repo_root=repo.root,
            existing_paths={repo.root, repo.repo_dir, repo.worktrees_dir},
            on_add_worktree=resolved_storage.ensure_dir,
        ),
        storage=resolved_storage,
        clipboard=clipboard if clipboard is not None else FakeClipboardGateway(),
        pr=pr if pr is not None else FakePRGateway(),
        slots_root=slots_root,
    )
