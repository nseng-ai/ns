"""Real GitHub gateway implementation using the gh CLI."""

from __future__ import annotations

import json
import subprocess

from twerk_objectives.gateway import ObjectiveIssueSummary, ObjectivesGitHub


class GhCliObjectivesGitHub(ObjectivesGitHub):
    def list_objectives(self, *, state: str = "open") -> tuple[ObjectiveIssueSummary, ...]:
        result = subprocess.run(
            [
                "gh",
                "issue",
                "list",
                "--label",
                "twerk-objective",
                "--state",
                state,
                "--json",
                "number,title,state,updatedAt",
                "--limit",
                "100",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        items = json.loads(result.stdout)
        return tuple(
            ObjectiveIssueSummary(
                number=item["number"],
                title=item["title"],
                state=item["state"],
                updated_at=item["updatedAt"],
            )
            for item in items
        )
