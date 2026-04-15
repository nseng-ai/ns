"""Helpers for constructing slots contexts in tests."""

from __future__ import annotations

from pathlib import Path

from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.clipboard import ClipboardGateway
from twerk_slots.gateway.git import GitGateway
from twerk_slots.gateway.pool_state_gateway import PoolStateGateway
from twerk_slots.gateway.storage import SlotsStorageGateway
from twerk_slots.repo_context import RepoContext


def build_test_slots_context(
    *,
    repo: RepoContext,
    git: GitGateway,
    storage: SlotsStorageGateway,
    pool_state: PoolStateGateway,
    clipboard: ClipboardGateway,
    slots_root: Path,
    pr: PRGateway | None = None,
) -> SlotsCliContext:
    """Construct a `SlotsCliContext` with a default fake PR gateway."""

    return SlotsCliContext(
        repo=repo,
        git=git,
        pr=FakePRGateway() if pr is None else pr,
        storage=storage,
        pool_state=pool_state,
        clipboard=clipboard,
        slots_root=slots_root,
    )
