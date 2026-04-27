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

from twerk_core.gh.types import (
    PRCheck,
    PRCommandError,
    PRDetails,
    PRLookupError,
    PRMergeResult,
    PRState,
    PRStateFilter,
    PRSummary,
)


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


def fetch_pr_details_for_branch(branch: str) -> PRDetails | PRLookupError:
    """Shell out to ``gh pr view <branch>`` and return guarded-merge metadata."""
    result = subprocess.run(
        [
            "gh",
            "pr",
            "view",
            branch,
            "--json",
            "number,url,headRefName,baseRefName,state,headRefOid,mergeable,"
            "mergeStateStatus,isDraft",
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
    return PRDetails(
        number=data["number"],
        url=data["url"],
        head_ref_name=data["headRefName"],
        base_ref_name=data["baseRefName"],
        state=state,
        head_ref_oid=data["headRefOid"],
        mergeable=data.get("mergeable"),
        merge_state_status=data.get("mergeStateStatus"),
        is_draft=data["isDraft"],
    )


def search_prs(query: str, *, state: PRStateFilter) -> tuple[PRSummary, ...] | PRLookupError:
    """Shell out to ``gh pr list --state <state> --search <query>``."""
    result = subprocess.run(
        [
            "gh",
            "pr",
            "list",
            "--state",
            state,
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


def required_checks(pr_number: int) -> tuple[PRCheck, ...] | PRCommandError:
    """Shell out to ``gh pr checks`` and return required checks.

    ``gh pr checks`` may exit non-zero when checks are failing or pending while
    still emitting useful JSON. Treat parseable stdout as the source of truth
    and reserve ``PRCommandError`` for command failures without machine data.
    """
    result = subprocess.run(
        [
            "gh",
            "pr",
            "checks",
            str(pr_number),
            "--required",
            "--json",
            "name,bucket,state,link",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 and not result.stdout.strip():
        return PRCommandError(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
        )
    items = json.loads(result.stdout or "[]")
    return tuple(
        PRCheck(
            name=item["name"],
            bucket=item["bucket"],
            state=item["state"],
            link=item.get("link"),
        )
        for item in items
    )


def merge_pr(
    pr_number: int,
    *,
    match_head_commit: str,
    admin: bool,
    auto: bool,
) -> PRMergeResult | PRCommandError:
    """Shell out to ``gh pr merge`` using squash merge and a head-commit guard."""
    cmd = [
        "gh",
        "pr",
        "merge",
        str(pr_number),
        "-s",
        "--match-head-commit",
        match_head_commit,
    ]
    if admin:
        cmd.append("--admin")
    if auto:
        cmd.append("--auto")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return PRCommandError(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
        )
    return PRMergeResult(number=pr_number, auto=auto)
