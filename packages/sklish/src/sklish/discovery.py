from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable
from dataclasses import dataclass
from importlib.metadata import entry_points

ENTRY_POINT_GROUP = "sklish.skills"


@dataclass(frozen=True)
class Manifest:
    """One skill manifest declared by an installed distribution.

    `source` is the `<owner>/<repo>` key; `skills` is the parsed list of
    whitespace-separated skill names.
    """

    dist_name: str
    source: str
    skills: tuple[str, ...]


@dataclass(frozen=True)
class SourceGroup:
    """Deduped, aggregated skills for one source across all declaring dists."""

    source: str
    skills: tuple[str, ...]


class ManifestSource(ABC):
    """Pluggable provider of declared manifests (injected for tests)."""

    @abstractmethod
    def get_manifests(self) -> tuple[Manifest, ...]: ...


class InstalledManifestSource(ManifestSource):
    """Reads manifests from `importlib.metadata.entry_points()` at runtime."""

    def get_manifests(self) -> tuple[Manifest, ...]:
        result: list[Manifest] = []
        for ep in entry_points(group=ENTRY_POINT_GROUP):
            dist = ep.dist
            dist_name = dist.name if dist is not None else "<unknown>"
            skills = tuple(ep.value.split())
            result.append(Manifest(dist_name=dist_name, source=ep.name, skills=skills))
        return tuple(result)


def aggregate(manifests: Iterable[Manifest]) -> tuple[SourceGroup, ...]:
    """Group manifests by `source`, deduping skills, preserving first-seen order."""
    skills_by_source: dict[str, list[str]] = {}
    source_order: list[str] = []
    for manifest in manifests:
        if manifest.source not in skills_by_source:
            skills_by_source[manifest.source] = []
            source_order.append(manifest.source)
        seen = set(skills_by_source[manifest.source])
        for skill in manifest.skills:
            if skill not in seen:
                skills_by_source[manifest.source].append(skill)
                seen.add(skill)
    return tuple(
        SourceGroup(source=source, skills=tuple(skills_by_source[source]))
        for source in source_order
    )
