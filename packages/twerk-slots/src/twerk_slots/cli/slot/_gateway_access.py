from __future__ import annotations

from pathlib import Path

import click

from twerk_slots.gateway.git import GitGateway
from twerk_slots.gateway.pool_state_gateway import PoolStateGateway, RealPoolStateGateway
from twerk_slots.gateway.real_git import RealGitGateway
from twerk_slots.gateway.real_storage import RealSlotsStorageGateway
from twerk_slots.gateway.storage import SlotsStorageGateway
from twerk_slots.repo_context import SLOTS_ROOT


def get_git_gateway() -> GitGateway:
    """Retrieve the GitGateway from the current Click context.

    Falls back to the subprocess-backed gateway so the CLI works out of the
    box in any git repo.
    """
    ctx = click.get_current_context()
    gateway = ctx.obj.get("git_gateway") if ctx.obj else None
    if gateway is None:
        return RealGitGateway()
    return gateway


def get_slots_root() -> Path:
    """Retrieve the slots root directory from the Click context, or ~/.slots."""
    ctx = click.get_current_context()
    slots_root = ctx.obj.get("slots_root") if ctx.obj else None
    if slots_root is None:
        return SLOTS_ROOT
    return slots_root


def get_storage_gateway() -> SlotsStorageGateway:
    """Retrieve the SlotsStorageGateway from the Click context, or a real one."""
    ctx = click.get_current_context()
    gateway = ctx.obj.get("storage_gateway") if ctx.obj else None
    if gateway is None:
        return RealSlotsStorageGateway()
    return gateway


def get_pool_state_gateway() -> PoolStateGateway:
    """Retrieve the PoolStateGateway from the Click context, or a real one."""
    ctx = click.get_current_context()
    gateway = ctx.obj.get("pool_state_gateway") if ctx.obj else None
    if gateway is None:
        return RealPoolStateGateway()
    return gateway
