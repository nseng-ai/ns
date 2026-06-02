"""Resolve target agent directories for areg commands."""

from __future__ import annotations

import json
from pathlib import Path

import click

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

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise click.ClickException(f"Invalid JSON in areg.json: {exc}") from exc
    except OSError as exc:
        raise click.ClickException(f"Failed to read areg.json at {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise click.ClickException("areg.json must contain a JSON object.")

    agents = data.get("agents")
    if not isinstance(agents, list) or not agents:
        raise click.ClickException("areg.json field `agents` must be a non-empty string list.")

    resolved_agents: list[str] = []
    for agent in agents:
        if not isinstance(agent, str) or not agent.strip():
            raise click.ClickException("areg.json field `agents` must be a non-empty string list.")
        resolved_agents.append(agent)
    return tuple(resolved_agents)
