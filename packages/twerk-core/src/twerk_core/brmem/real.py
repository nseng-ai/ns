"""Real git-ref-backed branch memory gateway."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from twerk_core.brmem.gateway import (
    BRMEM_BASE_SEGMENT,
    BRMEM_CONTENT_PATH,
    BRMEM_NS_SEGMENT,
    BRMEM_REF_PREFIX,
    BranchMemoryGateway,
    BrmemCopyConflictError,
    EntryDiagnostic,
    EntryRef,
    InvalidBranchNameError,
    encode_branch_segment,
    parse_entry_ref,
    ref_name_for_entry,
    validate_branch_name,
    validate_namespace,
)
from twerk_core.brmem.key_validation import validate_key


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


def _parse_source_pairs(
    listing_stdout: str,
    namespace: str,
    branch: str,
) -> list[tuple[EntryRef, str]]:
    """Parse ``git for-each-ref --format='%(refname) %(objectname)'`` output.

    Returns ``(entry, objectname)`` pairs for refs matching ``namespace`` and
    ``branch``, sorted by ``entry.key``. Malformed lines are skipped.
    """
    pairs: list[tuple[EntryRef, str]] = []
    for line in listing_stdout.splitlines():
        refname, _, objectname = line.strip().partition(" ")
        if not refname or not objectname:
            continue
        entry = parse_entry_ref(refname)
        if entry is None:
            continue
        if entry.namespace != namespace or entry.branch != branch:
            continue
        pairs.append((entry, objectname))
    pairs.sort(key=lambda pair: pair[0].key)
    return pairs


def _parse_existing_keys(
    listing_stdout: str,
    namespace: str,
    branch: str,
) -> set[str]:
    """Parse ``git for-each-ref --format='%(refname)'`` output.

    Returns the set of ``entry.key`` values for refs matching ``namespace``
    and ``branch``. Malformed lines are skipped.
    """
    keys: set[str] = set()
    for line in listing_stdout.splitlines():
        entry = parse_entry_ref(line.strip())
        if entry is None:
            continue
        if entry.namespace != namespace or entry.branch != branch:
            continue
        keys.add(entry.key)
    return keys


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

    pairs: list[tuple[str, str]] = []
    for line in result.stdout.splitlines():
        path, _, blob_sha = line.partition("\t")
        if not path or not blob_sha:
            continue
        pairs.append((path, blob_sha))
    return pairs


def _snapshot_ref_name(namespace: str | None, branch: str) -> str:
    """Return the snapshot ref name for ``(namespace, branch)``.

    Produces ``refs/brmem/ns/<namespace>/<encoded-branch>`` for namespaced
    snapshots and ``refs/brmem/base/<encoded-branch>`` for ad-hoc ones. The
    branch is encoded with :func:`encode_branch_segment` so it fits in a single
    ref segment.
    """
    validate_branch_name(branch)
    encoded_branch = encode_branch_segment(branch)
    if namespace is None:
        return f"{BRMEM_REF_PREFIX}/{BRMEM_BASE_SEGMENT}/{encoded_branch}"
    validate_namespace(namespace)
    return f"{BRMEM_REF_PREFIX}/{BRMEM_NS_SEGMENT}/{namespace}/{encoded_branch}"


class RealBranchMemoryGateway(BranchMemoryGateway):
    """Store branch memory under ``refs/brmem/base/...`` or ``refs/brmem/ns/<ns>/...``."""

    def __init__(self, cwd: Path) -> None:
        self._cwd = cwd

    def list_entries(
        self,
        *,
        namespace: str | None = None,
        key: str | None = None,
        branch: str | None = None,
    ) -> list[EntryRef]:
        if namespace is not None:
            validate_namespace(namespace)
        if key is not None:
            validate_key(key)
        if branch is not None:
            validate_branch_name(branch)

        ref_prefixes = [
            f"{BRMEM_REF_PREFIX}/{BRMEM_BASE_SEGMENT}/",
            f"{BRMEM_REF_PREFIX}/{BRMEM_NS_SEGMENT}/",
        ]
        result = _run(
            ["git", "for-each-ref", "--format=%(refname)", *ref_prefixes],
            cwd=self._cwd,
            check=False,
        )
        if result.returncode != 0:
            return []

        entries: list[EntryRef] = []
        for line in result.stdout.splitlines():
            ref_name = line.strip()
            if not ref_name:
                continue
            entry = parse_entry_ref(ref_name)
            if entry is None:
                continue
            if namespace is not None and entry.namespace != namespace:
                continue
            if key is not None and entry.key != key:
                continue
            if branch is not None and entry.branch != branch:
                continue
            entries.append(entry)

        entries.sort(key=lambda e: (e.namespace or "", e.key, e.branch))
        return entries

    def put(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        content: str,
    ) -> str:
        ref_name = self._validated_ref_name(namespace, key, branch)

        parent_result = _run(["git", "rev-parse", "--verify", ref_name], cwd=self._cwd, check=False)
        parent_sha = parent_result.stdout.strip() if parent_result.returncode == 0 else None

        blob_sha = _run(
            ["git", "hash-object", "-w", "--stdin"],
            cwd=self._cwd,
            input=content,
        ).stdout.strip()

        mktree_input = f"{_GIT_BLOB_MODE_FILE} blob {blob_sha}\t{BRMEM_CONTENT_PATH}\n"
        tree_sha = _run(
            ["git", "mktree"],
            cwd=self._cwd,
            input=mktree_input,
        ).stdout.strip()

        commit_cmd = ["git", "commit-tree", tree_sha, "-m", f"brmem put {key}"]
        if parent_sha is not None:
            commit_cmd[2:2] = ["-p", parent_sha]
        commit_sha = _run(commit_cmd, cwd=self._cwd).stdout.strip()
        _run(["git", "update-ref", ref_name, commit_sha], cwd=self._cwd)
        return commit_sha

    def get(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> str | None:
        ref_name = self._validated_ref_name(namespace, key, branch)
        target = at if at is not None else ref_name
        result = _run(
            ["git", "show", f"{target}:{BRMEM_CONTENT_PATH}"],
            cwd=self._cwd,
            check=False,
        )
        if result.returncode != 0:
            return None
        return result.stdout

    def check(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> EntryDiagnostic | None:
        ref_name = self._validated_ref_name(namespace, key, branch)
        target = at if at is not None else ref_name

        existence = _run(
            ["git", "cat-file", "-e", f"{target}:{BRMEM_CONTENT_PATH}"],
            cwd=self._cwd,
            check=False,
        )
        if existence.returncode != 0:
            return None

        blob_sha = _run(
            ["git", "rev-parse", f"{target}:{BRMEM_CONTENT_PATH}"],
            cwd=self._cwd,
        ).stdout.strip()
        size_bytes = int(
            _run(
                ["git", "cat-file", "-s", f"{target}:{BRMEM_CONTENT_PATH}"],
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
        overwrite: bool = False,
    ) -> tuple[EntryRef, ...]:
        validate_namespace(namespace)
        validate_branch_name(from_branch)
        validate_branch_name(to_branch)

        source_prefix = (
            f"{BRMEM_REF_PREFIX}/{BRMEM_NS_SEGMENT}/{namespace}/"
            f"{encode_branch_segment(from_branch)}/"
        )
        listing = _run(
            ["git", "for-each-ref", "--format=%(refname) %(objectname)", source_prefix],
            cwd=self._cwd,
            check=False,
        )
        if listing.returncode != 0:
            return ()

        source_pairs = _parse_source_pairs(listing.stdout, namespace, from_branch)

        if not source_pairs:
            return ()

        existing_dest: set[str] = set()
        if not overwrite:
            dest_listing = _run(
                [
                    "git",
                    "for-each-ref",
                    "--format=%(refname)",
                    (
                        f"{BRMEM_REF_PREFIX}/{BRMEM_NS_SEGMENT}/{namespace}/"
                        f"{encode_branch_segment(to_branch)}/"
                    ),
                ],
                cwd=self._cwd,
                check=False,
            )
            if dest_listing.returncode == 0:
                existing_dest = _parse_existing_keys(dest_listing.stdout, namespace, to_branch)

        source_keys = {entry.key for entry, _ in source_pairs}
        conflicts = tuple(
            EntryRef(
                namespace=namespace,
                key=key,
                branch=to_branch,
                ref_name=ref_name_for_entry(namespace, key, to_branch),
            )
            for key in sorted(source_keys & existing_dest)
        )
        if conflicts and not overwrite:
            raise BrmemCopyConflictError(conflicts)

        stdin_lines: list[str] = []
        dest_entries: list[EntryRef] = []
        for entry, sha in source_pairs:
            dest_ref = ref_name_for_entry(namespace, entry.key, to_branch)
            verb = "update" if overwrite else "create"
            stdin_lines.append(f"{verb} {dest_ref} {sha}\n")
            dest_entries.append(
                EntryRef(
                    namespace=namespace,
                    key=entry.key,
                    branch=to_branch,
                    ref_name=dest_ref,
                )
            )

        _run(
            ["git", "update-ref", "--stdin"],
            cwd=self._cwd,
            input="".join(stdin_lines),
        )
        return tuple(dest_entries)

    def _validated_ref_name(self, namespace: str | None, key: str, branch: str) -> str:
        ref_name = ref_name_for_entry(namespace, key, branch)
        validation = _run(
            ["git", "check-ref-format", "--branch", branch],
            cwd=self._cwd,
            check=False,
        )
        if validation.returncode != 0:
            details = (
                validation.stderr.strip() or validation.stdout.strip() or "invalid git branch name"
            )
            raise InvalidBranchNameError(branch, details)
        return ref_name
