from __future__ import annotations

import importlib.resources
import json
import re
import shutil
from pathlib import Path

import click

from areg.context import AregContext
from areg.gateways.npx_skills.gateway import NpxSkillsError
from areg.preconditions import requires_npx
from areg.skillx import _DEFAULT_SKILL_REPO

_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$")
_DEFAULT_AGENTS = ("codex", "claude-code")
_TEMPLATES = importlib.resources.files("areg") / "_templates"


def _read_template(name: str) -> str:
    return (_TEMPLATES / name).read_text(encoding="utf-8")


@click.command("create-project")
@click.argument("project_name")
@click.option(
    "--path",
    type=click.Path(),
    default=".",
    help="Parent directory to create the project in.",
)
@click.option(
    "--agent",
    "agents",
    multiple=True,
    default=_DEFAULT_AGENTS,
    help="Agents to install skills for (repeatable).",
)
@click.pass_obj
def create_project(
    ctx: AregContext,
    project_name: str,
    path: str,
    agents: tuple[str, ...],
) -> None:
    """Create a new areg project with skill infrastructure."""

    requires_npx()

    if not _NAME_RE.match(project_name):
        raise click.ClickException(
            f"Invalid project name {project_name!r}. "
            "Use alphanumeric characters, hyphens, underscores, or dots. "
            "Must start with a letter or digit."
        )

    parent = Path(path).resolve()
    if not parent.is_dir():
        raise click.ClickException(f"Parent directory {parent} does not exist.")

    project_dir = parent / project_name
    if project_dir.exists():
        raise click.ClickException(f"Directory {project_dir} already exists.")

    try:
        project_dir.mkdir()

        click.echo("Installing skills via npx skills add...")
        try:
            ctx.npx_skills.add(
                _DEFAULT_SKILL_REPO,
                skills=["skill-management", "skillx"],
                agents=list(agents),
                cwd=project_dir,
            )
        except NpxSkillsError as e:
            raise click.ClickException(f"npx skills add failed: {e}") from e

        (project_dir / "areg.json").write_text(
            json.dumps({"agents": list(agents)}, indent=2) + "\n",
            encoding="utf-8",
        )
        (project_dir / "AGENTS.md").write_text(_read_template("AGENTS.md"), encoding="utf-8")
        claude_md = _read_template("CLAUDE.md").replace("{project_name}", project_name)
        (project_dir / "CLAUDE.md").write_text(claude_md, encoding="utf-8")
        (project_dir / ".gitignore").write_text(_read_template("gitignore"), encoding="utf-8")
        claude_dir = project_dir / ".claude"
        claude_dir.mkdir(exist_ok=True)
        (claude_dir / "settings.local.json").write_text(
            _read_template("settings.local.json"), encoding="utf-8"
        )

    except Exception:
        if project_dir.exists():
            shutil.rmtree(project_dir)
        raise

    click.echo(f"\nCreated areg project at {project_dir}")
    click.echo("Skills installed: skill-management, skillx")
    click.echo(f"\n  cd {project_name}\n")
