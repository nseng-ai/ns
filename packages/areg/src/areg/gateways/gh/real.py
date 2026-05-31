"""Production `gh` gateway implementation."""

from __future__ import annotations

import subprocess

from areg.gateways.gh.gateway import GhAuthError, GhCli, GhError, GhNotFound


class RealGhCli(GhCli):
    """Production implementation that shells out to `gh api`."""

    def list_directory(self, repo: str, path: str) -> list[str]:
        try:
            proc = subprocess.run(
                ["gh", "api", f"repos/{repo}/contents/{path}", "--jq", ".[].name"],
                capture_output=True,
                text=True,
                check=True,
            )
        except subprocess.CalledProcessError as e:
            stderr = e.stderr or ""
            if "404" in stderr:
                raise GhNotFound(f"No {path}/ directory found in {repo}") from e
            if "401" in stderr or "403" in stderr:
                raise GhAuthError(f"Authentication error accessing {repo}") from e
            raise GhError(f"gh api failed: {stderr.strip()}") from e

        return [s.strip() for s in proc.stdout.strip().splitlines() if s.strip()]
