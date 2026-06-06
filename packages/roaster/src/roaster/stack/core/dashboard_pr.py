"""Pure PR parsing helpers shared by roaster stack dashboards."""

from __future__ import annotations

import re


def stack_dashboard_pr_number(target_pr: str | None) -> int | None:
    """Return a numeric PR identifier when ``target_pr`` can supply one."""
    if target_pr is None:
        return None
    if target_pr.isdigit():
        return int(target_pr)
    match = re.search(r"/(?:pull|issues)/(\d+)(?:\D*)$", target_pr)
    if match is None:
        return None
    return int(match.group(1))


def stack_dashboard_pr_url(target_pr: str | None) -> str | None:
    """Return the dashboard PR URL when ``target_pr`` is URL-shaped."""
    if target_pr is None:
        return None
    if target_pr.startswith("http://") or target_pr.startswith("https://"):
        return target_pr
    return None
