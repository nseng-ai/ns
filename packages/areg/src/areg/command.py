from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click

from areg.context import AregContext
from areg.file_plan import (
    DeleteFilePlan,
    RemoveEmptyDirPlan,
    SkippedTextWrite,
    TextFilePlan,
    TextWritePlan,
    apply_delete_file,
    apply_remove_empty_dir,
    apply_text_file_plan,
    read_existing_text,
    reject_symlink,
)
from areg.gateways.environment.gateway import GitRootDiscoveryError
from areg.invoke_only import (
    CODEX_OPENAI_POLICY,
    DISABLE_MODEL_INVOCATION_KEY,
    InvokeOnlyStatus,
    openai_policy_path,
    read_invoke_only_state,
    skill_dir,
    skill_md_path,
)

_FLAG_LINE_PREFIX = f"{DISABLE_MODEL_INVOCATION_KEY}:"

_STATUS_LABELS: dict[InvokeOnlyStatus, str] = {
    InvokeOnlyStatus.NORMAL: "normal",
    InvokeOnlyStatus.INVOKE_ONLY: "invoke-only",
    InvokeOnlyStatus.FLAG_WITHOUT_SIDECAR: (
        "inconsistent: flag set but agents/openai.yaml missing"
    ),
    InvokeOnlyStatus.SIDECAR_WITHOUT_FLAG: (
        "inconsistent: agents/openai.yaml present but flag unset"
    ),
}


@dataclass(frozen=True)
class CommandEditPlan:
    text_files: tuple[TextFilePlan, ...] = ()
    delete_files: tuple[DeleteFilePlan, ...] = ()
    remove_empty_dirs: tuple[RemoveEmptyDirPlan, ...] = ()


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


def _require_local_skill(project_dir: Path, skill_name: str) -> Path:
    local_dir = skill_dir(project_dir, skill_name)
    skill_md = skill_md_path(project_dir, skill_name)
    agents_skill_dir = project_dir / ".agents" / "skills" / skill_name

    if not local_dir.exists():
        if agents_skill_dir.exists():
            raise click.ClickException(
                f"{skill_name} is not a local skill; refusing to edit {agents_skill_dir}."
            )
        raise click.ClickException(f"Local skill {skill_name} not found at {skill_md}.")
    if local_dir.is_symlink():
        raise click.ClickException(
            f"Local skill directory {local_dir} is a symlink; refusing to edit it."
        )
    if not local_dir.is_dir():
        raise click.ClickException(f"Local skill path {local_dir} exists but is not a directory.")
    if not skill_md.exists():
        raise click.ClickException(f"Local skill {skill_name} not found at {skill_md}.")
    if not skill_md.is_file():
        raise click.ClickException(f"Local skill SKILL.md at {skill_md} is not a file.")
    reject_symlink(skill_md, description="SKILL.md")
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
        if _is_top_level_key(lines[index], _FLAG_LINE_PREFIX):
            flag_indices.append(index)

    if name_index is None:
        raise click.ClickException(f"{path} has malformed frontmatter: missing name field.")

    if flag_indices:
        first_flag_index = flag_indices[0]
        lines[first_flag_index] = f"{_FLAG_LINE_PREFIX} true{newline}"
        for index in reversed(flag_indices[1:]):
            del lines[index]
        return "".join(lines)

    lines.insert(name_index + 1, f"{_FLAG_LINE_PREFIX} true{newline}")
    return "".join(lines)


def _remove_disable_model_invocation(content: str, *, path: Path) -> str:
    lines = content.splitlines(keepends=True)
    end_index = _frontmatter_end_index(lines, path=path)
    lines_to_keep: list[str] = []
    for index, line in enumerate(lines):
        if 1 <= index < end_index and _is_top_level_key(line, _FLAG_LINE_PREFIX):
            continue
        lines_to_keep.append(line)
    return "".join(lines_to_keep)


def _plan_skill_md_update(
    skill_md: Path,
    *,
    convert: bool,
) -> TextFilePlan:
    content = read_existing_text(skill_md)
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
        reject_symlink(sidecar, description="Codex openai.yaml")
        current = read_existing_text(sidecar)
        if current == CODEX_OPENAI_POLICY:
            return SkippedTextWrite(path=sidecar, reason="Codex openai.yaml already current")
    return TextWritePlan(
        path=sidecar,
        content=CODEX_OPENAI_POLICY,
        description="Codex openai.yaml",
        create_parent=True,
    )


def _build_convert_plan(project_dir: Path, skill_name: str) -> CommandEditPlan:
    skill_md = _require_local_skill(project_dir, skill_name)
    sidecar = openai_policy_path(project_dir, skill_name)
    return CommandEditPlan(
        text_files=(
            _plan_skill_md_update(skill_md, convert=True),
            _plan_sidecar_write(sidecar),
        )
    )


def _build_revert_plan(project_dir: Path, skill_name: str) -> CommandEditPlan:
    skill_md = _require_local_skill(project_dir, skill_name)
    sidecar = openai_policy_path(project_dir, skill_name)
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
            apply_text_file_plan(text_file, project_dir=project_dir)

    for delete_file in plan.delete_files:
        action = "Would delete" if dry_run else "Deleted"
        click.echo(f"{action} {delete_file.path}")
        if not dry_run:
            apply_delete_file(delete_file, project_dir=project_dir)

    for remove_empty_dir in plan.remove_empty_dirs:
        if dry_run:
            click.echo(f"Would remove {remove_empty_dir.path} if empty")
        else:
            before_exists = remove_empty_dir.path.exists()
            apply_remove_empty_dir(remove_empty_dir, project_dir=project_dir)
            if before_exists and not remove_empty_dir.path.exists():
                click.echo(f"Removed {remove_empty_dir.path}")


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
        state = read_invoke_only_state(project_dir, skill_name)
        click.echo(f"{skill_name}\t{_STATUS_LABELS[state.status]}")
