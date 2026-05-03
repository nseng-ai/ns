"""Shared request context bundling the slots repo with its gateways.

:class:`SlotsCliContext` carries everything a slot operation needs (the
resolved :class:`RepoContext` plus the git, storage, and clipboard
gateways) so callers pass a single ``ctx``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.git.git_gateway import GitGateway
from asdl_slots.gateway.clipboard import ClipboardGateway
from asdl_slots.gateway.storage import SlotsStorageGateway
from asdl_slots.repo_context import RepoContext


@dataclass(frozen=True)
class SlotsCliContext:
    repo: RepoContext
    git: GitGateway
    storage: SlotsStorageGateway
    clipboard: ClipboardGateway
    pr: PRGateway
    slots_root: Path
