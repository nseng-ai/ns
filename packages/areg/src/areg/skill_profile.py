from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path

import click

from areg.check.frontmatter import parse_skill_frontmatter
from areg.command_conversion import (
    PiReplacementVerification,
    plan_pi_settings_update,
    read_command_conversion_state,
    require_verified_pi_replacement,
)
from areg.file_plan import (
    DeleteFilePlan,
    RemoveEmptyDirPlan,
    SkippedTextWrite,
    TextFilePlan,
    TextWritePlan,
    read_existing_text,
    reject_symlink,
)
from areg.invoke_only import (
    CODEX_OPENAI_POLICY,
    DISABLE_MODEL_INVOCATION_KEY,
    openai_policy_path,
)

USER_INVOCABLE_KEY = "user-invocable"


class SkillProfile(Enum):
    NORMAL = "normal"
    INVOKE_ONLY = "invoke-only"
    COMMAND_BACKED = "command-backed"
    AMBIENT_ONLY = "ambient-only"


class InferredSkillProfile(Enum):
    NORMAL = "normal"
    INVOKE_ONLY = "invoke-only"
    COMMAND_BACKED = "command-backed"
    AMBIENT_ONLY = "ambient-only"
    MIXED = "mixed"
    INCONSISTENT = "inconsistent"


@dataclass(frozen=True)
class SkillProfileEditPlan:
    text_files: tuple[TextFilePlan, ...] = ()
    delete_files: tuple[DeleteFilePlan, ...] = ()
    remove_empty_dirs: tuple[RemoveEmptyDirPlan, ...] = ()


@dataclass(frozen=True)
class SkillProfileStatus:
    skill_name: str
    profile: InferredSkillProfile
    model_invocation: str
    native_direct: str
    pi_extension: str
    notes: tuple[str, ...]
    disable_model_invocation: bool
    codex_sidecar: bool
    user_invocable_key_present: bool
    user_invocable_false: bool
    pi_excluded: bool
    replacement: PiReplacementVerification | None


_USER_INVOCABLE_LINE_PREFIX = f"{USER_INVOCABLE_KEY}:"


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


def _is_top_level_key(line: str, key_prefix: str) -> bool:
    return line.startswith(key_prefix)


def _set_frontmatter_boolean(content: str, *, path: Path, key: str, value: bool) -> str:
    lines = content.splitlines(keepends=True)
    end_index = _frontmatter_end_index(lines, path=path)
    newline = _line_ending(lines[0])
    line_prefix = f"{key}:"

    name_index: int | None = None
    key_indices: list[int] = []
    for index in range(1, end_index):
        if _is_top_level_key(lines[index], "name:"):
            name_index = index
        if _is_top_level_key(lines[index], line_prefix):
            key_indices.append(index)

    if name_index is None:
        raise click.ClickException(f"{path} has malformed frontmatter: missing name field.")

    value_text = "true" if value else "false"
    if key_indices:
        first_key_index = key_indices[0]
        lines[first_key_index] = f"{line_prefix} {value_text}{newline}"
        for index in reversed(key_indices[1:]):
            del lines[index]
        return "".join(lines)

    lines.insert(name_index + 1, f"{line_prefix} {value_text}{newline}")
    return "".join(lines)


def _remove_frontmatter_key(content: str, *, path: Path, key: str) -> str:
    lines = content.splitlines(keepends=True)
    end_index = _frontmatter_end_index(lines, path=path)
    line_prefix = f"{key}:"
    lines_to_keep: list[str] = []
    for index, line in enumerate(lines):
        if 1 <= index < end_index and _is_top_level_key(line, line_prefix):
            continue
        lines_to_keep.append(line)
    return "".join(lines_to_keep)


def _set_disable_model_invocation(content: str, *, path: Path) -> str:
    return _set_frontmatter_boolean(
        content, path=path, key=DISABLE_MODEL_INVOCATION_KEY, value=True
    )


def _remove_disable_model_invocation(content: str, *, path: Path) -> str:
    return _remove_frontmatter_key(content, path=path, key=DISABLE_MODEL_INVOCATION_KEY)


def _set_user_invocable_false(content: str, *, path: Path) -> str:
    return _set_frontmatter_boolean(content, path=path, key=USER_INVOCABLE_KEY, value=False)


def _remove_user_invocable(content: str, *, path: Path) -> str:
    return _remove_frontmatter_key(content, path=path, key=USER_INVOCABLE_KEY)


def _profile_skill_md_content(content: str, *, path: Path, profile: SkillProfile) -> str:
    if profile is SkillProfile.NORMAL:
        return _remove_user_invocable(
            _remove_disable_model_invocation(content, path=path), path=path
        )
    if profile is SkillProfile.INVOKE_ONLY:
        return _remove_user_invocable(_set_disable_model_invocation(content, path=path), path=path)
    if profile is SkillProfile.COMMAND_BACKED:
        return _remove_user_invocable(_set_disable_model_invocation(content, path=path), path=path)
    return _set_user_invocable_false(
        _remove_disable_model_invocation(content, path=path), path=path
    )


def plan_skill_md_profile_update(skill_md: Path, *, profile: SkillProfile) -> TextFilePlan:
    content = read_existing_text(skill_md)
    new_content = _profile_skill_md_content(content, path=skill_md, profile=profile)
    if new_content == content:
        return SkippedTextWrite(path=skill_md, reason=f"SKILL.md already {profile.value}")
    return TextWritePlan(path=skill_md, content=new_content, description="SKILL.md")


def plan_sidecar_write(sidecar: Path) -> TextFilePlan:
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


def _sidecar_deletes(project_dir: Path, skill_name: str) -> tuple[DeleteFilePlan, ...]:
    sidecar = openai_policy_path(project_dir, skill_name)
    if sidecar.exists() or sidecar.is_symlink():
        return (DeleteFilePlan(path=sidecar, description="Codex openai.yaml"),)
    return ()


def _sidecar_empty_dir_removals(
    project_dir: Path,
    skill_name: str,
) -> tuple[RemoveEmptyDirPlan, ...]:
    sidecar = openai_policy_path(project_dir, skill_name)
    if sidecar.parent.exists():
        return (
            RemoveEmptyDirPlan(path=sidecar.parent, description="empty skill agents directory"),
        )
    return ()


def build_skill_profile_plan(
    project_dir: Path,
    skill_name: str,
    skill_md: Path,
    *,
    profile: SkillProfile,
) -> SkillProfileEditPlan:
    if profile is SkillProfile.COMMAND_BACKED:
        require_verified_pi_replacement(project_dir, skill_name)

    sidecar = openai_policy_path(project_dir, skill_name)
    text_files: list[TextFilePlan] = [plan_skill_md_profile_update(skill_md, profile=profile)]
    delete_files: tuple[DeleteFilePlan, ...] = ()
    remove_empty_dirs: tuple[RemoveEmptyDirPlan, ...] = ()

    if profile in {SkillProfile.INVOKE_ONLY, SkillProfile.COMMAND_BACKED}:
        text_files.append(plan_sidecar_write(sidecar))
    else:
        delete_files = _sidecar_deletes(project_dir, skill_name)
        remove_empty_dirs = _sidecar_empty_dir_removals(project_dir, skill_name)

    text_files.append(
        plan_pi_settings_update(
            project_dir,
            skill_name,
            convert=profile is SkillProfile.COMMAND_BACKED,
        )
    )

    return SkillProfileEditPlan(
        text_files=tuple(text_files),
        delete_files=delete_files,
        remove_empty_dirs=remove_empty_dirs,
    )


def _frontmatter_value_is_false(frontmatter: dict[str, str], key: str) -> bool:
    return frontmatter.get(key, "").strip().lower() == "false"


def _frontmatter_key_present(skill_md: Path, key_prefix: str) -> bool:
    content = read_existing_text(skill_md)
    lines = content.splitlines(keepends=True)
    end_index = _frontmatter_end_index(lines, path=skill_md)
    for line in lines[1:end_index]:
        if _is_top_level_key(line, key_prefix):
            return True
    return False


def _profile_for_artifacts(
    *,
    disable_model_invocation: bool,
    codex_sidecar: bool,
    user_invocable_key_present: bool,
    user_invocable_false: bool,
    pi_excluded: bool,
    replacement: PiReplacementVerification | None,
) -> InferredSkillProfile:
    if (
        disable_model_invocation
        and codex_sidecar
        and pi_excluded
        and replacement is not None
        and replacement.verified
        and not user_invocable_key_present
    ):
        return InferredSkillProfile.COMMAND_BACKED
    if (
        disable_model_invocation
        and codex_sidecar
        and not pi_excluded
        and not user_invocable_key_present
    ):
        return InferredSkillProfile.INVOKE_ONLY
    if (
        user_invocable_false
        and not disable_model_invocation
        and not codex_sidecar
        and not pi_excluded
    ):
        return InferredSkillProfile.AMBIENT_ONLY
    if (
        not disable_model_invocation
        and not codex_sidecar
        and not user_invocable_key_present
        and not pi_excluded
    ):
        return InferredSkillProfile.NORMAL
    if user_invocable_key_present and (disable_model_invocation or codex_sidecar or pi_excluded):
        return InferredSkillProfile.MIXED
    return InferredSkillProfile.INCONSISTENT


def _model_invocation_status(disable_model_invocation: bool, codex_sidecar: bool) -> str:
    if disable_model_invocation and codex_sidecar:
        return "disabled"
    if disable_model_invocation or codex_sidecar:
        return "mixed"
    return "enabled"


def _native_direct_status(
    profile: InferredSkillProfile,
    *,
    user_invocable_key_present: bool,
    pi_excluded: bool,
) -> str:
    if profile in {InferredSkillProfile.NORMAL, InferredSkillProfile.INVOKE_ONLY}:
        return "enabled"
    if profile in {InferredSkillProfile.COMMAND_BACKED, InferredSkillProfile.AMBIENT_ONLY}:
        return "partial"
    if user_invocable_key_present or pi_excluded:
        return "mixed"
    return "enabled"


def _pi_extension_status(
    *, pi_excluded: bool, replacement: PiReplacementVerification | None
) -> str:
    if not pi_excluded:
        return "n/a"
    if replacement is not None and replacement.verified:
        return "enabled"
    return "missing"


def _artifact_notes(
    *,
    profile: InferredSkillProfile,
    disable_model_invocation: bool,
    codex_sidecar: bool,
    user_invocable_key_present: bool,
    user_invocable_false: bool,
    pi_excluded: bool,
    replacement: PiReplacementVerification | None,
) -> tuple[str, ...]:
    notes: list[str] = []
    if disable_model_invocation and not codex_sidecar:
        notes.append("disable-model-invocation present but agents/openai.yaml missing")
    if codex_sidecar and not disable_model_invocation:
        notes.append("agents/openai.yaml present but disable-model-invocation absent")
    if user_invocable_key_present and not user_invocable_false:
        notes.append("user-invocable is present but not false")
    if user_invocable_key_present and (disable_model_invocation or codex_sidecar or pi_excluded):
        notes.append("user-invocable:false is mixed with explicit-only or Pi-exclusion artifacts")
    if pi_excluded and (replacement is None or not replacement.verified):
        notes.append("Pi skill exclusion present but replacement command is missing")
    if profile is InferredSkillProfile.AMBIENT_ONLY:
        notes.append("ambient-only: Claude native direct invocation disabled")
        notes.append("ambient-only: Pi native direct invocation not enforced")
        notes.append("ambient-only: Codex native direct invocation not enforced")
    return tuple(notes)


def read_skill_profile_status(
    project_dir: Path,
    skill_name: str,
    *,
    skill_md: Path,
) -> SkillProfileStatus:
    try:
        frontmatter = parse_skill_frontmatter(skill_md)
    except ValueError as e:
        raise click.ClickException(f"{skill_md} has invalid frontmatter: {e}") from e

    command_state = read_command_conversion_state(project_dir, skill_name)
    user_invocable_key_present = _frontmatter_key_present(skill_md, _USER_INVOCABLE_LINE_PREFIX)
    user_invocable_false = _frontmatter_value_is_false(frontmatter, USER_INVOCABLE_KEY)
    profile = _profile_for_artifacts(
        disable_model_invocation=command_state.flag_enabled,
        codex_sidecar=command_state.codex_sidecar_exists,
        user_invocable_key_present=user_invocable_key_present,
        user_invocable_false=user_invocable_false,
        pi_excluded=command_state.pi_excluded,
        replacement=command_state.replacement,
    )
    return SkillProfileStatus(
        skill_name=skill_name,
        profile=profile,
        model_invocation=_model_invocation_status(
            command_state.flag_enabled,
            command_state.codex_sidecar_exists,
        ),
        native_direct=_native_direct_status(
            profile,
            user_invocable_key_present=user_invocable_key_present,
            pi_excluded=command_state.pi_excluded,
        ),
        pi_extension=_pi_extension_status(
            pi_excluded=command_state.pi_excluded,
            replacement=command_state.replacement,
        ),
        notes=_artifact_notes(
            profile=profile,
            disable_model_invocation=command_state.flag_enabled,
            codex_sidecar=command_state.codex_sidecar_exists,
            user_invocable_key_present=user_invocable_key_present,
            user_invocable_false=user_invocable_false,
            pi_excluded=command_state.pi_excluded,
            replacement=command_state.replacement,
        ),
        disable_model_invocation=command_state.flag_enabled,
        codex_sidecar=command_state.codex_sidecar_exists,
        user_invocable_key_present=user_invocable_key_present,
        user_invocable_false=user_invocable_false,
        pi_excluded=command_state.pi_excluded,
        replacement=command_state.replacement,
    )
