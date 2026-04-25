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
            "number,title,url,headRefName,baseRefName,state,mergedAt,mergeCommitOid",
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
        merged_at=_none_if_blank(data.get("mergedAt")),
        merge_commit_oid=_none_if_blank(data.get("mergeCommitOid")),
    )


def _none_if_blank(value: object) -> str | None:
    """Coerce empty strings (``gh``'s representation of an absent field) to ``None``."""
    if value is None:
        return None
    if isinstance(value, str) and value == "":
        return None
    if isinstance(value, str):
        return value
    return None
