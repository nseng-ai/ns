"""Checkout-local Objective record inventory."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from asdl_objectives.objective_paths import ACTIVE_OBJECTIVE_ROOT

ObjectiveRecordStatus = Literal["open", "closed"]


@dataclass(frozen=True)
class ObjectiveCheckoutRecord:
    """Objective record discovered in the current checkout."""

    slug: str
    status: ObjectiveRecordStatus


@dataclass(frozen=True)
class ObjectiveCheckoutInventory:
    """Objective records physically present in the current checkout."""

    records: tuple[ObjectiveCheckoutRecord, ...]


def build_objective_checkout_inventory(repo_root: Path) -> ObjectiveCheckoutInventory:
    """Return Objective directories directly under ``.asdl/objectives`` in ``repo_root``."""
    root = repo_root / ACTIVE_OBJECTIVE_ROOT
    if not root.exists() or not root.is_dir():
        return ObjectiveCheckoutInventory(records=())

    records = tuple(
        ObjectiveCheckoutRecord(
            slug=child.name,
            status="closed" if (child / "closed.md").exists() else "open",
        )
        for child in sorted(root.iterdir(), key=lambda path: path.name)
        if child.is_dir()
    )
    return ObjectiveCheckoutInventory(records=records)
