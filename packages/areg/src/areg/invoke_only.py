from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from areg.check.frontmatter import parse_skill_frontmatter

# Claude Code and Pi drop skills with disable-model-invocation from ambient context.
# Codex only honors the sidecar as explicit-only; it still pays ambient context cost.
CODEX_OPENAI_POLICY = "policy:\n  allow_implicit_invocation: false\n"
DISABLE_MODEL_INVOCATION_KEY = "disable-model-invocation"


def skill_dir(project_dir: Path, skill_name: str) -> Path:
    return project_dir / "skills" / skill_name


def skill_md_path(project_dir: Path, skill_name: str) -> Path:
    return skill_dir(project_dir, skill_name) / "SKILL.md"


def openai_policy_path(project_dir: Path, skill_name: str) -> Path:
    return skill_dir(project_dir, skill_name) / "agents" / "openai.yaml"


def flag_set_in_frontmatter(frontmatter: dict[str, str]) -> bool:
    return frontmatter.get(DISABLE_MODEL_INVOCATION_KEY, "").strip().lower() == "true"


def disable_model_invocation_enabled(skill_md: Path) -> bool:
    """Best-effort read of the flag; malformed or unreadable frontmatter reads as disabled."""
    try:
        frontmatter = parse_skill_frontmatter(skill_md)
    except (OSError, ValueError):
        return False
    return flag_set_in_frontmatter(frontmatter)


class InvokeOnlyStatus(Enum):
    NORMAL = "normal"
    INVOKE_ONLY = "invoke_only"
    FLAG_WITHOUT_SIDECAR = "flag_without_sidecar"
    SIDECAR_WITHOUT_FLAG = "sidecar_without_flag"


@dataclass(frozen=True)
class InvokeOnlyState:
    flag_enabled: bool
    sidecar_exists: bool

    @property
    def status(self) -> InvokeOnlyStatus:
        if self.flag_enabled and self.sidecar_exists:
            return InvokeOnlyStatus.INVOKE_ONLY
        if self.flag_enabled:
            return InvokeOnlyStatus.FLAG_WITHOUT_SIDECAR
        if self.sidecar_exists:
            return InvokeOnlyStatus.SIDECAR_WITHOUT_FLAG
        return InvokeOnlyStatus.NORMAL


def read_invoke_only_state(project_dir: Path, skill_name: str) -> InvokeOnlyState:
    return InvokeOnlyState(
        flag_enabled=disable_model_invocation_enabled(skill_md_path(project_dir, skill_name)),
        sidecar_exists=openai_policy_path(project_dir, skill_name).is_file(),
    )
