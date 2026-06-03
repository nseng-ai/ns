"""Shared reader for asdl project-level configuration."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path

ASDL_CONFIG_FILENAME = "asdl.toml"


@dataclass(frozen=True)
class AregProjectConfig:
    """Project config for areg."""

    agents: tuple[str, ...]


@dataclass(frozen=True)
class RoasterDiffProjectConfig:
    """Project config for roaster's local diff loading."""

    exclude: tuple[str, ...]


@dataclass(frozen=True)
class RoasterProjectConfig:
    """Project config for roaster."""

    diff: RoasterDiffProjectConfig


@dataclass(frozen=True)
class AsdlProjectConfig:
    """Parsed asdl project-level configuration."""

    path: Path | None
    areg: AregProjectConfig
    roaster: RoasterProjectConfig


class AsdlProjectConfigError(ValueError):
    """Raised when asdl.toml exists but cannot be parsed or validated."""


TomlTable = dict[str, object]


def load_asdl_project_config(repo_root: Path) -> AsdlProjectConfig:
    """Read ``repo_root/asdl.toml``, or return empty defaults when missing."""
    path = repo_root / ASDL_CONFIG_FILENAME
    if not path.exists():
        return _default_config(path=None)
    if not path.is_file():
        raise AsdlProjectConfigError(f"{path}: {ASDL_CONFIG_FILENAME} exists but is not a file.")

    try:
        source = path.read_text(encoding="utf-8")
    except OSError as exc:
        message = f"{path}: failed to read {ASDL_CONFIG_FILENAME}: {exc}"
        raise AsdlProjectConfigError(message) from exc

    return parse_asdl_project_config(source, path=path)


def parse_asdl_project_config(source: str, *, path: Path | None = None) -> AsdlProjectConfig:
    """Parse TOML source into an asdl project config."""
    try:
        data = tomllib.loads(source)
    except tomllib.TOMLDecodeError as exc:
        raise AsdlProjectConfigError(_format_error(f"Invalid TOML: {exc}", path=path)) from exc

    return AsdlProjectConfig(
        path=path,
        areg=_parse_areg_config(data, path=path),
        roaster=_parse_roaster_config(data, path=path),
    )


def _default_config(*, path: Path | None) -> AsdlProjectConfig:
    return AsdlProjectConfig(
        path=path,
        areg=AregProjectConfig(agents=()),
        roaster=RoasterProjectConfig(diff=RoasterDiffProjectConfig(exclude=())),
    )


def _parse_areg_config(data: TomlTable, *, path: Path | None) -> AregProjectConfig:
    areg_table = _optional_table(data.get("areg"), label="[areg]", path=path)
    if areg_table is None or "agents" not in areg_table:
        return AregProjectConfig(agents=())

    return AregProjectConfig(
        agents=_string_array(
            areg_table["agents"],
            label="[areg].agents",
            path=path,
            require_non_empty=True,
        )
    )


def _parse_roaster_config(data: TomlTable, *, path: Path | None) -> RoasterProjectConfig:
    roaster_table = _optional_table(data.get("roaster"), label="[roaster]", path=path)
    if roaster_table is None:
        return RoasterProjectConfig(diff=RoasterDiffProjectConfig(exclude=()))

    diff_table = _optional_table(roaster_table.get("diff"), label="[roaster.diff]", path=path)
    if diff_table is None or "exclude" not in diff_table:
        return RoasterProjectConfig(diff=RoasterDiffProjectConfig(exclude=()))

    exclude = _string_array(
        diff_table["exclude"],
        label="[roaster.diff].exclude",
        path=path,
        require_non_empty=False,
    )
    for pattern in exclude:
        _validate_roaster_exclude_pattern(pattern, path=path)

    return RoasterProjectConfig(diff=RoasterDiffProjectConfig(exclude=exclude))


def _optional_table(value: object, *, label: str, path: Path | None) -> TomlTable | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise AsdlProjectConfigError(_format_error(f"{label} must be a TOML table.", path=path))

    table: TomlTable = {}
    for key, item in value.items():
        if isinstance(key, str):
            table[key] = item
    return table


def _string_array(
    value: object,
    *,
    label: str,
    path: Path | None,
    require_non_empty: bool,
) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise AsdlProjectConfigError(
            _format_error(f"{label} must be a TOML array of non-empty strings.", path=path)
        )
    if require_non_empty and not value:
        raise AsdlProjectConfigError(
            _format_error(f"{label} must contain at least one agent.", path=path)
        )

    strings: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise AsdlProjectConfigError(
                _format_error(f"{label} must contain only non-empty strings.", path=path)
            )
        strings.append(item)
    return tuple(strings)


def _validate_roaster_exclude_pattern(pattern: str, *, path: Path | None) -> None:
    if pattern.startswith(":("):
        raise AsdlProjectConfigError(
            _format_error(
                "[roaster.diff].exclude entries must be plain glob patterns, "
                "not raw Git pathspecs.",
                path=path,
            )
        )
    if Path(pattern).is_absolute():
        raise AsdlProjectConfigError(
            _format_error(
                "[roaster.diff].exclude entries must be repo-relative patterns.",
                path=path,
            )
        )
    if ".." in pattern.split("/"):
        raise AsdlProjectConfigError(
            _format_error(
                "[roaster.diff].exclude entries must not contain '..' path segments.",
                path=path,
            )
        )


def _format_error(message: str, *, path: Path | None) -> str:
    if path is None:
        return message
    return f"{path}: {message}"
