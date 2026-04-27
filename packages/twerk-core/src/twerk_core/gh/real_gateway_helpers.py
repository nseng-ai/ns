"""Subprocess-backed helpers shared across the real gh gateways.

The real ``PRGateway`` and ``IssueGateway`` implementations both need to
resolve a PR from a branch name via ``gh pr view``. Keeping that helper in
its own module (rather than inside either gateway) makes its role
explicit: it's production plumbing shared by the ``Real*Gateway`` classes,
not part of either gateway's public surface.
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


def search_open_prs(query: str) -> tuple[PRSummary, ...] | PRLookupError:
    """Shell out to ``gh pr list --state open --search <query>``."""
    result = subprocess.run(
        [
            "gh",
            "pr",
            "list",
            "--state",
            "open",
            "--search",
            query,
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
    items = json.loads(result.stdout)
    summaries: list[PRSummary] = []
    for item in items:
        state: PRState = item["state"]
        summaries.append(
            PRSummary(
                number=item["number"],
                title=item["title"],
                url=item["url"],
                head_ref_name=item["headRefName"],
                base_ref_name=item["baseRefName"],
                state=state,
            )
        )
    return tuple(summaries)
