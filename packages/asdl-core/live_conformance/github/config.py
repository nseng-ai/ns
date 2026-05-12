"""Configuration boundary for opt-in live GitHub conformance tests."""

from __future__ import annotations

import os
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime

_REPO_ENV = "ASDL_GH_CONFORMANCE_REPO"
_ALLOW_MUTATIONS_ENV = "ASDL_GH_CONFORMANCE_ALLOW_MUTATIONS"
_RUN_ID_ENV = "ASDL_GH_CONFORMANCE_RUN_ID"

_TRUE_ENV_VALUES = frozenset({"1", "true", "yes", "on"})
_FALSE_ENV_VALUES = frozenset({"0", "false", "no", "off", ""})


class ConformanceConfigError(ValueError):
    """Raised when live conformance configuration is missing or invalid."""


@dataclass(frozen=True)
class ConformanceConfig:
    """Runtime configuration for a live GitHub conformance run."""

    repo: str
    allow_mutations: bool
    run_id: str

    @property
    def owner(self) -> str:
        return self.repo.split("/", maxsplit=1)[0]

    @property
    def name(self) -> str:
        return self.repo.split("/", maxsplit=1)[1]


def build_conformance_config(
    *,
    repo_option: str | None,
    allow_mutations_option: bool | None,
    run_id_option: str | None,
    env: Mapping[str, str] | None = None,
) -> ConformanceConfig:
    """Build config from pytest options first and ASDL env vars second."""
    config_env = os.environ if env is None else env
    repo = _validate_repo(_first_present(repo_option, config_env.get(_REPO_ENV)))
    allow_mutations = _resolve_allow_mutations(allow_mutations_option, config_env)
    run_id = _resolve_run_id(_first_present(run_id_option, config_env.get(_RUN_ID_ENV)))
    return ConformanceConfig(repo=repo, allow_mutations=allow_mutations, run_id=run_id)


def _first_present(primary: str | None, fallback: str | None) -> str | None:
    if primary is not None and primary.strip() != "":
        return primary
    if fallback is not None and fallback.strip() != "":
        return fallback
    return None


def _validate_repo(repo: str | None) -> str:
    if repo is None:
        raise ConformanceConfigError(
            "missing GitHub conformance repository; pass --github-conformance-repo owner/name "
            f"or set {_REPO_ENV}"
        )

    normalized = repo.strip()
    parts = normalized.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ConformanceConfigError(
            f"GitHub conformance repository must be in owner/name form; got {repo!r}"
        )
    if parts[0].strip() != parts[0] or parts[1].strip() != parts[1]:
        raise ConformanceConfigError(
            "GitHub conformance repository owner/name segments must not contain whitespace; "
            f"got {repo!r}"
        )
    return normalized


def _resolve_allow_mutations(
    allow_mutations_option: bool | None,
    env: Mapping[str, str],
) -> bool:
    if allow_mutations_option is True:
        return True

    env_value = env.get(_ALLOW_MUTATIONS_ENV)
    if env_value is None:
        return False

    normalized = env_value.strip().lower()
    if normalized in _TRUE_ENV_VALUES:
        return True
    if normalized in _FALSE_ENV_VALUES:
        return False
    raise ConformanceConfigError(
        f"{_ALLOW_MUTATIONS_ENV} must be one of 1/true/yes/on or 0/false/no/off when set"
    )


def _resolve_run_id(run_id: str | None) -> str:
    if run_id is not None and run_id.strip() != "":
        return run_id.strip()
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"{timestamp}-{uuid.uuid4().hex[:8]}"
