from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from vibechk.git import GitGateway, RealGitGateway
from vibechk.ids import generate_run_id
from vibechk.runners import RunnerRegistry, build_production_runner_registry


@dataclass(frozen=True)
class CliDeps:
    runner_registry: RunnerRegistry
    git_gateway_factory: Callable[[Path], GitGateway]
    clock: Callable[[], datetime]
    id_generator: Callable[[], str]
    default_runner_name: str = "claude"

    @classmethod
    def production(cls) -> CliDeps:
        return cls(
            runner_registry=build_production_runner_registry(),
            git_gateway_factory=RealGitGateway,
            clock=lambda: datetime.now(UTC),
            id_generator=generate_run_id,
        )
