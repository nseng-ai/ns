"""Real git-ref-backed branch memory gateway (snapshot-tree model).

Each ``(namespace, branch)`` pair maps to a single snapshot ref
(``refs/brmem/ns/<ns>/<encoded-branch>`` or
``refs/brmem/base/<encoded-branch>``) whose commit tree holds every entry as
a blob at path ``<key>``. Consecutive ``put`` calls on the same snapshot ref
form a linear history on that ref.
"""

from __future__ import annotations

import fnmatch
import os
import subprocess
import tempfile
from pathlib import Path

import brmem.ref_layout as ref_layout
from brmem.gateway import (
    BranchMemoryGateway,
    BrmemCopyConflictError,
    EntryDiagnostic,
    KeyNotFoundError,
)
from brmem.key_validation import validate_key
from brmem.validation import validate_key_glob


def _run(
    cmd: list[str],
    *,
    cwd: Path,
    check: bool = True,
    input: str | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=check,
        input=input,
    )


# Git's canonical empty-tree object SHA-1: the hash of a tree containing zero
# entries. It's a well-known constant — every SHA-1 git repository has this
# exact hash for the empty tree, and git treats it as implicitly present even
# when not stored.
_EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

# Git tree-entry mode for a regular (non-executable) file. Git encodes each
# tree entry's mode as six octal digits: ``100644`` means a regular file with
# ``rw-r--r--`` permissions. Contrast with ``100755`` (executable file),
# ``040000`` (tree), ``120000`` (symlink), ``160000`` (gitlink / submodule).
_GIT_BLOB_MODE_FILE = "100644"


def _build_tree_from_entries(cwd: Path, entries: dict[str, str]) -> str:
    """Build a git tree from ``{path: blob_sha}`` and return the tree SHA.

    Uses a temporary ``GIT_INDEX_FILE`` plus ``git update-index
    --add --cacheinfo 100644,<blob-sha>,<path>`` followed by ``git write-tree``.
    ``path`` may be nested (e.g. ``foo/body.md``); ``git write-tree`` builds
    subtrees as needed. An empty ``entries`` dict returns git's canonical
    empty-tree SHA without invoking git.
    """
    if not entries:
        return _EMPTY_TREE_SHA

    # Git refuses to read an empty file as an index ("index file smaller than
    # expected"), so we point ``GIT_INDEX_FILE`` at a path that does not yet
    # exist inside a fresh temp directory and let git create it on first write.
    tmp_dir = Path(tempfile.mkdtemp(prefix="brmem-index-"))
    index_path = tmp_dir / "index"
    try:
        env = {**os.environ, "GIT_INDEX_FILE": str(index_path)}
        for path, blob_sha in entries.items():
            subprocess.run(
                [
                    "git",
                    "update-index",
                    "--add",
                    "--cacheinfo",
                    f"{_GIT_BLOB_MODE_FILE},{blob_sha},{path}",
                ],
                cwd=cwd,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
        result = subprocess.run(
            ["git", "write-tree"],
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    finally:
        index_path.unlink(missing_ok=True)
        tmp_dir.rmdir()


def _parse_ls_tree_lines(stdout: str) -> list[tuple[str, str]]:
    """Parse ``git ls-tree --format=%(path)%x09%(objectname)`` output.

    Returns ``(path, blob_sha)`` pairs in input order, skipping malformed or
    empty lines. ``path`` and ``blob_sha`` are separated by a single tab
    (``%x09`` in git's format language).

    Examples:
        >>> _parse_ls_tree_lines("body.md\\tabc123\\nfoo/bar.md\\tdef456\\n")
        [('body.md', 'abc123'), ('foo/bar.md', 'def456')]
        >>> _parse_ls_tree_lines("")
        []
        >>> _parse_ls_tree_lines("malformed-no-tab\\n")
        []
    """
    pairs: list[tuple[str, str]] = []
    for line in stdout.splitlines():
        path, _, blob_sha = line.partition("\t")
        if not path or not blob_sha:
            continue
        pairs.append((path, blob_sha))
    return pairs


def _enumerate_tree_entries(cwd: Path, ref_or_tree: str) -> list[tuple[str, str]]:
    """Return ``(path, blob_sha)`` pairs for every blob reachable from ``ref_or_tree``.

    Uses ``git ls-tree -r --format=%(path)%x09%(objectname)``. Returns an empty
    list when the ref or tree does not exist.
    """
    result = _run(
        [
            "git",
            "ls-tree",
            "-r",
            "--format=%(path)%x09%(objectname)",
            ref_or_tree,
        ],
        cwd=cwd,
        check=False,
    )
    if result.returncode != 0:
        return []

    return _parse_ls_tree_lines(result.stdout)


class RealBranchMemoryGateway(BranchMemoryGateway):
    """Store branch memory under snapshot refs rooted at ``refs/brmem/``."""

    def __init__(self, cwd: Path) -> None:
        self._cwd = cwd

    def list_entries(
        self,
        *,
        namespace: str | None = None,
        key: str | None = None,
        branch: str | None = None,
    ) -> list[ref_layout.EntryRef]:
        if namespace is not None:
            ref_layout.validate_namespace(namespace)
        if key is not None:
            validate_key(key)
        if branch is not None:
            ref_layout.validate_branch_name(branch)

        ref_prefixes = ref_layout.snapshot_ref_prefixes()
        result = _run(
            ["git", "for-each-ref", "--format=%(refname)", *ref_prefixes],
            cwd=self._cwd,
            check=False,
        )
        if result.returncode != 0:
            return []

        entries: list[ref_layout.EntryRef] = []
        for line in result.stdout.splitlines():
            snapshot_ref = line.strip()
            if not snapshot_ref:
                continue
            parsed = ref_layout.parse_snapshot_ref(snapshot_ref)
            if parsed is None:
                continue
            if namespace is not None and parsed.namespace != namespace:
                continue
            if branch is not None and parsed.branch != branch:
                continue

            for path, _blob_sha in _enumerate_tree_entries(self._cwd, snapshot_ref):
                if key is not None and path != key:
                    continue
                entries.append(
                    ref_layout.EntryRef(
                        namespace=parsed.namespace,
                        key=path,
                        branch=parsed.branch,
                        ref_name=ref_layout.ref_name_for_entry(
                            parsed.namespace, path, parsed.branch
                        ),
                    )
                )

        entries.sort(key=lambda e: (e.namespace or "", e.key, e.branch))
        return entries

    def put(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        content: str,
    ) -> str:
        validate_key(key)
        self._check_branch_ref_format(branch)
        snapshot_ref = ref_layout.snapshot_ref_name(namespace, branch)

        parent_result = _run(
            ["git", "rev-parse", "--verify", snapshot_ref],
            cwd=self._cwd,
            check=False,
        )
        parent_sha = parent_result.stdout.strip() if parent_result.returncode == 0 else None

        # Snapshot inheritance: build on top of the parent tree so unrelated
        # keys are preserved across puts.
        if parent_sha is not None:
            existing = dict(_enumerate_tree_entries(self._cwd, snapshot_ref))
        else:
            existing = {}

        blob_sha = _run(
            ["git", "hash-object", "-w", "--stdin"],
            cwd=self._cwd,
            input=content,
        ).stdout.strip()
        existing[key] = blob_sha

        tree_sha = _build_tree_from_entries(self._cwd, existing)

        commit_cmd = ["git", "commit-tree", tree_sha, "-m", f"brmem put {key}"]
        if parent_sha is not None:
            commit_cmd[2:2] = ["-p", parent_sha]
        commit_sha = _run(commit_cmd, cwd=self._cwd).stdout.strip()
        _run(["git", "update-ref", snapshot_ref, commit_sha], cwd=self._cwd)
        return commit_sha

    def get(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> str | None:
        validate_key(key)
        self._check_branch_ref_format(branch)
        snapshot_ref = ref_layout.snapshot_ref_name(namespace, branch)
        target = at if at is not None else snapshot_ref
        result = _run(
            ["git", "show", f"{target}:{key}"],
            cwd=self._cwd,
            check=False,
        )
        if result.returncode != 0:
            return None
        return result.stdout

    def delete(
        self,
        namespace: str | None,
        key: str,
        branch: str,
    ) -> str:
        validate_key(key)
        self._check_branch_ref_format(branch)
        snapshot_ref = ref_layout.snapshot_ref_name(namespace, branch)

        parent_result = _run(
            ["git", "rev-parse", "--verify", snapshot_ref],
            cwd=self._cwd,
            check=False,
        )
        if parent_result.returncode != 0:
            raise KeyNotFoundError(namespace, key, branch)
        parent_sha = parent_result.stdout.strip()

        existing = dict(_enumerate_tree_entries(self._cwd, snapshot_ref))
        if key not in existing:
            raise KeyNotFoundError(namespace, key, branch)
        del existing[key]

        tree_sha = _build_tree_from_entries(self._cwd, existing)
        commit_sha = _run(
            ["git", "commit-tree", tree_sha, "-p", parent_sha, "-m", f"brmem delete {key}"],
            cwd=self._cwd,
        ).stdout.strip()
        _run(["git", "update-ref", snapshot_ref, commit_sha], cwd=self._cwd)
        return commit_sha

    def check(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> EntryDiagnostic | None:
        validate_key(key)
        self._check_branch_ref_format(branch)
        snapshot_ref = ref_layout.snapshot_ref_name(namespace, branch)
        target = at if at is not None else snapshot_ref

        existence = _run(
            ["git", "cat-file", "-e", f"{target}:{key}"],
            cwd=self._cwd,
            check=False,
        )
        if existence.returncode != 0:
            return None

        blob_sha = _run(
            ["git", "rev-parse", f"{target}:{key}"],
            cwd=self._cwd,
        ).stdout.strip()
        size_bytes = int(
            _run(
                ["git", "cat-file", "-s", f"{target}:{key}"],
                cwd=self._cwd,
            ).stdout.strip()
        )
        log = _run(
            ["git", "log", "-1", "--format=%H%x09%cI", target],
            cwd=self._cwd,
        )
        head_sha, _, head_date = log.stdout.strip().partition("\t")
        return EntryDiagnostic(
            head_sha=head_sha,
            head_date=head_date,
            blob_sha=blob_sha,
            size_bytes=size_bytes,
        )

    def copy_entries(
        self,
        *,
        namespace: str,
        from_branch: str,
        to_branch: str,
        overwrite: bool,
        key_glob: str | None,
    ) -> tuple[ref_layout.EntryRef, ...]:
        ref_layout.validate_namespace(namespace)
        ref_layout.validate_branch_name(from_branch)
        ref_layout.validate_branch_name(to_branch)
        if key_glob is not None:
            validate_key_glob(key_glob)

        source_ref = ref_layout.snapshot_ref_name(namespace, from_branch)
        source_sha_result = _run(
            ["git", "rev-parse", "--verify", source_ref],
            cwd=self._cwd,
            check=False,
        )
        if source_sha_result.returncode != 0:
            return ()
        source_sha = source_sha_result.stdout.strip()

        dest_ref = ref_layout.snapshot_ref_name(namespace, to_branch)
        dest_sha_result = _run(
            ["git", "rev-parse", "--verify", dest_ref],
            cwd=self._cwd,
            check=False,
        )
        dest_sha: str | None = (
            dest_sha_result.stdout.strip() if dest_sha_result.returncode == 0 else None
        )

        if key_glob is None:
            return self._copy_snapshot(
                namespace=namespace,
                to_branch=to_branch,
                source_ref=source_ref,
                source_sha=source_sha,
                dest_ref=dest_ref,
                dest_sha=dest_sha,
                overwrite=overwrite,
            )

        return self._copy_with_glob(
            namespace=namespace,
            from_branch=from_branch,
            to_branch=to_branch,
            source_ref=source_ref,
            dest_ref=dest_ref,
            dest_sha=dest_sha,
            overwrite=overwrite,
            key_glob=key_glob,
        )

    def _copy_snapshot(
        self,
        *,
        namespace: str,
        to_branch: str,
        source_ref: str,
        source_sha: str,
        dest_ref: str,
        dest_sha: str | None,
        overwrite: bool,
    ) -> tuple[ref_layout.EntryRef, ...]:
        if dest_sha is not None and not overwrite:
            # Conflict is snapshot-level; the EntryRefs we surface describe
            # every key that currently lives on the destination snapshot and
            # would be overwritten.
            conflicts = tuple(
                ref_layout.EntryRef(
                    namespace=namespace,
                    key=path,
                    branch=to_branch,
                    ref_name=ref_layout.ref_name_for_entry(namespace, path, to_branch),
                )
                for path, _blob_sha in sorted(
                    _enumerate_tree_entries(self._cwd, dest_ref),
                    key=lambda pair: pair[0],
                )
            )
            raise BrmemCopyConflictError(conflicts)

        _run(
            ["git", "update-ref", dest_ref, source_sha],
            cwd=self._cwd,
        )

        return tuple(
            ref_layout.EntryRef(
                namespace=namespace,
                key=path,
                branch=to_branch,
                ref_name=ref_layout.ref_name_for_entry(namespace, path, to_branch),
            )
            for path, _blob_sha in sorted(
                _enumerate_tree_entries(self._cwd, source_ref),
                key=lambda pair: pair[0],
            )
        )

    def _copy_with_glob(
        self,
        *,
        namespace: str,
        from_branch: str,
        to_branch: str,
        source_ref: str,
        dest_ref: str,
        dest_sha: str | None,
        overwrite: bool,
        key_glob: str,
    ) -> tuple[ref_layout.EntryRef, ...]:
        source_matching = [
            (path, blob_sha)
            for path, blob_sha in _enumerate_tree_entries(self._cwd, source_ref)
            if fnmatch.fnmatchcase(path, key_glob)
        ]
        if not source_matching:
            return ()

        if dest_sha is not None:
            dest_tree = _enumerate_tree_entries(self._cwd, dest_ref)
        else:
            dest_tree = []
        dest_matching = {
            path: blob_sha for path, blob_sha in dest_tree if fnmatch.fnmatchcase(path, key_glob)
        }
        dest_non_matching = {
            path: blob_sha
            for path, blob_sha in dest_tree
            if not fnmatch.fnmatchcase(path, key_glob)
        }

        if dest_matching and not overwrite:
            conflicts = tuple(
                ref_layout.EntryRef(
                    namespace=namespace,
                    key=path,
                    branch=to_branch,
                    ref_name=ref_layout.ref_name_for_entry(namespace, path, to_branch),
                )
                for path in sorted(dest_matching)
            )
            raise BrmemCopyConflictError(conflicts)

        merged: dict[str, str] = dict(dest_non_matching)
        for path, blob_sha in source_matching:
            merged[path] = blob_sha

        tree_sha = _build_tree_from_entries(self._cwd, merged)
        commit_cmd = [
            "git",
            "commit-tree",
            tree_sha,
            "-m",
            (
                f"brmem copy --namespace {namespace} --from-branch {from_branch} "
                f"--to-branch {to_branch} --key-glob {key_glob}"
            ),
        ]
        if dest_sha is not None:
            commit_cmd[2:2] = ["-p", dest_sha]
        new_commit_sha = _run(commit_cmd, cwd=self._cwd).stdout.strip()
        _run(["git", "update-ref", dest_ref, new_commit_sha], cwd=self._cwd)

        return tuple(
            ref_layout.EntryRef(
                namespace=namespace,
                key=path,
                branch=to_branch,
                ref_name=ref_layout.ref_name_for_entry(namespace, path, to_branch),
            )
            for path, _blob_sha in sorted(source_matching, key=lambda pair: pair[0])
        )

    def _check_branch_ref_format(self, branch: str) -> None:
        ref_layout.validate_branch_name(branch)
        validation = _run(
            ["git", "check-ref-format", "--branch", branch],
            cwd=self._cwd,
            check=False,
        )
        if validation.returncode != 0:
            details = (
                validation.stderr.strip() or validation.stdout.strip() or "invalid git branch name"
            )
            raise ref_layout.InvalidBranchNameError(branch, details)
