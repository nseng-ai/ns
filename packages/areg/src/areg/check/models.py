from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Literal, get_args

SourceType = Literal["local", "github", "git", "gitlab"]

SUPPORTED_SOURCE_TYPES: frozenset[SourceType] = frozenset(get_args(SourceType))


class IssueKind(Enum):
    INVALID_LOCK_HASH = "invalid_lock_hash"

    MISSING_SKILLS_DIR = "missing_skills_dir"
    SKILLS_DIR_IS_SYMLINK = "skills_dir_is_symlink"
    INVALID_LOCAL_LOCK_SOURCE = "invalid_local_lock_source"
    AGENTS_NOT_SYMLINK = "agents_not_symlink"
    AGENTS_WRONG_TARGET = "agents_wrong_target"
    AGENTS_MISSING = "agents_missing"
    CLAUDE_NOT_SYMLINK = "claude_not_symlink"
    CLAUDE_WRONG_TARGET = "claude_wrong_target"
    CLAUDE_MISSING = "claude_missing"
    INVALID_SKILL_MD = "invalid_skill_md"
    INVOKE_ONLY_MISSING_OPENAI_POLICY = "invoke_only_missing_openai_policy"
    OPENAI_POLICY_WITHOUT_INVOKE_ONLY = "openai_policy_without_invoke_only"

    AGENTS_NOT_REAL_DIR = "agents_not_real_dir"
    UNEXPECTED_SKILLS_DIR = "unexpected_skills_dir"

    ORPHAN_IN_SKILLS = "orphan_in_skills"
    ORPHAN_IN_AGENTS = "orphan_in_agents"
    DANGLING_LOCKFILE = "dangling_lockfile"

    CLAUDE_MD_MISSING_PEER = "claude_md_missing_peer"
    AGENTS_MD_MISSING_PEER = "agents_md_missing_peer"
    CLAUDE_MD_MISSING_AGENTS_REF = "claude_md_missing_agents_ref"


@dataclass(frozen=True)
class SkillIssue:
    skill_name: str
    kind: IssueKind
    message: str


@dataclass
class CheckResult:
    issues: list[SkillIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return len(self.issues) == 0


@dataclass(frozen=True)
class SkillMeta:
    name: str
    source: str
    source_type: SourceType


@dataclass(frozen=True)
class LockfileSkill:
    name: str
    source: str
    source_type: SourceType
    computed_hash: str
    skill_path: str | None = None


@dataclass(frozen=True)
class SkillsLockfile:
    version: int
    skills: tuple[LockfileSkill, ...]

    @property
    def names(self) -> frozenset[str]:
        return frozenset(skill.name for skill in self.skills)


@dataclass(frozen=True)
class CheckContext:
    project_dir: Path
    skills: tuple[SkillMeta, ...]
    lockfile_names: frozenset[str]
    excluded_skills: frozenset[str]
    lockfile_skills: tuple[LockfileSkill, ...]
