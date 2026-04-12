"""Shared request context bundling the slots repo with its three gateways.

:class:`SlotsCliContext` carries everything a slot operation needs (the
resolved :class:`RepoContext` plus the git, storage, and pool-state
gateways) so callers pass a single ``ctx`` instead of four arguments.
"""

from __future__ import annotations

from dataclasses import dataclass

from twerk_slots.gateway.git import GitGateway
from twerk_slots.gateway.pool_state_gateway import PoolStateGateway
from twerk_slots.gateway.storage import SlotsStorageGateway
from twerk_slots.repo_context import RepoContext


@dataclass(frozen=True)
class SlotsCliContext:
    repo: RepoContext
    git: GitGateway
    storage: SlotsStorageGateway
    pool_state: PoolStateGateway
