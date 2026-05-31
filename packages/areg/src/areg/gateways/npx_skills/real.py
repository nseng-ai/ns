"""Production `npx skills` gateway implementation."""

from __future__ import annotations

import subprocess
from pathlib import Path

from areg.gateways.npx_skills.gateway import NpxSkills, NpxSkillsError


class RealNpxSkills(NpxSkills):
    """Production implementation that shells out to `npx skills add`."""

    def add(
        self,
        repo: str,
        *,
        skills: list[str] | None,
        agents: list[str],
        cwd: Path,
    ) -> None:
        cmd = ["npx", "skills", "add", repo]
        if skills:
            cmd.extend(["--skill", *skills])
        cmd.extend(["--agent", *agents, "-y"])

        try:
            subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            stderr = (e.stderr or "").strip()
            raise NpxSkillsError(stderr or "npx skills add failed") from e
