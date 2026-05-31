from __future__ import annotations

import importlib.resources
import json
import subprocess
from pathlib import Path

import click

from areg.context import AregContext
from areg.gateways.npx_skills.gateway import NpxSkillsError
from areg.preconditions import requires_npx

_DEFAULT_AGENTS = ("codex", "claude-code")
_BOOTSTRAP_REPO = "dagster-io/asdl-tools"
_BOOTSTRAP_SKILLS = ("skill-management", "skillx")
_TEMPLATES = importlib.resources.files("areg") / "_templates"

_AGENTS_BLOCK_START = "<!-- areg:skills:start -->"
_AGENTS_BLOCK_END = "<!-- areg:skills:end -->"
_CLAUDE_BLOCK_START = "<!-- areg:claude-skills:start -->"
_CLAUDE_BLOCK_END = "<!-- areg:claude-skills:end -->"

_AGENTS_BLOCK = "\n".join(
    [
        _AGENTS_BLOCK_START,
        "## Skills",
        "",
        "This project uses agent skills installed on disk.",
        "",
        "- Discover installed skills from their `SKILL.md` frontmatter under "
        "`.agents/skills/`; do not keep a duplicate skill index in this file.",
        "- Local first-party skills live in `skills/<name>/`; `.agents/skills/<name>` "
        "should symlink to `../../skills/<name>`.",
        "- GitHub-sourced or vendored skills live as real directories under "
        "`.agents/skills/<name>/`; do not refactor or lint them as first-party project "
        "code unless explicitly asked.",
        "- `.claude/skills/<name>` entries symlink to `../../.agents/skills/<name>` "
        "for Claude Code.",
        "- For persistent skill add, update, remove, list, and publish workflows, use "
        "the installed `skill-management` skill, which documents the `npx skills` "
        "commands for this project.",
        _AGENTS_BLOCK_END,
    ]
)

_CLAUDE_NOTE = (
    "Claude Code discovers installed skills from `.claude/skills/`, which symlinks into "
    "`.agents/skills/`. Use Claude's skill invocation UI for installed skills when "
    "available. Use `skill-management` for persistent skill changes and `skillx` for "
    "transient GitHub skill execution."
)


def _read_template(name: str) -> str:
    return (_TEMPLATES / name).read_text(encoding="utf-8")


def _resolve_target_dir(target: str) -> Path:
    target_path = Path(target)
    if not target_path.exists():
        raise click.ClickException(f"Target {target_path} does not exist.")

    target_dir = target_path.resolve()
    if not target_dir.is_dir():
        raise click.ClickException(f"Target {target_dir} is not a directory.")
    return target_dir


def _require_git_root(target_dir: Path) -> None:
    try:
        proc = subprocess.run(
            ["git", "-C", str(target_dir), "rev-parse", "--show-toplevel"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as e:
        raise click.ClickException("git is required but was not found on PATH.") from e
    except subprocess.CalledProcessError as e:
        raise click.ClickException(
            f"Target {target_dir} must be a Git worktree root. Run git init first."
        ) from e

    root_raw = proc.stdout.strip()
    if not root_raw:
        raise click.ClickException(
            f"Target {target_dir} must be a Git worktree root. Run git init first."
        )

    root = Path(root_raw).resolve()
    if root != target_dir:
        raise click.ClickException(
            f"Target {target_dir} is inside a Git worktree but is not the root. "
            f"Run areg init {root} instead."
        )


def _write_text(path: Path, content: str, description: str) -> None:
    try:
        path.write_text(content, encoding="utf-8")
    except OSError as e:
        raise click.ClickException(f"Failed to write {description} at {path}: {e}") from e


def _read_existing_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as e:
        raise click.ClickException(f"Failed to read {path}: {e}") from e


def _managed_block_bounds(
    content: str,
    *,
    path: Path,
    start_marker: str,
    end_marker: str,
) -> tuple[int, int] | None:
    start_count = content.count(start_marker)
    end_count = content.count(end_marker)
    if start_count == 0 and end_count == 0:
        return None
    if start_count != 1 or end_count != 1:
        raise click.ClickException(
            f"{path} has a malformed areg-managed block. Fix the markers manually."
        )

    start_index = content.find(start_marker)
    end_marker_index = content.find(end_marker)
    if end_marker_index < start_index:
        raise click.ClickException(
            f"{path} has a malformed areg-managed block. Fix the markers manually."
        )
    return start_index, end_marker_index + len(end_marker)


def _append_block(content: str, block: str) -> str:
    if not content:
        return block + "\n"
    if content.endswith("\n\n"):
        return content + block + "\n"
    if content.endswith("\n"):
        return content + "\n" + block + "\n"
    return content + "\n\n" + block + "\n"


def _apply_managed_block(
    path: Path,
    *,
    new_file_content: str,
    block: str,
    start_marker: str,
    end_marker: str,
    assume_yes: bool,
    no_append: bool,
    append_prompt: str,
    update_prompt: str,
) -> None:
    if not path.exists():
        _write_text(path, new_file_content, path.name)
        return

    if not path.is_file():
        raise click.ClickException(f"{path} exists but is not a file.")

    content = _read_existing_text(path)
    bounds = _managed_block_bounds(
        content,
        path=path,
        start_marker=start_marker,
        end_marker=end_marker,
    )
    if bounds is None:
        if no_append:
            return
        if not assume_yes and not click.confirm(append_prompt, default=False):
            return
        _write_text(path, _append_block(content, block), path.name)
        return

    start, end = bounds
    current_block = content[start:end]
    if current_block == block:
        return
    if no_append:
        return
    if not assume_yes and not click.confirm(update_prompt, default=False):
        return
    _write_text(path, content[:start] + block + content[end:], path.name)


def _agents_file_content() -> str:
    return "# Agents\n\n" + _AGENTS_BLOCK + "\n"


def _claude_block(*, include_agents_ref: bool) -> str:
    lines = [
        _CLAUDE_BLOCK_START,
        "## Claude Code skills",
        "",
    ]
    if include_agents_ref:
        lines.extend(["@AGENTS.md", ""])
    lines.extend([_CLAUDE_NOTE, _CLAUDE_BLOCK_END])
    return "\n".join(lines)


def _content_without_managed_block(
    content: str,
    *,
    path: Path,
    start_marker: str,
    end_marker: str,
) -> str:
    bounds = _managed_block_bounds(
        content,
        path=path,
        start_marker=start_marker,
        end_marker=end_marker,
    )
    if bounds is None:
        return content
    start, end = bounds
    return content[:start] + content[end:]


def _ensure_agents_md(project_dir: Path, *, assume_yes: bool, no_append: bool) -> None:
    _apply_managed_block(
        project_dir / "AGENTS.md",
        new_file_content=_agents_file_content(),
        block=_AGENTS_BLOCK,
        start_marker=_AGENTS_BLOCK_START,
        end_marker=_AGENTS_BLOCK_END,
        assume_yes=assume_yes,
        no_append=no_append,
        append_prompt="AGENTS.md exists without an areg-managed Skills block. Add one?",
        update_prompt="AGENTS.md has an existing areg-managed Skills block. Replace it?",
    )


def _ensure_claude_md(project_dir: Path, *, assume_yes: bool, no_append: bool) -> None:
    path = project_dir / "CLAUDE.md"
    if not path.exists():
        block = _claude_block(include_agents_ref=True)
        content = f"# {project_dir.name}\n\n{block}\n"
    else:
        if not path.is_file():
            raise click.ClickException(f"{path} exists but is not a file.")
        existing = _read_existing_text(path)
        outside_managed_block = _content_without_managed_block(
            existing,
            path=path,
            start_marker=_CLAUDE_BLOCK_START,
            end_marker=_CLAUDE_BLOCK_END,
        )
        block = _claude_block(include_agents_ref="@AGENTS.md" not in outside_managed_block)
        content = f"# {project_dir.name}\n\n{block}\n"

    _apply_managed_block(
        path,
        new_file_content=content,
        block=block,
        start_marker=_CLAUDE_BLOCK_START,
        end_marker=_CLAUDE_BLOCK_END,
        assume_yes=assume_yes,
        no_append=no_append,
        append_prompt="CLAUDE.md exists without an areg-managed Claude skills block. Add one?",
        update_prompt="CLAUDE.md has an existing areg-managed Claude skills block. Replace it?",
    )


def _ensure_settings(project_dir: Path) -> None:
    claude_dir = project_dir / ".claude"
    if claude_dir.exists() and not claude_dir.is_dir():
        raise click.ClickException(f"{claude_dir} exists but is not a directory.")
    try:
        claude_dir.mkdir(exist_ok=True)
    except OSError as e:
        raise click.ClickException(f"Failed to create {claude_dir}: {e}") from e

    settings_path = claude_dir / "settings.local.json"
    if settings_path.exists():
        if not settings_path.is_file():
            raise click.ClickException(f"{settings_path} exists but is not a file.")
        return

    _write_text(settings_path, _read_template("settings.local.json"), settings_path.name)


@click.command("init")
@click.argument("target", required=False, default=".", type=click.Path())
@click.option(
    "--agent",
    "agents",
    multiple=True,
    default=_DEFAULT_AGENTS,
    help="Agents to install skills for (repeatable).",
)
@click.option(
    "--yes",
    "assume_yes",
    is_flag=True,
    help="Approve adding or updating areg-managed instruction blocks without prompting.",
)
@click.option(
    "--no-append",
    is_flag=True,
    help="Do not modify existing AGENTS.md or CLAUDE.md prose files.",
)
@click.pass_obj
def init_project_cmd(
    ctx: AregContext,
    target: str,
    agents: tuple[str, ...],
    assume_yes: bool,
    no_append: bool,
) -> None:
    """Initialize an existing Git project for areg skill workflows."""

    if assume_yes and no_append:
        raise click.UsageError("--yes and --no-append cannot be used together.")

    requires_npx()
    project_dir = _resolve_target_dir(target)
    _require_git_root(project_dir)

    click.echo("Installing bootstrap skills via npx skills add...")
    try:
        ctx.npx_skills.add(
            _BOOTSTRAP_REPO,
            skills=list(_BOOTSTRAP_SKILLS),
            agents=list(agents),
            cwd=project_dir,
        )
    except NpxSkillsError as e:
        raise click.ClickException(f"npx skills add failed: {e}") from e

    _write_text(
        project_dir / "areg.json",
        json.dumps({"agents": list(agents)}, indent=2) + "\n",
        "areg.json",
    )
    _ensure_agents_md(project_dir, assume_yes=assume_yes, no_append=no_append)
    _ensure_claude_md(project_dir, assume_yes=assume_yes, no_append=no_append)
    _ensure_settings(project_dir)

    click.echo(f"\nInitialized areg in {project_dir}")
    click.echo("Bootstrap skills installed: skill-management, skillx")
    click.echo("Review and commit generated files when ready.")
    click.echo("Install more persistent skills with `npx skills add ...`.")
