from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click

from areg.context import AregContext
from areg.gateways.environment.gateway import GitRootDiscoveryError
from areg.init_project import (
    SkippedTextWrite,
    TextFilePlan,
    TextWritePlan,
    _apply_text_file_plan,
    _read_existing_text,
    _reject_symlink,
)

# Claude Code and Pi drop skills with disable-model-invocation from ambient context.
# Codex only honors the sidecar as explicit-only; it still pays ambient context cost.
_CODEX_OPENAI_POLICY = "policy:\n  allow_implicit_invocation: false\n"
_DISABLE_MODEL_INVOCATION_KEY = "disable-model-invocation:"


@dataclass(frozen=True)
class DeleteFilePlan:
    path: Path
    description: str


@dataclass(frozen=True)
class RemoveEmptyDirPlan:
    path: Path
    description: str


@dataclass(frozen=True)
class CommandEditPlan:
    text_files: tuple[TextFilePlan, ...] = ()
    delete_files: tuple[DeleteFilePlan, ...] = ()
    remove_empty_dirs: tuple[RemoveEmptyDirPlan, ...] = ()


@dataclass(frozen=True)
class InvokeOnlyState:
    flag_enabled: bool
    sidecar_exists: bool

    @property
    def status(self) -> str:
        if self.flag_enabled and self.sidecar_exists:
            return "invoke-only"
        if self.flag_enabled:
            return "inconsistent: flag set but agents/openai.yaml missing"
        if self.sidecar_exists:
            return "inconsistent: agents/openai.yaml present but flag unset"
        return "normal"


def _resolve_git_root(ctx: AregContext, path: str) -> Path:
    target = Path(path)
    if not target.exists():
        raise click.ClickException(f"Path {target} does not exist.")
    target_dir = target.resolve()
    if not target_dir.is_dir():
        raise click.ClickException(f"Path {target_dir} is not a directory.")
    try:
        return ctx.environment.require_git_root(target_dir)
    except GitRootDiscoveryError as e:
        raise click.ClickException(str(e)) from e


def _skill_dir(project_dir: Path, skill_name: str) -> Path:
    return project_dir / "skills" / skill_name


def _skill_md_path(project_dir: Path, skill_name: str) -> Path:
    return _skill_dir(project_dir, skill_name) / "SKILL.md"


def _openai_policy_path(project_dir: Path, skill_name: str) -> Path:
    return _skill_dir(project_dir, skill_name) / "agents" / "openai.yaml"


def _require_local_skill(project_dir: Path, skill_name: str) -> Path:
    skill_dir = _skill_dir(project_dir, skill_name)
    skill_md = skill_dir / "SKILL.md"
    agents_skill_dir = project_dir / ".agents" / "skills" / skill_name

    if not skill_dir.exists():
        if agents_skill_dir.exists():
            raise click.ClickException(
                f"{skill_name} is not a local skill; refusing to edit {agents_skill_dir}."
            )
        raise click.ClickException(f"Local skill {skill_name} not found at {skill_md}.")
    if skill_dir.is_symlink():
        raise click.ClickException(
            f"Local skill directory {skill_dir} is a symlink; refusing to edit it."
        )
    if not skill_dir.is_dir():
        raise click.ClickException(f"Local skill path {skill_dir} exists but is not a directory.")
    if not skill_md.exists():
        raise click.ClickException(f"Local skill {skill_name} not found at {skill_md}.")
    if not skill_md.is_file():
        raise click.ClickException(f"Local skill SKILL.md at {skill_md} is not a file.")
    _reject_symlink(skill_md, description="SKILL.md")
    return skill_md


def _frontmatter_end_index(lines: list[str], *, path: Path) -> int:
    if not lines or lines[0].rstrip("\r\n") != "---":
        raise click.ClickException(f"{path} has malformed frontmatter: missing opening delimiter.")
    for index in range(1, len(lines)):
        if lines[index].rstrip("\r\n") == "---":
            return index
    raise click.ClickException(f"{path} has malformed frontmatter: missing closing delimiter.")


def _line_ending(line: str) -> str:
    if line.endswith("\r\n"):
        return "\r\n"
    return "\n"


def _is_top_level_key(line: str, key: str) -> bool:
    return line.startswith(key)


def _set_disable_model_invocation(content: str, *, path: Path) -> str:
    lines = content.splitlines(keepends=True)
    end_index = _frontmatter_end_index(lines, path=path)
    newline = _line_ending(lines[0])

    name_index: int | None = None
    flag_indices: list[int] = []
    for index in range(1, end_index):
        if _is_top_level_key(lines[index], "name:"):
            name_index = index
        if _is_top_level_key(lines[index], _DISABLE_MODEL_INVOCATION_KEY):
            flag_indices.append(index)

    if name_index is None:
        raise click.ClickException(f"{path} has malformed frontmatter: missing name field.")

    if flag_indices:
        first_flag_index = flag_indices[0]
        lines[first_flag_index] = f"{_DISABLE_MODEL_INVOCATION_KEY} true{newline}"
        for index in reversed(flag_indices[1:]):
            del lines[index]
        return "".join(lines)

    lines.insert(name_index + 1, f"{_DISABLE_MODEL_INVOCATION_KEY} true{newline}")
    return "".join(lines)


def _remove_disable_model_invocation(content: str, *, path: Path) -> str:
    lines = content.splitlines(keepends=True)
    end_index = _frontmatter_end_index(lines, path=path)
    lines_to_keep: list[str] = []
    for index, line in enumerate(lines):
        if 1 <= index < end_index and _is_top_level_key(line, _DISABLE_MODEL_INVOCATION_KEY):
            continue
        lines_to_keep.append(line)
    return "".join(lines_to_keep)


def _has_disable_model_invocation(content: str, *, path: Path) -> bool:
    lines = content.splitlines(keepends=True)
    end_index = _frontmatter_end_index(lines, path=path)
    for index in range(1, end_index):
        line = lines[index]
        if _is_top_level_key(line, _DISABLE_MODEL_INVOCATION_KEY):
            return line[len(_DISABLE_MODEL_INVOCATION_KEY) :].strip().lower() == "true"
    return False


def _plan_skill_md_update(
    skill_md: Path,
    *,
    convert: bool,
) -> TextFilePlan:
    content = _read_existing_text(skill_md)
    new_content = (
        _set_disable_model_invocation(content, path=skill_md)
        if convert
        else _remove_disable_model_invocation(content, path=skill_md)
    )
    if new_content == content:
        reason = (
            "disable-model-invocation already set" if convert else "disable-model-invocation absent"
        )
        return SkippedTextWrite(path=skill_md, reason=reason)
    return TextWritePlan(path=skill_md, content=new_content, description="SKILL.md")


def _plan_sidecar_write(sidecar: Path) -> TextFilePlan:
    if sidecar.exists():
        if not sidecar.is_file():
            raise click.ClickException(f"{sidecar} exists but is not a file.")
        _reject_symlink(sidecar, description="Codex openai.yaml")
        current = _read_existing_text(sidecar)
        if current == _CODEX_OPENAI_POLICY:
            return SkippedTextWrite(path=sidecar, reason="Codex openai.yaml already current")
    return TextWritePlan(
        path=sidecar,
        content=_CODEX_OPENAI_POLICY,
        description="Codex openai.yaml",
        create_parent=True,
    )


def _build_convert_plan(project_dir: Path, skill_name: str) -> CommandEditPlan:
    skill_md = _require_local_skill(project_dir, skill_name)
    sidecar = _openai_policy_path(project_dir, skill_name)
    return CommandEditPlan(
        text_files=(
            _plan_skill_md_update(skill_md, convert=True),
            _plan_sidecar_write(sidecar),
        )
    )


def _build_revert_plan(project_dir: Path, skill_name: str) -> CommandEditPlan:
    skill_md = _require_local_skill(project_dir, skill_name)
    sidecar = _openai_policy_path(project_dir, skill_name)
    delete_files: tuple[DeleteFilePlan, ...] = ()
    if sidecar.exists() or sidecar.is_symlink():
        delete_files = (DeleteFilePlan(path=sidecar, description="Codex openai.yaml"),)
    remove_empty_dirs: tuple[RemoveEmptyDirPlan, ...] = ()
    if sidecar.parent.exists():
        remove_empty_dirs = (
            RemoveEmptyDirPlan(path=sidecar.parent, description="empty skill agents directory"),
        )
    return CommandEditPlan(
        text_files=(_plan_skill_md_update(skill_md, convert=False),),
        delete_files=delete_files,
        remove_empty_dirs=remove_empty_dirs,
    )


def _validate_delete_file(plan: DeleteFilePlan, *, project_dir: Path) -> None:
    _reject_symlink(plan.path, description=plan.description)
    if not plan.path.exists():
        return
    if not plan.path.is_file():
        raise click.ClickException(f"{plan.path} exists but is not a file.")
    resolved = plan.path.resolve()
    if not (resolved == project_dir or resolved.is_relative_to(project_dir)):
        raise click.ClickException(
            f"{plan.path} resolves outside {project_dir}; refusing to delete it."
        )


def _apply_delete_file(plan: DeleteFilePlan, *, project_dir: Path) -> None:
    _validate_delete_file(plan, project_dir=project_dir)
    if not plan.path.exists():
        return
    try:
        plan.path.unlink()
    except OSError as e:
        raise click.ClickException(
            f"Failed to delete {plan.description} at {plan.path}: {e}"
        ) from e


def _apply_remove_empty_dir(plan: RemoveEmptyDirPlan, *, project_dir: Path) -> None:
    if not plan.path.exists():
        return
    _reject_symlink(plan.path, description=plan.description)
    if not plan.path.is_dir():
        raise click.ClickException(f"{plan.path} exists but is not a directory.")
    resolved = plan.path.resolve()
    if not (resolved == project_dir or resolved.is_relative_to(project_dir)):
        raise click.ClickException(
            f"{plan.path} resolves outside {project_dir}; refusing to remove it."
        )
    if any(plan.path.iterdir()):
        return
    try:
        plan.path.rmdir()
    except OSError as e:
        raise click.ClickException(
            f"Failed to remove {plan.description} at {plan.path}: {e}"
        ) from e


def _echo_text_plan(plan: TextFilePlan, *, dry_run: bool) -> None:
    prefix = "Would skip" if dry_run else "Skipped"
    if isinstance(plan, SkippedTextWrite):
        click.echo(f"{prefix} {plan.path}: {plan.reason}")
        return
    action = "Would write" if dry_run else "Wrote"
    click.echo(f"{action} {plan.path}")


def _apply_command_plan(plan: CommandEditPlan, *, project_dir: Path, dry_run: bool) -> None:
    for text_file in plan.text_files:
        _echo_text_plan(text_file, dry_run=dry_run)
        if not dry_run:
            _apply_text_file_plan(text_file, project_dir=project_dir)

    for delete_file in plan.delete_files:
        action = "Would delete" if dry_run else "Deleted"
        click.echo(f"{action} {delete_file.path}")
        if not dry_run:
            _apply_delete_file(delete_file, project_dir=project_dir)

    for remove_empty_dir in plan.remove_empty_dirs:
        if dry_run:
            click.echo(f"Would remove {remove_empty_dir.path} if empty")
        else:
            before_exists = remove_empty_dir.path.exists()
            _apply_remove_empty_dir(remove_empty_dir, project_dir=project_dir)
            if before_exists and not remove_empty_dir.path.exists():
                click.echo(f"Removed {remove_empty_dir.path}")


def _read_invoke_only_state(skill_md: Path, sidecar: Path) -> InvokeOnlyState:
    flag_enabled = False
    try:
        flag_enabled = _has_disable_model_invocation(_read_existing_text(skill_md), path=skill_md)
    except click.ClickException:
        flag_enabled = False
    return InvokeOnlyState(flag_enabled=flag_enabled, sidecar_exists=sidecar.is_file())


@click.group("command")
def command_group() -> None:
    """Convert skills to invoke-only commands (human-invocable, zero model-context cost)."""


@command_group.command("convert")
@click.option(
    "--path",
    default=".",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    help="Project directory or subdirectory (default: current directory).",
)
@click.option("--dry-run", is_flag=True, help="Show planned edits without writing files.")
@click.argument("skills", nargs=-1, required=True)
@click.pass_obj
def convert_cmd(ctx: AregContext, path: str, dry_run: bool, skills: tuple[str, ...]) -> None:
    """Convert local skills to invoke-only commands."""
    project_dir = _resolve_git_root(ctx, path)
    for skill_name in skills:
        click.echo(f"Converting {skill_name}...")
        _apply_command_plan(
            _build_convert_plan(project_dir, skill_name), project_dir=project_dir, dry_run=dry_run
        )


@command_group.command("revert")
@click.option(
    "--path",
    default=".",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    help="Project directory or subdirectory (default: current directory).",
)
@click.option("--dry-run", is_flag=True, help="Show planned edits without writing files.")
@click.argument("skills", nargs=-1, required=True)
@click.pass_obj
def revert_cmd(ctx: AregContext, path: str, dry_run: bool, skills: tuple[str, ...]) -> None:
    """Revert local skills from invoke-only commands to normal skills."""
    project_dir = _resolve_git_root(ctx, path)
    for skill_name in skills:
        click.echo(f"Reverting {skill_name}...")
        _apply_command_plan(
            _build_revert_plan(project_dir, skill_name), project_dir=project_dir, dry_run=dry_run
        )


@command_group.command("list")
@click.option(
    "--path",
    default=".",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    help="Project directory or subdirectory (default: current directory).",
)
@click.pass_obj
def list_cmd(ctx: AregContext, path: str) -> None:
    """List local skill invoke-only status."""
    project_dir = _resolve_git_root(ctx, path)
    skills_dir = project_dir / "skills"
    if not skills_dir.is_dir():
        click.echo("No local skills found.")
        return

    skill_mds = sorted(skills_dir.glob("*/SKILL.md"), key=lambda candidate: candidate.parent.name)
    if not skill_mds:
        click.echo("No local skills found.")
        return

    for skill_md in skill_mds:
        skill_name = skill_md.parent.name
        state = _read_invoke_only_state(skill_md, _openai_policy_path(project_dir, skill_name))
        click.echo(f"{skill_name}\t{state.status}")
