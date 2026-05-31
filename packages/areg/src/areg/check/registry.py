from __future__ import annotations

from areg.check.base import ProjectCheck, SkillCheck
from areg.check.checks.github_skill import GitHubSkillStructureCheck
from areg.check.checks.local_skill import LocalSkillStructureCheck
from areg.check.checks.orphans import OrphansCheck
from areg.check.checks.pairing import PairingCheck
from areg.check.checks.skill_md import SkillMdCheck

DEFAULT_SKILL_CHECKS: list[SkillCheck] = [
    LocalSkillStructureCheck(),
    GitHubSkillStructureCheck(),
    SkillMdCheck(),
]

DEFAULT_PROJECT_CHECKS: list[ProjectCheck] = [
    OrphansCheck(),
    PairingCheck(),
]
