from __future__ import annotations

from pathlib import Path

import click

from areg.command_conversion import PiReplacementVerification
from areg.context import AregContext
from areg.file_plan import (
    RemoveEmptyDirPlan,
    SkippedTextWrite,
    TextFilePlan,
    apply_delete_file,
    apply_remove_empty_dir,
    apply_text_file_plan,
    reject_symlink,
)
from areg.gateways.environment.gateway import GitRootDiscoveryError
from areg.skill_profile import (
    InferredSkillProfile,
    SkillProfile,
    SkillProfileEditPlan,
    SkillProfileStatus,
    build_skill_profile_plan,
    read_skill_profile_status,
)


def _replacement_status_label(replacement: PiReplacementVerification | None) -> str:
    if replacement is None:
        return "replacement-missing"
    if replacement.verified:
        if replacement.surface:
            return f"replacement-verified:{replacement.surface}"
        return "replacement-verified"
    if replacement.surface:
        return f"replacement-missing:{replacement.surface}"
    return "replacement-missing"


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
    local_dir = project_dir / "skills" / skill_name
    skill_md = local_dir / "SKILL.md"
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


def _is_path_like_skill_spec(skill_spec: str) -> bool:
    candidate = Path(skill_spec)
    has_separator = "/" in skill_spec or "\\" in skill_spec
    return candidate.is_absolute() or has_separator or skill_spec.endswith("SKILL.md")


def _path_like_skill_spec_path(project_dir: Path, skill_spec: str) -> Path:
    candidate = Path(skill_spec)
    if candidate.is_absolute():
        if candidate.exists():
            return candidate
        raise click.ClickException(f"Skill path {skill_spec} does not exist.")

    cwd_candidate = Path.cwd() / candidate
    if cwd_candidate.exists():
        return cwd_candidate

    project_candidate = project_dir / candidate
    if project_candidate.exists():
        return project_candidate

    raise click.ClickException(
        f"Skill path {skill_spec} does not exist relative to the current directory "
        f"or project {project_dir}."
    )


def _canonical_source_skill_name(project_dir: Path, skill_spec: str, spec_path: Path) -> str | None:
    skills_root = project_dir / "skills"
    if not spec_path.is_relative_to(skills_root):
        return None

    local_relative = spec_path.relative_to(skills_root)
    if len(local_relative.parts) == 1:
        skill_name = local_relative.parts[0]
    elif len(local_relative.parts) == 2 and local_relative.parts[1] == "SKILL.md":
        skill_name = local_relative.parts[0]
    else:
        raise click.ClickException(
            f"Skill path {skill_spec} must be a local skill directory or SKILL.md file."
        )

    _require_local_skill(project_dir, skill_name)
    return skill_name


def _canonical_local_skill_name(project_dir: Path, skill_spec: str) -> str:
    if not _is_path_like_skill_spec(skill_spec):
        _require_local_skill(project_dir, skill_spec)
        return skill_spec

    spec_path = _path_like_skill_spec_path(project_dir, skill_spec)
    source_skill_name = _canonical_source_skill_name(project_dir, skill_spec, spec_path)
    if source_skill_name is not None:
        return source_skill_name

    resolved_path = spec_path.resolve()
    if resolved_path.is_file() and resolved_path.name == "SKILL.md":
        resolved_skill_dir = resolved_path.parent
    elif resolved_path.is_dir():
        resolved_skill_dir = resolved_path
    else:
        raise click.ClickException(
            f"Skill path {skill_spec} must be a local skill directory or SKILL.md file."
        )

    skills_root = project_dir / "skills"
    if not skills_root.exists():
        raise click.ClickException(
            f"Skill path {skill_spec} does not resolve to a local skill under skills/<name>; "
            "refusing to edit it."
        )
    resolved_skills_root = skills_root.resolve()
    if not resolved_skill_dir.is_relative_to(resolved_skills_root):
        raise click.ClickException(
            f"Skill path {skill_spec} does not resolve to a local skill under skills/<name>; "
            "refusing to edit it."
        )

    local_relative = resolved_skill_dir.relative_to(resolved_skills_root)
    if len(local_relative.parts) != 1:
        raise click.ClickException(
            f"Skill path {skill_spec} does not resolve to a local skill under skills/<name>; "
            "refusing to edit it."
        )

    skill_name = local_relative.parts[0]
    _require_local_skill(project_dir, skill_name)
    return skill_name


def _build_profile_plan(
    project_dir: Path,
    skill_name: str,
    profile: SkillProfile,
) -> SkillProfileEditPlan:
    skill_md = _require_local_skill(project_dir, skill_name)
    return build_skill_profile_plan(project_dir, skill_name, skill_md, profile=profile)


def _echo_text_plan(plan: TextFilePlan, *, dry_run: bool) -> None:
    prefix = "Would skip" if dry_run else "Skipped"
    if isinstance(plan, SkippedTextWrite):
        click.echo(f"{prefix} {plan.path}: {plan.reason}")
        return
    action = "Would write" if dry_run else "Wrote"
    click.echo(f"{action} {plan.path}")


def _apply_command_plan(plan: SkillProfileEditPlan, *, project_dir: Path, dry_run: bool) -> None:
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
        _echo_remove_empty_dir(remove_empty_dir, project_dir=project_dir, dry_run=dry_run)


def _echo_remove_empty_dir(
    remove_empty_dir: RemoveEmptyDirPlan,
    *,
    project_dir: Path,
    dry_run: bool,
) -> None:
    if dry_run:
        click.echo(f"Would remove {remove_empty_dir.path} if empty")
        return

    before_exists = remove_empty_dir.path.exists()
    apply_remove_empty_dir(remove_empty_dir, project_dir=project_dir)
    if before_exists and not remove_empty_dir.path.exists():
        click.echo(f"Removed {remove_empty_dir.path}")


def _list_local_skill_mds(project_dir: Path) -> list[Path]:
    skills_dir = project_dir / "skills"
    if not skills_dir.is_dir():
        return []
    return sorted(skills_dir.glob("*/SKILL.md"), key=lambda candidate: candidate.parent.name)


def _profile_choice(raw_profile: str) -> SkillProfile:
    for profile in SkillProfile:
        if profile.value == raw_profile:
            return profile
    raise click.ClickException(f"Unsupported skill profile {raw_profile}.")


def _status_row(status: SkillProfileStatus) -> str:
    notes = "; ".join(status.notes)
    columns = [
        status.skill_name,
        status.profile.value,
        f"model-invocation:{status.model_invocation}",
        f"native-direct:{status.native_direct}",
        f"pi-extension:{status.pi_extension}",
    ]
    if notes:
        columns.append(notes)
    return "\t".join(columns)


def _legacy_profile_label(status: SkillProfileStatus) -> str:
    if status.profile is not InferredSkillProfile.INCONSISTENT:
        return status.profile.value
    if status.disable_model_invocation and not status.codex_sidecar:
        return "inconsistent: flag set but agents/openai.yaml missing"
    if status.codex_sidecar and not status.disable_model_invocation:
        return "inconsistent: agents/openai.yaml present but flag unset"
    if status.pi_excluded and status.pi_extension == "missing":
        return "inconsistent: Pi exclusion without verified replacement"
    return "inconsistent"


@click.group("command")
def command_group() -> None:
    """Convert local skills into extension-command backing files."""


@command_group.command("convert")
@click.option(
    "--path",
    default=".",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    help="Project directory or subdirectory (default: current directory).",
)
@click.option("--dry-run", is_flag=True, help="Show planned edits without writing files.")
@click.argument("skills", nargs=-1, required=True, metavar="SKILL...")
@click.pass_obj
def convert_cmd(ctx: AregContext, path: str, dry_run: bool, skills: tuple[str, ...]) -> None:
    """Convert local skills to extension-command backing files.

    SKILL may be a local skill name or a path to a local skill directory/SKILL.md.

    Examples:
      areg command convert pr-address
      areg command convert skills/pr-address
      areg command convert skills/pr-address/SKILL.md
      areg command convert .agents/skills/pr-address
    """
    project_dir = _resolve_git_root(ctx, path)
    for skill_spec in skills:
        skill_name = _canonical_local_skill_name(project_dir, skill_spec)
        click.echo(f"Converting {skill_name}...")
        _apply_command_plan(
            _build_profile_plan(project_dir, skill_name, SkillProfile.COMMAND_BACKED),
            project_dir=project_dir,
            dry_run=dry_run,
        )


@command_group.command("revert")
@click.option(
    "--path",
    default=".",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    help="Project directory or subdirectory (default: current directory).",
)
@click.option("--dry-run", is_flag=True, help="Show planned edits without writing files.")
@click.argument("skills", nargs=-1, required=True, metavar="SKILL...")
@click.pass_obj
def revert_cmd(ctx: AregContext, path: str, dry_run: bool, skills: tuple[str, ...]) -> None:
    """Revert local skills from extension-command backing files to normal skills.

    SKILL may be a local skill name or a path to a local skill directory/SKILL.md.
    """
    project_dir = _resolve_git_root(ctx, path)
    for skill_spec in skills:
        skill_name = _canonical_local_skill_name(project_dir, skill_spec)
        click.echo(f"Reverting {skill_name}...")
        _apply_command_plan(
            _build_profile_plan(project_dir, skill_name, SkillProfile.NORMAL),
            project_dir=project_dir,
            dry_run=dry_run,
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
    """List local skill command-conversion status."""
    project_dir = _resolve_git_root(ctx, path)
    skill_mds = _list_local_skill_mds(project_dir)
    if not skill_mds:
        click.echo("No local skills found.")
        return

    for skill_md in skill_mds:
        skill_name = skill_md.parent.name
        status = read_skill_profile_status(project_dir, skill_name, skill_md=skill_md)
        pi_status = "pi-excluded" if status.pi_excluded else "pi-visible"
        replacement_status = _replacement_status_label(status.replacement)
        click.echo(
            f"{skill_name}\t{_legacy_profile_label(status)}\t{pi_status}\t{replacement_status}"
        )


@click.group("skill")
def skill_group() -> None:
    """Manage local skills."""


@skill_group.group("profile")
def profile_group() -> None:
    """Manage local skill invocation profiles."""


@profile_group.command("set")
@click.option(
    "--path",
    default=".",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    help="Project directory or subdirectory (default: current directory).",
)
@click.option("--dry-run", is_flag=True, help="Show planned edits without writing files.")
@click.argument("profile", type=click.Choice([profile.value for profile in SkillProfile]))
@click.argument("skills", nargs=-1, required=True, metavar="SKILL...")
@click.pass_obj
def profile_set_cmd(
    ctx: AregContext,
    path: str,
    dry_run: bool,
    profile: str,
    skills: tuple[str, ...],
) -> None:
    """Set one or more local skills to PROFILE."""
    project_dir = _resolve_git_root(ctx, path)
    selected_profile = _profile_choice(profile)
    for skill_spec in skills:
        skill_name = _canonical_local_skill_name(project_dir, skill_spec)
        click.echo(f"Setting {skill_name} to {selected_profile.value}...")
        _apply_command_plan(
            _build_profile_plan(project_dir, skill_name, selected_profile),
            project_dir=project_dir,
            dry_run=dry_run,
        )


@profile_group.command("list")
@click.option(
    "--path",
    default=".",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    help="Project directory or subdirectory (default: current directory).",
)
@click.pass_obj
def profile_list_cmd(ctx: AregContext, path: str) -> None:
    """List local skill invocation profiles."""
    project_dir = _resolve_git_root(ctx, path)
    skill_mds = _list_local_skill_mds(project_dir)
    if not skill_mds:
        click.echo("No local skills found.")
        return

    for skill_md in skill_mds:
        status = read_skill_profile_status(project_dir, skill_md.parent.name, skill_md=skill_md)
        click.echo(_status_row(status))


@profile_group.command("show")
@click.option(
    "--path",
    default=".",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    help="Project directory or subdirectory (default: current directory).",
)
@click.argument("skill")
@click.pass_obj
def profile_show_cmd(ctx: AregContext, path: str, skill: str) -> None:
    """Show one local skill invocation profile."""
    project_dir = _resolve_git_root(ctx, path)
    skill_name = _canonical_local_skill_name(project_dir, skill)
    skill_md = _require_local_skill(project_dir, skill_name)
    status = read_skill_profile_status(project_dir, skill_name, skill_md=skill_md)

    click.echo(f"Skill: {status.skill_name}")
    click.echo(f"Profile: {status.profile.value}")
    click.echo(f"model-invocation: {status.model_invocation}")
    click.echo(f"native-direct: {status.native_direct}")
    click.echo(f"pi-extension: {status.pi_extension}")
    click.echo("Artifacts:")
    click.echo(
        "- disable-model-invocation: "
        + ("present" if status.disable_model_invocation else "absent")
    )
    click.echo("- agents/openai.yaml: " + ("present" if status.codex_sidecar else "absent"))
    click.echo(
        "- user-invocable:false: " + ("present" if status.user_invocable_false else "absent")
    )
    click.echo("- Pi skill exclusion: " + ("present" if status.pi_excluded else "absent"))
    click.echo(f"- Pi replacement: {_replacement_status_label(status.replacement)}")
    if status.notes:
        click.echo("Notes:")
        for note in status.notes:
            click.echo(f"- {note}")
