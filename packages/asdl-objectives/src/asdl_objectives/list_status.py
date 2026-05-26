"""Checkout-local Objective status filtering for ``objective list``."""

from __future__ import annotations

from typing import Literal

ObjectiveStatus = Literal["open", "closed"]
ObjectiveStatusFilter = Literal["all", "active", "open", "closed"]


def matches_status_filter(status: ObjectiveStatus, status_filter: ObjectiveStatusFilter) -> bool:
    if status_filter == "all":
        return True
    if status_filter == "active":
        return status == "open"
    return status == status_filter
