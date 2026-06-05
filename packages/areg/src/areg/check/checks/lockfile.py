from __future__ import annotations

from typing import ClassVar

from areg.check.base import ProjectCheck
from areg.check.models import CheckContext, IssueKind, SkillIssue

_PLACEHOLDER_HASH = "PENDING_REGEN"
_HEX_CHARS = frozenset("0123456789abcdef")


class LockfileConsistencyCheck(ProjectCheck):
    name: ClassVar[str] = "lockfile_consistency"

    def run(self, ctx: CheckContext) -> list[SkillIssue]:
        issues: list[SkillIssue] = []
        for entry in ctx.lockfile_skills:
            if entry.computed_hash == _PLACEHOLDER_HASH:
                issues.append(
                    SkillIssue(
                        entry.name,
                        IssueKind.INVALID_LOCK_HASH,
                        f"skills-lock.json entry for {entry.name} has placeholder "
                        f"computedHash {_PLACEHOLDER_HASH}; regenerate or normalize the "
                        "lockfile before relying on areg check.",
                    )
                )
            elif not _is_sha256_hex(entry.computed_hash):
                issues.append(
                    SkillIssue(
                        entry.name,
                        IssueKind.INVALID_LOCK_HASH,
                        f"skills-lock.json entry for {entry.name} has invalid computedHash "
                        f"{entry.computed_hash!r}; expected 64 lowercase hex characters.",
                    )
                )
        return issues


def _is_sha256_hex(value: str) -> bool:
    return len(value) == 64 and all(ch in _HEX_CHARS for ch in value)
