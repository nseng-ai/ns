"""Shared request context bundling the slots repo with its gateways.

:class:`SlotsCliContext` carries everything a slot operation needs (the
resolved :class:`RepoContext` plus the git, storage, pool-state, and
clipboard gateways) so callers pass a single ``ctx``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.git.git_gateway import GitGateway
from twerk_slots.gateway.clipboard import ClipboardGateway
from twerk_slots.gateway.pool_state_gateway import PoolStateGateway
from twerk_slots.gateway.storage import SlotsStorageGateway
from twerk_slots.repo_context import RepoContext


@dataclass(frozen=True)
class SlotsCliContext:
    repo: RepoContext
    git: GitGateway
    storage: SlotsStorageGateway
    pool_state: PoolStateGateway
    clipboard: ClipboardGateway
    pr: PRGateway
    slots_root: Path
