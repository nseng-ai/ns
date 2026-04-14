from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

import click

from twerk_oneshot.gateways.execution.gateway import ExecutionBackend
from twerk_oneshot.gateways.execution.real import RealExecutionBackend
from twerk_oneshot.gateways.github_queue.gateway import GitHubQueueGateway
from twerk_oneshot.gateways.github_queue.real import RealGitHubQueueGateway


def get_queue_gateway() -> GitHubQueueGateway:
    ctx = click.get_current_context()
    gateway = ctx.obj.get("oneshot_queue_gateway") if ctx.obj else None
    if gateway is None:
        return RealGitHubQueueGateway()
    return gateway


def get_execution_backend() -> ExecutionBackend:
    ctx = click.get_current_context()
    backend = ctx.obj.get("oneshot_execution_backend") if ctx.obj else None
    if backend is None:
        return RealExecutionBackend()
    return backend


def get_now() -> Callable[[], datetime]:
    ctx = click.get_current_context()
    now = ctx.obj.get("oneshot_now") if ctx.obj else None
    if now is None:
        return lambda: datetime.now(tz=UTC)
    return now
