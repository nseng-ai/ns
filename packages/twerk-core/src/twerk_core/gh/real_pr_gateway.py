"""Real PRGateway implementation backed by the gh CLI."""

from __future__ import annotations

import json
import subprocess
from typing import cast

from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRLookupError, PRState, PRSummary


class RealPRGateway(PRGateway):
    """PRGateway implemented by shelling out to the `gh` CLI."""

    def find_prs_for_branch(
        self,
        branch: str,
        *,
        state: str = "open",
    ) -> tuple[PRSummary, ...] | PRLookupError:
        result = subprocess.run(
            [
                "gh",
                "pr",
                "list",
                "--head",
                branch,
                "--state",
                state,
                "--json",
                "number,title,url,headRefName,headRefOid,baseRefName,state,updatedAt",
                "--limit",
                "1000",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return PRLookupError(
                stderr=result.stderr.strip(),
                returncode=result.returncode,
            )

        items = json.loads(result.stdout)
        return tuple(
            PRSummary(
                number=item["number"],
                title=item["title"],
                url=item["url"],
                head_ref_name=item["headRefName"],
                head_ref_oid=item["headRefOid"],
                base_ref_name=item["baseRefName"],
                state=cast(PRState, item["state"]),
                updated_at=item["updatedAt"],
            )
            for item in items
        )
