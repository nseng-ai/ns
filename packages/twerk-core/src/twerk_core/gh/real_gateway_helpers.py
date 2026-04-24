"""Subprocess-backed helpers shared across the real gh gateways.

Real gateways often need the same ``gh`` CLI primitives — e.g. resolving a
PR from a branch name or fetching the current ``(owner, repo)``. Keeping
those helpers in a shared module (rather than inside any one gateway)
makes their role explicit: they're production plumbing shared by the
``Real*Gateway`` classes, not part of any single gateway's public surface.
"""

from __future__ import annotations

import json
import subprocess

from twerk_core.gh.types import PRLookupError, PRState, PRSummary


def fetch_pr_summary_for_branch(branch: str) -> PRSummary | PRLookupError:
    """Shell out to ``gh pr view <branch>`` and return a ``PRSummary``."""
    result = subprocess.run(
        [
            "gh",
            "pr",
            "view",
            branch,
            "--json",
            "number,title,url,headRefName,baseRefName,state",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return PRLookupError(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
        )
    data = json.loads(result.stdout)
    state: PRState = data["state"]
    return PRSummary(
        number=data["number"],
        title=data["title"],
        url=data["url"],
        head_ref_name=data["headRefName"],
        base_ref_name=data["baseRefName"],
        state=state,
    )


def fetch_owner_repo() -> tuple[str, str]:
    """Resolve ``(owner, repo)`` for the current working directory via ``gh repo view``.

    REST and GraphQL endpoints require owner and repo as separate path or
    query variables. This helper is shared by every real gateway that hits
    an owner/repo-scoped endpoint.
    """
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "owner,name"],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    return data["owner"]["login"], data["name"]
