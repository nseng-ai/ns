"""Real GhIssueGateway implementation backed by the gh CLI."""

from __future__ import annotations

import json
import subprocess

from twerk_core.gh.issue_gateway import GhIssueGateway
from twerk_core.gh.types import GhIssue


class GhCliIssueGateway(GhIssueGateway):
    """GhIssueGateway implemented by shelling out to the `gh` CLI."""

    def list(self, *, label: str | None = None, state: str = "open") -> tuple[GhIssue, ...]:
        cmd = [
            "gh",
            "issue",
            "list",
            "--state",
            state,
            "--json",
            "number,title,state,updatedAt",
            "--limit",
            "100",
        ]
        if label is not None:
            cmd.extend(["--label", label])

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        items = json.loads(result.stdout)
        return tuple(
            GhIssue(
                number=item["number"],
                title=item["title"],
                state=item["state"],
                updated_at=item["updatedAt"],
            )
            for item in items
        )
