"""Application context that carries gateways through the Click command tree."""

from __future__ import annotations

from dataclasses import dataclass

from areg.gateways.gh.gateway import GhCli
from areg.gateways.npx_skills.gateway import NpxSkills


@dataclass
class AregContext:
    """Container for areg's external-tool gateways.

    Production code constructs this with real gateways in ``cli.main``.
    Tests construct it with fake gateways and pass it to
    ``CliRunner.invoke(..., obj=ctx)``.
    """

    gh: GhCli
    npx_skills: NpxSkills
