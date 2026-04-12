"""Repository discovery for slots.

Walks up from the current working directory to locate a git repository and
derives the per-repo metadata paths under ``~/.slots/repos/{repo_name}/``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from twerk_slots.gateway.git import GitGateway
from twerk_slots.gateway.storage import SlotsStorageGateway

SLOTS_ROOT = Path.home() / ".slots"


@dataclass(frozen=True)
class RepoContext:
    """Resolved paths for a git repository under slots management.

    For worktrees, ``root`` is the active working tree while ``main_repo_root``
    is the primary repository (which drives ``repo_name`` so metadata paths
    remain stable across all worktrees of the same repo).
    """

    root: Path
    main_repo_root: Path
    repo_name: str
    repo_dir: Path
    worktrees_dir: Path
    pool_json_path: Path


@dataclass(frozen=True)
class NoRepoSentinel:
    """Returned when ``cwd`` is not inside a git repository."""

    message: str


def discover_repo_or_sentinel(
    cwd: Path,
    *,
    slots_root: Path,
    git: GitGateway,
) -> RepoContext | NoRepoSentinel:
    """Locate the git repository containing ``cwd`` and build a RepoContext."""
    if not git.path_exists(cwd):
        return NoRepoSentinel(message=f"Start path '{cwd}' does not exist")

    cur = cwd.resolve()

    git_common_dir = git.get_git_common_dir(cur)
    if git_common_dir is None:
        return NoRepoSentinel(message="Not inside a git repository (no .git found up the tree)")

    main_repo_root = git_common_dir.parent.resolve()
    root = git.get_repository_root(cur)

    repo_name = main_repo_root.name
    repo_dir = slots_root / "repos" / repo_name
    worktrees_dir = repo_dir / "worktrees"
    pool_json_path = repo_dir / "pool.json"

    return RepoContext(
        root=root,
        main_repo_root=main_repo_root,
        repo_name=repo_name,
        repo_dir=repo_dir,
        worktrees_dir=worktrees_dir,
        pool_json_path=pool_json_path,
    )


def ensure_slots_metadata_dir(
    repo: RepoContext,
    storage: SlotsStorageGateway,
) -> Path:
    """Create ``repo.repo_dir`` and ``repo.worktrees_dir`` if missing."""
    storage.ensure_dir(repo.repo_dir)
    storage.ensure_dir(repo.worktrees_dir)
    return repo.repo_dir
