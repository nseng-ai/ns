"""Git subprocess output conversion helpers for the real Git gateway."""

from __future__ import annotations

from pathlib import Path

from asdl_core.git.types import (
    CommitGraphNode,
    CommitSummary,
    FileStatus,
    GitCommandFailure,
    LocalBranchTip,
    LocalBranchTipRef,
    PathChangeTouch,
    PathTouch,
    RestructuredFile,
    WorktreeInfo,
)


def parse_porcelain_status(stdout: str) -> FileStatus:
    """Parse ``git status --porcelain`` output into a ``FileStatus``."""

    staged = False
    modified = False
    untracked = False
    for line in stdout.splitlines():
        if len(line) < 2:
            continue
        index = line[0]
        worktree = line[1]
        if index == "?" and worktree == "?":
            untracked = True
        else:
            if index != " ":
                staged = True
            if worktree != " ":
                modified = True
    return FileStatus(staged=staged, modified=modified, untracked=untracked)


def parse_local_branch_tip_output(stdout: str) -> tuple[LocalBranchTip, ...]:
    """Parse NUL-delimited local branch tip output from ``git for-each-ref``."""

    tips: list[LocalBranchTip] = []
    for raw_line in stdout.splitlines():
        if not raw_line:
            continue
        name, separator, head_iso = raw_line.partition("\x00")
        if separator == "" or name == "":
            continue
        tips.append(LocalBranchTip(name=name, head_iso=head_iso or None))
    return tuple(tips)


def parse_local_branch_tip_ref_output(stdout: str) -> tuple[LocalBranchTipRef, ...]:
    """Parse NUL-delimited local branch tip OID output from ``git for-each-ref``."""

    tips: list[LocalBranchTipRef] = []
    for raw_line in stdout.splitlines():
        if not raw_line:
            continue
        name, separator, oid = raw_line.partition("\x00")
        if separator == "" or name == "" or oid == "":
            continue
        tips.append(LocalBranchTipRef(branch=name, oid=oid))
    return tuple(tips)


def parse_commit_graph_output(stdout: str) -> tuple[CommitGraphNode, ...]:
    """Parse ``git rev-list --parents`` output into commit graph nodes."""

    nodes: list[CommitGraphNode] = []
    for raw_line in stdout.splitlines():
        parts = raw_line.split()
        if not parts:
            continue
        nodes.append(CommitGraphNode(oid=parts[0], parent_oids=tuple(parts[1:])))
    return tuple(nodes)


def parse_tree_oid_batch_check_output(
    stdout: str,
    refs: tuple[str, ...],
) -> dict[str, str | None] | GitCommandFailure:
    """Parse ``git cat-file --batch-check`` tree oid output for refs."""

    lines = stdout.splitlines()
    if len(lines) != len(refs):
        return GitCommandFailure(
            message="git cat-file returned an unexpected number of rows",
            returncode=0,
        )

    tree_oids: dict[str, str | None] = {}
    for ref, raw_line in zip(refs, lines, strict=True):
        parts = raw_line.split()
        if len(parts) != 2:
            tree_oids[ref] = None
            continue
        object_name, object_type = parts
        if object_type == "tree":
            tree_oids[ref] = object_name
        else:
            tree_oids[ref] = None
    return tree_oids


def parse_worktree_list_output(stdout: str) -> tuple[WorktreeInfo, ...]:
    """Parse ``git worktree list --porcelain`` output into ``WorktreeInfo`` tuples."""

    worktrees: list[WorktreeInfo] = []
    current_path: Path | None = None
    current_branch: str | None = None
    current_bare = False

    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if line.startswith("worktree "):
            current_path = Path(line.split(maxsplit=1)[1])
            current_branch = None
            current_bare = False
        elif line.startswith("branch "):
            if current_path is None:
                continue
            current_branch = line.split(maxsplit=1)[1].replace("refs/heads/", "")
        elif line == "bare":
            current_bare = True
        elif line == "" and current_path is not None:
            worktrees.append(
                WorktreeInfo(path=current_path, branch=current_branch, is_bare=current_bare)
            )
            current_path = None
            current_branch = None
            current_bare = False

    if current_path is not None:
        worktrees.append(
            WorktreeInfo(path=current_path, branch=current_branch, is_bare=current_bare)
        )

    return tuple(worktrees)


def parse_path_touch_output(stdout: str) -> PathTouch | None:
    """Parse one NUL-delimited ``git log`` path-touch row."""

    raw = stdout.strip()
    if not raw:
        return None
    oid, separator, committed_iso = raw.partition("\x00")
    if separator == "" or oid == "" or committed_iso == "":
        return None
    return PathTouch(oid=oid, committed_iso=committed_iso)


def parse_path_change_touches_output(stdout: str, path: str) -> tuple[PathChangeTouch, ...]:
    """Parse ``git log --format=%H%x00%cI --name-status -M`` path touch output."""

    touches: list[PathChangeTouch] = []
    current_oid: str | None = None
    current_committed_iso: str | None = None
    current_paths: list[str] = []

    def flush_current() -> None:
        if current_oid is None or current_committed_iso is None or not current_paths:
            return
        touches.append(
            PathChangeTouch(
                oid=current_oid,
                committed_iso=current_committed_iso,
                paths=tuple(current_paths),
            )
        )

    for raw_line in stdout.splitlines():
        if "\x00" in raw_line:
            flush_current()
            current_paths = []
            oid, separator, committed_iso = raw_line.partition("\x00")
            if separator == "" or oid == "" or committed_iso == "":
                current_oid = None
                current_committed_iso = None
            else:
                current_oid = oid
                current_committed_iso = committed_iso
            continue

        if raw_line == "" or current_oid is None or current_committed_iso is None:
            continue
        for changed_path in _path_change_paths(raw_line):
            if _path_is_under(changed_path, path):
                current_paths.append(changed_path)

    flush_current()
    return tuple(touches)


def _path_change_paths(raw_line: str) -> tuple[str, ...]:
    if "\t" not in raw_line:
        return (raw_line,)

    parts = raw_line.split("\t")
    if not parts or parts[0] == "":
        return ()

    status = parts[0][:1]
    if status in {"R", "C"}:
        if len(parts) < 3:
            return ()
        return (parts[1], parts[2])

    if len(parts) < 2:
        return ()
    return (parts[1],)


def _path_is_under(candidate: str, path: str) -> bool:
    normalized = path.rstrip("/")
    return candidate == normalized or candidate.startswith(f"{normalized}/")


def parse_log_range_output(stdout: str) -> tuple[CommitSummary, ...]:
    """Parse NUL-delimited ``git log --format=%H%x00%aI%x00%s`` output.

    Each commit is one line of three NUL-delimited fields. Empty stdout (no
    commits in range) yields an empty tuple. Lines that do not contain the
    expected two NUL separators are skipped defensively.
    """
    commits: list[CommitSummary] = []
    for raw_line in stdout.splitlines():
        if not raw_line:
            continue
        parts = raw_line.split("\x00")
        if len(parts) != 3:
            continue
        sha, author_iso, subject = parts
        commits.append(CommitSummary(sha=sha, author_iso=author_iso, subject=subject))
    return tuple(commits)


def parse_patch_id_output(stdout: str) -> tuple[tuple[str, str], ...]:
    """Parse ``git patch-id --stable`` output into ``(sha, patch_id)`` pairs.

    Each non-empty line is ``<patch_id> <sha>``; commits with empty diffs
    produce no line at all. Lines that do not match are skipped defensively.
    """
    pairs: list[tuple[str, str]] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        patch_id, sha = parts[0], parts[1]
        pairs.append((sha, patch_id))
    return tuple(pairs)


def parse_name_status_output(stdout: str) -> tuple[RestructuredFile, ...]:
    """Parse ``git diff --name-status -M -C`` output into structured records."""

    files: list[RestructuredFile] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        parts = line.split("\t")
        if len(parts) < 3:
            continue

        raw_status = parts[0]
        status = raw_status[:1]
        if status not in {"R", "C"}:
            continue

        similarity_text = raw_status[1:] or "100"
        try:
            similarity = int(similarity_text)
        except ValueError:
            similarity = 100

        files.append(
            RestructuredFile(
                status=status,
                old_path=parts[1],
                new_path=parts[2],
                similarity=similarity,
            )
        )

    return tuple(files)
