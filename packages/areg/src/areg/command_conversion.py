from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import click

from areg.file_plan import (
    SkippedTextWrite,
    TextFilePlan,
    TextWritePlan,
    is_under_project,
    reject_symlink,
)
from areg.invoke_only import InvokeOnlyState, read_invoke_only_state
from areg.json_config import extract_string_list_field, read_json_object

_PI_SKILL_EXCLUSION_PREFIX = "-skills/"

KNOWN_PI_COMMAND_NAMESPACES: tuple[str, ...] = (
    "branch-context",
    "enriched-plan",
    "objective",
    "handoff",
    "context",
    "changelog",
    "typescript",
    "python",
    "refactor",
    "setup",
    "create",
    "skill",
    "code",
    "ccc",
    "claude",
    "dev",
    "cli",
    "pr",
    "sdl",
    "pi",
    "stack",
)

SPECIALIZED_SKILL_REPLACEMENTS: dict[str, str] = {
    "branch-context-from-plan": "branch-context:from-plan",
    "branch-context-impl": "branch-context:impl",
    "enriched-plan-save": "enriched-plan:save",
    "handoff-create": "handoff:create",
    "handoff-pickup": "handoff:pickup",
    "objective-create": "objective:create",
    "objective-next": "objective:next",
    "objective-stack-impl": "objective:stack-impl",
    "objective-update": "objective:update",
    "pi-grill-ui": "pi:grill-me",
    "pi-grill-with-docs-ui": "pi:grill-with-docs",
    "code-autobranch": "code:autobranch",
    "code-checkpoint": "code:checkpoint",
    "code-just-fix": "code:just-fix",
    "code-submit": "code:submit",
    "ccc-sidebar": "ccc:sidebar:pr-summary",
}

SPECIALIZED_PI_COMMAND_SURFACES: frozenset[str] = frozenset(SPECIALIZED_SKILL_REPLACEMENTS.values())


@dataclass(frozen=True)
class DerivedPiCommand:
    surface: str
    skill_name: str
    namespace: str
    command: str


@dataclass(frozen=True)
class PiReplacementVerification:
    status: str
    surface: str | None
    evidence: str | None
    advice: str | None

    @property
    def verified(self) -> bool:
        return self.status == "verified"


@dataclass(frozen=True)
class CommandConversionState:
    flag_enabled: bool
    codex_sidecar_exists: bool
    pi_excluded: bool
    replacement: PiReplacementVerification | None

    @property
    def is_fully_converted(self) -> bool:
        return (
            self.flag_enabled
            and self.codex_sidecar_exists
            and self.pi_excluded
            and self.replacement is not None
            and self.replacement.verified
        )


def derive_pi_replacement_command(skill_name: str) -> DerivedPiCommand | None:
    namespaces: list[str] = sorted(
        KNOWN_PI_COMMAND_NAMESPACES, key=lambda value: len(value), reverse=True
    )
    for namespace in namespaces:
        prefix = f"{namespace}-"
        if skill_name.startswith(prefix):
            command = skill_name.removeprefix(prefix)
            return DerivedPiCommand(
                surface=f"{namespace}:{command}",
                skill_name=skill_name,
                namespace=namespace,
                command=command,
            )

    first_hyphen = skill_name.find("-")
    if first_hyphen <= 0 or first_hyphen == len(skill_name) - 1:
        return None

    namespace = skill_name[:first_hyphen]
    command = skill_name[first_hyphen + 1 :]
    return DerivedPiCommand(
        surface=f"{namespace}:{command}",
        skill_name=skill_name,
        namespace=namespace,
        command=command,
    )


def pi_settings_path(project_dir: Path) -> Path:
    return project_dir / ".pi" / "settings.json"


def pi_skill_exclusion(skill_name: str) -> str:
    return f"{_PI_SKILL_EXCLUSION_PREFIX}{skill_name}"


def read_pi_settings(settings_path: Path) -> dict[str, object]:
    return read_json_object(settings_path, description=str(settings_path))


def settings_skills(settings: dict[str, object], settings_path: Path) -> list[str]:
    if "skills" not in settings:
        return []

    return extract_string_list_field(
        settings,
        "skills",
        error_message=f"{settings_path} field 'skills' must be an array of strings.",
    )


def validate_pi_settings_path(project_dir: Path, settings_path: Path) -> None:
    pi_dir = settings_path.parent
    reject_symlink(pi_dir, description=".pi")
    if pi_dir.exists() and not pi_dir.is_dir():
        raise click.ClickException(f"{pi_dir} exists but is not a directory.")
    reject_symlink(settings_path, description="Pi settings.json")
    if settings_path.exists() and not settings_path.is_file():
        raise click.ClickException(f"{settings_path} exists but is not a file.")
    if settings_path.exists() and not is_under_project(
        settings_path.resolve(),
        project_dir=project_dir,
    ):
        raise click.ClickException(
            f"Pi settings.json at {settings_path} resolves outside {project_dir}; "
            "refusing to manage it."
        )


def plan_pi_settings_update(project_dir: Path, skill_name: str, *, convert: bool) -> TextFilePlan:
    settings_path = pi_settings_path(project_dir)
    validate_pi_settings_path(project_dir, settings_path)
    exclusion = pi_skill_exclusion(skill_name)

    settings: dict[str, object]
    if settings_path.exists():
        settings = read_pi_settings(settings_path)
    else:
        settings = {}

    skills = settings_skills(settings, settings_path)
    if convert:
        if exclusion in skills:
            return SkippedTextWrite(path=settings_path, reason="Pi skill exclusion already present")
        settings["skills"] = [*skills, exclusion]
    else:
        new_skills = [skill for skill in skills if skill != exclusion]
        if new_skills == skills:
            return SkippedTextWrite(path=settings_path, reason="Pi skill exclusion absent")
        settings["skills"] = new_skills

    return TextWritePlan(
        path=settings_path,
        content=json.dumps(settings, indent=2) + "\n",
        description="Pi settings.json",
        create_parent=True,
    )


def pi_skill_exclusion_present(project_dir: Path, skill_name: str) -> bool:
    settings_path = pi_settings_path(project_dir)
    validate_pi_settings_path(project_dir, settings_path)
    if not settings_path.exists():
        return False
    settings = read_pi_settings(settings_path)
    return pi_skill_exclusion(skill_name) in settings_skills(settings, settings_path)


def verify_pi_replacement(project_dir: Path, skill_name: str) -> PiReplacementVerification:
    derived = derive_pi_replacement_command(skill_name)
    mapped_surface = SPECIALIZED_SKILL_REPLACEMENTS.get(skill_name)
    surface = mapped_surface
    if surface is None and derived is not None:
        surface = derived.surface
    if surface is None:
        return PiReplacementVerification(
            status="missing",
            surface=None,
            evidence=None,
            advice=_replacement_advice(skill_name, None),
        )

    if mapped_surface is not None:
        return PiReplacementVerification(
            status="verified",
            surface=surface,
            evidence=f"specialized replacement mapping covers /{surface}",
            advice=None,
        )

    if _generic_replacement_layer_present(project_dir):
        return PiReplacementVerification(
            status="verified",
            surface=surface,
            evidence="generic backing-skill replacement extension is installed",
            advice=None,
        )

    return PiReplacementVerification(
        status="missing",
        surface=surface,
        evidence=None,
        advice=_replacement_advice(skill_name, surface),
    )


def require_verified_pi_replacement(
    project_dir: Path, skill_name: str
) -> PiReplacementVerification:
    verification = verify_pi_replacement(project_dir, skill_name)
    if verification.verified:
        return verification
    raise click.ClickException(verification.advice or f"Missing Pi replacement for {skill_name}.")


def read_command_conversion_state(project_dir: Path, skill_name: str) -> CommandConversionState:
    invoke_state: InvokeOnlyState = read_invoke_only_state(project_dir, skill_name)
    return CommandConversionState(
        flag_enabled=invoke_state.flag_enabled,
        codex_sidecar_exists=invoke_state.sidecar_exists,
        pi_excluded=pi_skill_exclusion_present(project_dir, skill_name),
        replacement=verify_pi_replacement(project_dir, skill_name),
    )


def _generic_replacement_layer_present(project_dir: Path) -> bool:
    adapter = project_dir / ".pi" / "extensions" / "backing-skill-commands.ts"
    package_module = (
        project_dir / "ts" / "packages" / "pi-extensions" / "src" / "backing-skill-commands.ts"
    )
    return adapter.is_file() and package_module.is_file()


def _replacement_advice(skill_name: str, surface: str | None) -> str:
    expected = f"/{surface}" if surface is not None else "no command could be derived"
    return "\n".join(
        [
            f"Missing Pi extension replacement for converted skill {skill_name}.",
            f"Expected command: {expected}",
            "Converting now would hide /skill:" + skill_name + " in Pi via .pi/settings.json.",
            "",
            "Add a Pi extension replacement for converted skill " + skill_name + ".",
            f"Expected command: {expected}",
            "Requirements:",
            "- Register the command in the repo-local Pi extension package, or add it "
            "to the generic backing-skill command replacement registry.",
            f"- The command must read skills/{skill_name}/SKILL.md directly as a "
            "backing skill, because .pi/settings.json will exclude "
            f"/skill:{skill_name}.",
            "- Preserve any user args as fenced text in the prompt.",
            "- Add tests proving the command works when the backing skill is "
            "excluded from Pi ambient skill discovery.",
        ]
    )
