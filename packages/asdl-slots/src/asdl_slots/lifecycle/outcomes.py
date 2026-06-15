"""Outcome types returned by slot lifecycle operations."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from asdl_core.gh.types import PRState


@dataclass(frozen=True)
class SlotCheckoutOutcome:
    slot_name: str
    branch_name: str
    worktree_path: Path
    already_assigned: bool
    created_branch: bool
    current_wt_note: str | None


@dataclass(frozen=True)
class SlotLifecycleFailure:
    error_type: str
    message: str


@dataclass(frozen=True)
class SlotClaimOutcome:
    slot_name: str
    branch_name: str
    worktree_path: Path
    replaced_branch_name: str | None
    source_slot_name: str | None
    source_worktree_path: Path | None
    already_current: bool
    main_worktree_path: Path | None = None
    main_checkout_branch: str | None = None


@dataclass(frozen=True)
class SlotInitOutcome:
    created: tuple[str, ...]
    pool_size: int
    worktrees_dir: Path


@dataclass(frozen=True)
class SlotResizeOutcome:
    previous_pool_size: int
    pool_size: int
    created: tuple[str, ...]
    removed: tuple[str, ...]
    worktrees_dir: Path


@dataclass(frozen=True)
class FreedSlot:
    slot_name: str
    branch_name: str
    worktree_path: Path


@dataclass(frozen=True)
class SlotFreePlan:
    targets: tuple[FreedSlot, ...]
    trunk_branch: str


@dataclass(frozen=True)
class SlotFreeOutcome:
    freed: tuple[FreedSlot, ...]


SlotFreeCleanupAction = Literal["pr", "local_branch"]
SlotFreeCleanupStatus = Literal["planned", "success", "skipped", "error"]


@dataclass(frozen=True)
class SlotFreeCleanupResult:
    slot_name: str
    branch_name: str
    action: SlotFreeCleanupAction
    status: SlotFreeCleanupStatus
    pr_number: int | None = None
    message: str | None = None


SlotGcAction = Literal[
    "freed",
    "would_free",
    "kept_open_pr",
    "kept_no_pr",
    "skipped_dirty",
    "skipped_operation",
    "error",
]


@dataclass(frozen=True)
class SlotGcEntry:
    """Per-slot outcome of a slot GC sweep."""

    slot_name: str
    branch_name: str
    worktree_path: Path
    action: SlotGcAction
    pr_number: int | None
    pr_state: PRState | None
    pr_url: str | None
    message: str | None
    cleanup: tuple[SlotFreeCleanupResult, ...] = ()


@dataclass(frozen=True)
class SlotGcPlan:
    """Pre-execution classification for assigned slots."""

    entries: tuple[SlotGcEntry, ...]
    would_free_count: int


@dataclass(frozen=True)
class SlotGcOutcome:
    """Aggregate outcome of a slot GC sweep."""

    entries: tuple[SlotGcEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool
    cleanup_error_count: int = 0
