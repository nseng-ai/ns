"""Checked-in persistent fixture catalog for live GitHub conformance."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PrState = Literal["OPEN", "CLOSED", "MERGED"]
IssueState = Literal["OPEN", "CLOSED"]


@dataclass(frozen=True)
class PullRequestFixture:
    """Persistent read-only pull request scenario fixture."""

    name: str
    number: int
    head_branch: str
    expected_state: PrState
    expected_title_prefix: str
    expected_changed_files: tuple[str, ...] = ()


@dataclass(frozen=True)
class IssueListFixture:
    """Persistent read-only issue-list scenario fixture."""

    name: str
    label: str
    expected_state: IssueState
    expected_title_prefix: str


# Placeholder identifiers until the canonical conformance repository is
# provisioned. The scenario names and expectations are the durable contract;
# future fixture-maintenance PRs should update the checked-in identifiers here,
# not add ad hoc runtime parameters.
PR_BASIC_LOOKUP = PullRequestFixture(
    name="pr_basic_lookup",
    number=1,
    head_branch="fixture/pr-basic-lookup",
    expected_state="OPEN",
    expected_title_prefix="[fixture:pr-basic-lookup]",
)

ISSUE_LIST_OPEN_WITH_LABEL = IssueListFixture(
    name="issue_list_open_with_label",
    label="fixture/issue-list-open",
    expected_state="OPEN",
    expected_title_prefix="[fixture:issue-list-open]",
)

PULL_REQUEST_FIXTURES = (PR_BASIC_LOOKUP,)
ISSUE_LIST_FIXTURES = (ISSUE_LIST_OPEN_WITH_LABEL,)
