"""Real git-ref-backed branch memory gateway."""

from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_core.brmem.gateway import (
    BRMEM_CONTENT_PATH,
    BranchMemoryGateway,
    EntryDiagnostic,
    EntryRef,
    InvalidBranchNameError,
    parse_entry_ref,
    ref_name_for_entry,
    validate_branch_name,
    validate_key,
    validate_namespace,
)


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


class RealBranchMemoryGateway(BranchMemoryGateway):
    """Store branch memory in ``refs/brmem/<namespace>/<encoded-branch>/<key>``."""

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

        result = _run(
            ["git", "for-each-ref", "--format=%(refname)", "refs/brmem/"],
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

        entries.sort(key=lambda e: (e.namespace, e.key, e.branch))
        return entries

    def put(
        self,
        namespace: str,
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

        mktree_input = f"100644 blob {blob_sha}\t{BRMEM_CONTENT_PATH}\n"
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
        namespace: str,
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
        namespace: str,
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

    def _validated_ref_name(self, namespace: str, key: str, branch: str) -> str:
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
