"""Real harness-config gateway backed by ``.twerk/reviewer.toml``."""

from __future__ import annotations

import tomllib
from pathlib import Path

from twerk_reviewer.gateways.harness_config.gateway import (
    CONFIG_SCHEMA_VERSION,
    HarnessConfigGateway,
    ReviewerConfig,
    config_path,
)
from twerk_reviewer.models import ReviewerFailure


class RealHarnessConfigGateway(HarnessConfigGateway):
    """Read and write the reviewer config from ``.twerk/reviewer.toml``."""

    def load(self, repo_root: Path) -> ReviewerConfig | ReviewerFailure:
        path = config_path(repo_root)
        if not path.exists():
            return ReviewerFailure(
                error_type="harness_config_missing",
                message=(
                    f"No reviewer config at {path}. Run `reviewer harness init` to create one."
                ),
            )

        try:
            raw = path.read_bytes()
        except OSError as exc:
            return ReviewerFailure(
                error_type="harness_config_read_failed",
                message=f"Unable to read {path}: {exc}",
            )

        try:
            data = tomllib.loads(raw.decode("utf-8"))
        except (tomllib.TOMLDecodeError, UnicodeDecodeError) as exc:
            return ReviewerFailure(
                error_type="harness_config_invalid_toml",
                message=f"Unable to parse {path}: {exc}",
            )

        schema_version = data.get("schema_version")
        if schema_version != CONFIG_SCHEMA_VERSION:
            return ReviewerFailure(
                error_type="harness_config_unsupported_schema",
                message=(
                    f"Reviewer config at {path} has schema_version={schema_version!r}; "
                    f"expected {CONFIG_SCHEMA_VERSION}."
                ),
            )

        harness_section = data.get("harness")
        if not isinstance(harness_section, dict):
            return ReviewerFailure(
                error_type="harness_config_invalid",
                message=f"Reviewer config at {path} is missing a `[harness]` section.",
            )

        harness_name = harness_section.get("name")
        if not isinstance(harness_name, str) or not harness_name.strip():
            return ReviewerFailure(
                error_type="harness_config_invalid",
                message=f"Reviewer config at {path} is missing `harness.name`.",
            )

        return ReviewerConfig(harness_name=harness_name.strip())

    def save(self, repo_root: Path, config: ReviewerConfig) -> None | ReviewerFailure:
        path = config_path(repo_root)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(_render_toml(config), encoding="utf-8")
        except OSError as exc:
            return ReviewerFailure(
                error_type="harness_config_write_failed",
                message=f"Unable to write {path}: {exc}",
            )
        return None


def _render_toml(config: ReviewerConfig) -> str:
    escaped = config.harness_name.replace("\\", "\\\\").replace('"', '\\"')
    return f'schema_version = {CONFIG_SCHEMA_VERSION}\n\n[harness]\nname = "{escaped}"\n'
