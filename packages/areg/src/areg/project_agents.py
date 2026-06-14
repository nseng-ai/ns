"""Resolve target agent directories for areg commands."""

from __future__ import annotations

from pathlib import Path

import click

from areg.json_config import extract_string_list_field, read_json_object
from asdl_core.project_config import AsdlProjectConfigError, load_asdl_project_config

DEFAULT_AGENTS = ("codex", "claude-code")


def resolve_project_agents(project_dir: Path, explicit: tuple[str, ...]) -> tuple[str, ...]:
    """Resolve target agents from CLI values, asdl.toml, legacy areg.json, or defaults."""
    if explicit:
        return explicit

    try:
        config = load_asdl_project_config(project_dir)
    except AsdlProjectConfigError as exc:
        raise click.ClickException(str(exc)) from exc

    if config.areg.agents:
        return config.areg.agents

    legacy_agents = _read_legacy_areg_json_agents(project_dir)
    if legacy_agents is not None:
        return legacy_agents

    return DEFAULT_AGENTS


def _read_legacy_areg_json_agents(project_dir: Path) -> tuple[str, ...] | None:
    path = project_dir / "areg.json"
    if not path.is_file():
        return None

    data = read_json_object(path, description="areg.json")
    agents = extract_string_list_field(
        data,
        "agents",
        error_message="areg.json field `agents` must be a non-empty string list.",
        require_non_empty=True,
        require_non_blank_items=True,
    )
    return tuple(agents)
