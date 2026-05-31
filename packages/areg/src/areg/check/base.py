from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

from areg.check.models import CheckContext, SkillIssue, SkillMeta, SourceType


class SkillCheck(ABC):
    name: ClassVar[str]
    source_types: ClassVar[frozenset[SourceType]]

    @abstractmethod
    def run(self, ctx: CheckContext, skill: SkillMeta) -> list[SkillIssue]: ...


class ProjectCheck(ABC):
    name: ClassVar[str]

    @abstractmethod
    def run(self, ctx: CheckContext) -> list[SkillIssue]: ...
