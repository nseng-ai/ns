"""Objective record inventory over git branch refs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure

OBJECTIVE_ROOT = ".asdl/objectives"
ObjectiveRecordStatus = Literal["open", "closed"]


@dataclass(frozen=True)
class ObjectiveBranchInventory:
    """Objective records discovered at branch refs."""

    records_by_branch: dict[str, dict[str, ObjectiveRecordStatus]]

    def slugs_on_branch(self, branch: str) -> tuple[str, ...]:
        return tuple(sorted(self.records_by_branch.get(branch, {})))

    def status_on_branch(self, branch: str, slug: str) -> ObjectiveRecordStatus | None:
        return self.records_by_branch.get(branch, {}).get(slug)

    def branch_has_slug(self, branch: str, slug: str) -> bool:
        return slug in self.records_by_branch.get(branch, {})


def branch_ref(branch: str) -> str:
    return f"refs/heads/{branch}"


def branches_to_scan(
    local_branches: tuple[str, ...],
    *,
    base_branch: str,
    status_source_branch: str | None,
) -> tuple[str, ...]:
    branches = set(local_branches)
    branches.add(base_branch)
    if status_source_branch is not None:
        branches.add(status_source_branch)
    return tuple(sorted(branches))


def build_objective_branch_inventory(
    git: GitGateway,
    branches: tuple[str, ...],
) -> ObjectiveBranchInventory:
    refs_by_branch = {branch: branch_ref(branch) for branch in branches}
    tree_oids_result = git.tree_oids_at_refs(tuple(refs_by_branch.values()), OBJECTIVE_ROOT)
    if isinstance(tree_oids_result, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_objective_tree_oid_failed",
            message=tree_oids_result.message,
        )

    records_by_tree_oid: dict[str, dict[str, ObjectiveRecordStatus]] = {}
    records_by_branch: dict[str, dict[str, ObjectiveRecordStatus]] = {}
    for branch, ref in refs_by_branch.items():
        tree_oid = tree_oids_result.get(ref)
        if tree_oid is None:
            records_by_branch[branch] = {}
            continue
        if tree_oid not in records_by_tree_oid:
            records_by_tree_oid[tree_oid] = _objective_statuses_at_ref(git, ref)
        records_by_branch[branch] = dict(records_by_tree_oid[tree_oid])
    return ObjectiveBranchInventory(records_by_branch=records_by_branch)


def _objective_statuses_at_ref(
    git: GitGateway,
    ref: str,
) -> dict[str, ObjectiveRecordStatus]:
    paths_result = git.list_tracked_paths_at_ref(ref, OBJECTIVE_ROOT)
    if isinstance(paths_result, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_list_objective_paths_failed",
            message=paths_result.message,
        )
    return dict(objective_statuses_from_paths(paths_result))


def objective_statuses_from_paths(
    paths: tuple[str, ...],
) -> tuple[tuple[str, ObjectiveRecordStatus], ...]:
    slugs: set[str] = set()
    closed_slugs: set[str] = set()
    prefix = f"{OBJECTIVE_ROOT}/"

    for path in paths:
        if not path.startswith(prefix):
            continue
        rest = path.removeprefix(prefix)
        slug, separator, child_path = rest.partition("/")
        if slug == "" or separator == "":
            continue
        slugs.add(slug)
        if child_path == "closed.md":
            closed_slugs.add(slug)

    return tuple((slug, "closed" if slug in closed_slugs else "open") for slug in sorted(slugs))
