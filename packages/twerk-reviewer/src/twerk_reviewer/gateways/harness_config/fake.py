"""In-memory fake for the harness-config gateway."""

from __future__ import annotations

from pathlib import Path

from twerk_reviewer.gateways.harness_config.gateway import (
    HarnessConfigGateway,
    ReviewerConfig,
)
from twerk_reviewer.models import ReviewerFailure


class FakeHarnessConfigGateway(HarnessConfigGateway):
    """Store configs in a dict keyed by repo root."""

    def __init__(
        self,
        *,
        configs: dict[Path, ReviewerConfig] | None = None,
        load_failure: ReviewerFailure | None = None,
    ) -> None:
        self._configs: dict[Path, ReviewerConfig] = dict(configs or {})
        self._load_failure = load_failure
        self._save_calls: list[tuple[Path, ReviewerConfig]] = []

    def load(self, repo_root: Path) -> ReviewerConfig | ReviewerFailure:
        if self._load_failure is not None:
            return self._load_failure
        config = self._configs.get(repo_root)
        if config is None:
            return ReviewerFailure(
                error_type="harness_config_missing",
                message=(
                    f"No reviewer config at {repo_root}. Run `reviewer harness init` to create one."
                ),
            )
        return config

    def save(self, repo_root: Path, config: ReviewerConfig) -> None | ReviewerFailure:
        self._save_calls.append((repo_root, config))
        self._configs[repo_root] = config
        return None

    @property
    def save_calls(self) -> tuple[tuple[Path, ReviewerConfig], ...]:
        return tuple(self._save_calls)
