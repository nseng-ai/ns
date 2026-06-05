from __future__ import annotations

import importlib.resources
import json
from dataclasses import dataclass
from pathlib import Path

import click

from areg.context import AregContext
from areg.gateways.environment.gateway import AregEnvironment, GitRootDiscoveryError
from areg.gateways.npx_skills.gateway import NpxSkillsError
from areg.preconditions import requires_npx
from areg.project_agents import resolve_project_agents
from asdl_core.project_config import (
    ASDL_CONFIG_FILENAME,
    AsdlProjectConfigError,
    parse_asdl_project_config,
)

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


@dataclass(frozen=True)
class TextWritePlan:
    path: Path
    content: str
    description: str
    create_parent: bool = False


@dataclass(frozen=True)
class SkippedTextWrite:
    path: Path
    reason: str


TextFilePlan = TextWritePlan | SkippedTextWrite


@dataclass(frozen=True)
class InitPlan:
    text_files: tuple[TextFilePlan, ...]


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


def _require_git_root(environment: AregEnvironment, target_dir: Path) -> None:
    try:
        root = environment.require_git_root(target_dir)
    except GitRootDiscoveryError as e:
        raise click.ClickException(str(e)) from e

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


def _reject_symlink(path: Path, *, description: str) -> None:
    if path.is_symlink():
        raise click.ClickException(f"{description} at {path} is a symlink; refusing to manage it.")


def _is_under_project(path: Path, *, project_dir: Path) -> bool:
    return path == project_dir or path.is_relative_to(project_dir)


def _require_existing_path_under_project(
    path: Path,
    *,
    project_dir: Path,
    description: str,
) -> None:
    if not path.exists():
        raise click.ClickException(f"{description} at {path} does not exist.")
    resolved = path.resolve()
    if not _is_under_project(resolved, project_dir=project_dir):
        raise click.ClickException(
            f"{description} at {path} resolves outside {project_dir}; refusing to manage it."
        )


def _validate_existing_parent(path: Path, *, project_dir: Path) -> None:
    _reject_symlink(path, description="Parent directory")
    if not path.is_dir():
        raise click.ClickException(f"{path} exists but is not a directory.")
    _require_existing_path_under_project(
        path,
        project_dir=project_dir,
        description="Parent directory",
    )


def _validate_parent_chain(path: Path, *, project_dir: Path) -> None:
    current = path.parent
    while not current.exists() and current != project_dir:
        current = current.parent

    _validate_existing_parent(current, project_dir=project_dir)


def _validate_text_write_target(plan: TextWritePlan, *, project_dir: Path) -> None:
    if plan.path.exists():
        _reject_symlink(plan.path, description=plan.description)
        if not plan.path.is_file():
            raise click.ClickException(f"{plan.path} exists but is not a file.")
        _require_existing_path_under_project(
            plan.path,
            project_dir=project_dir,
            description=plan.description,
        )
        return

    _reject_symlink(plan.path, description=plan.description)
    _validate_parent_chain(plan.path, project_dir=project_dir)


def _apply_text_file_plan(plan: TextFilePlan, *, project_dir: Path) -> None:
    if isinstance(plan, SkippedTextWrite):
        return

    _validate_text_write_target(plan, project_dir=project_dir)
    if plan.create_parent:
        try:
            plan.path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise click.ClickException(f"Failed to create {plan.path.parent}: {e}") from e
        _validate_text_write_target(plan, project_dir=project_dir)
    _write_text(plan.path, plan.content, plan.description)


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


def _plan_managed_block(
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
) -> TextFilePlan:
    if path.is_symlink():
        _reject_symlink(path, description=path.name)

    if not path.exists():
        return TextWritePlan(path=path, content=new_file_content, description=path.name)

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
            return SkippedTextWrite(
                path=path,
                reason="--no-append skips existing file without managed block",
            )
        if not assume_yes and not click.confirm(append_prompt, default=False):
            return SkippedTextWrite(path=path, reason="user declined adding managed block")
        return TextWritePlan(
            path=path, content=_append_block(content, block), description=path.name
        )

    start, end = bounds
    current_block = content[start:end]
    if current_block == block:
        return SkippedTextWrite(path=path, reason="managed block is already current")
    if no_append:
        return SkippedTextWrite(
            path=path,
            reason="--no-append skips existing managed block replacement",
        )
    if not assume_yes and not click.confirm(update_prompt, default=False):
        return SkippedTextWrite(path=path, reason="user declined replacing managed block")
    return TextWritePlan(
        path=path, content=content[:start] + block + content[end:], description=path.name
    )


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


def _plan_agents_md(
    project_dir: Path,
    *,
    assume_yes: bool,
    no_append: bool,
) -> TextFilePlan:
    return _plan_managed_block(
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


def _plan_claude_md(
    project_dir: Path,
    *,
    assume_yes: bool,
    no_append: bool,
) -> TextFilePlan:
    path = project_dir / "CLAUDE.md"
    include_agents_ref = True
    if path.is_symlink():
        _reject_symlink(path, description=path.name)
    if path.exists():
        if not path.is_file():
            raise click.ClickException(f"{path} exists but is not a file.")
        existing = _read_existing_text(path)
        outside_managed_block = _content_without_managed_block(
            existing,
            path=path,
            start_marker=_CLAUDE_BLOCK_START,
            end_marker=_CLAUDE_BLOCK_END,
        )
        include_agents_ref = "@AGENTS.md" not in outside_managed_block

    block = _claude_block(include_agents_ref=include_agents_ref)
    return _plan_managed_block(
        path,
        new_file_content=f"# {project_dir.name}\n\n{block}\n",
        block=block,
        start_marker=_CLAUDE_BLOCK_START,
        end_marker=_CLAUDE_BLOCK_END,
        assume_yes=assume_yes,
        no_append=no_append,
        append_prompt="CLAUDE.md exists without an areg-managed Claude skills block. Add one?",
        update_prompt="CLAUDE.md has an existing areg-managed Claude skills block. Replace it?",
    )


def _plan_asdl_toml(project_dir: Path, *, agents: tuple[str, ...]) -> TextWritePlan:
    path = project_dir / ASDL_CONFIG_FILENAME
    if path.is_symlink():
        _reject_symlink(path, description=ASDL_CONFIG_FILENAME)

    if not path.exists():
        return TextWritePlan(
            path=path,
            content=_render_areg_section(agents),
            description=ASDL_CONFIG_FILENAME,
        )

    if not path.is_file():
        raise click.ClickException(f"{path} exists but is not a file.")

    content = _read_existing_text(path)
    try:
        parse_asdl_project_config(content, path=path)
    except AsdlProjectConfigError as exc:
        raise click.ClickException(str(exc)) from exc

    return TextWritePlan(
        path=path,
        content=_replace_or_append_areg_section(content, agents=agents),
        description=ASDL_CONFIG_FILENAME,
    )


def _render_areg_section(agents: tuple[str, ...]) -> str:
    return "[areg]\n" + f"agents = {json.dumps(list(agents))}\n"


def _replace_or_append_areg_section(content: str, *, agents: tuple[str, ...]) -> str:
    lines = content.splitlines(keepends=True)
    start = _areg_section_start(lines)
    if start is None:
        return _append_toml_section(content, _render_areg_section(agents))

    end = _toml_section_end(lines, start=start)
    replacement = _render_areg_section(agents)
    if end < len(lines):
        replacement += "\n"
    lines[start:end] = replacement.splitlines(keepends=True)
    return "".join(lines)


def _append_toml_section(content: str, section: str) -> str:
    if not content:
        return section
    if content.endswith("\n\n"):
        return content + section
    if content.endswith("\n"):
        return content + "\n" + section
    return content + "\n\n" + section


def _areg_section_start(lines: list[str]) -> int | None:
    for index, line in enumerate(lines):
        if _toml_table_name(line) == "areg":
            return index
    return None


def _toml_section_end(lines: list[str], *, start: int) -> int:
    for index in range(start + 1, len(lines)):
        if _toml_table_name(lines[index]) is not None:
            return index
    return len(lines)


def _toml_table_name(line: str) -> str | None:
    stripped = line.strip()
    if stripped.startswith("[["):
        closing_index = stripped.find("]]", 2)
        if closing_index < 0:
            return None
        return stripped[2:closing_index].strip()
    if not stripped.startswith("["):
        return None
    closing_index = stripped.find("]")
    if closing_index < 0:
        return None
    return stripped[1:closing_index].strip()


def _plan_settings(project_dir: Path) -> TextFilePlan:
    claude_dir = project_dir / ".claude"
    if claude_dir.is_symlink():
        _reject_symlink(claude_dir, description=".claude")
    if claude_dir.exists() and not claude_dir.is_dir():
        raise click.ClickException(f"{claude_dir} exists but is not a directory.")

    settings_path = claude_dir / "settings.local.json"
    if settings_path.is_symlink():
        _reject_symlink(settings_path, description=settings_path.name)
    if settings_path.exists():
        if not settings_path.is_file():
            raise click.ClickException(f"{settings_path} exists but is not a file.")
        return SkippedTextWrite(path=settings_path, reason="existing settings file is preserved")

    return TextWritePlan(
        path=settings_path,
        content=_read_template("settings.local.json"),
        description=settings_path.name,
        create_parent=True,
    )


def _build_init_plan(
    project_dir: Path,
    *,
    agents: tuple[str, ...],
    assume_yes: bool,
    no_append: bool,
) -> InitPlan:
    text_files: list[TextFilePlan] = [
        _plan_asdl_toml(project_dir, agents=agents),
        _plan_agents_md(project_dir, assume_yes=assume_yes, no_append=no_append),
        _plan_claude_md(project_dir, assume_yes=assume_yes, no_append=no_append),
        _plan_settings(project_dir),
    ]
    return InitPlan(text_files=tuple(text_files))


@click.command("init")
@click.argument("target", required=False, default=".", type=click.Path())
@click.option(
    "--agent",
    "agents",
    multiple=True,
    default=(),
    help=(
        "Agents to install skills for (repeatable). Default: read asdl.toml [areg].agents, "
        "else legacy areg.json, else 'codex claude-code'."
    ),
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

    requires_npx(ctx.environment)
    project_dir = _resolve_target_dir(target)
    _require_git_root(ctx.environment, project_dir)
    resolved_agents = resolve_project_agents(project_dir, agents)
    init_plan = _build_init_plan(
        project_dir,
        agents=resolved_agents,
        assume_yes=assume_yes,
        no_append=no_append,
    )

    click.echo("Installing bootstrap skills via npx skills add...")
    try:
        ctx.npx_skills.add(
            _BOOTSTRAP_REPO,
            skills=list(_BOOTSTRAP_SKILLS),
            agents=list(resolved_agents),
            cwd=project_dir,
        )
    except NpxSkillsError as e:
        raise click.ClickException(f"npx skills add failed: {e}") from e

    for text_file in init_plan.text_files:
        _apply_text_file_plan(text_file, project_dir=project_dir)

    click.echo(f"\nInitialized areg in {project_dir}")
    click.echo("Bootstrap skills installed: skill-management, skillx")
    click.echo("Review and commit generated files when ready.")
    click.echo("Install more persistent skills with `npx skills add ...`.")
