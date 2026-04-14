from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from twerk_oneshot.gateways.github_queue.gateway import (
    BranchCommitRequest,
    BranchCommitResult,
    DraftPullRequestRequest,
    GitHubQueueGateway,
    PullRequestSummary,
    RepositoryContext,
)


class RealGitHubQueueGateway(GitHubQueueGateway):
    def __init__(
        self,
        *,
        repo_root: Path | None = None,
        temp_root: Path | None = None,
    ) -> None:
        self._repo_root = repo_root or Path.cwd()
        self._temp_root = temp_root

    def get_repository_context(self) -> RepositoryContext:
        repo_view = _run(
            ["gh", "repo", "view", "--json", "owner,name,url,defaultBranchRef"],
            cwd=self._repo_root,
        )
        owner_repo = json.loads(repo_view.stdout)
        user = _run(["gh", "api", "user", "--jq", ".login"], cwd=self._repo_root).stdout.strip()
        return RepositoryContext(
            owner=owner_repo["owner"]["login"],
            name=owner_repo["name"],
            url=owner_repo["url"],
            default_branch=owner_repo["defaultBranchRef"]["name"],
            authenticated_user=user,
        )

    def create_branch_commit_and_push(self, request: BranchCommitRequest) -> BranchCommitResult:
        _run(["git", "fetch", "origin", request.base_branch], cwd=self._repo_root)

        with tempfile.TemporaryDirectory(dir=self._temp_root) as temp_dir:
            worktree_path = Path(temp_dir) / "worktree"
            worktree_created = False
            try:
                _run(
                    [
                        "git",
                        "worktree",
                        "add",
                        "-b",
                        request.branch_name,
                        str(worktree_path),
                        f"origin/{request.base_branch}",
                    ],
                    cwd=self._repo_root,
                )
                worktree_created = True
                for relative_path, content in request.files.items():
                    destination = worktree_path / relative_path
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_text(content, encoding="utf-8")

                _run(["git", "add", *sorted(request.files)], cwd=worktree_path)
                _run(["git", "commit", "-m", request.commit_message], cwd=worktree_path)
                commit_sha = _run(["git", "rev-parse", "HEAD"], cwd=worktree_path).stdout.strip()
                _run(["git", "push", "-u", "origin", request.branch_name], cwd=worktree_path)
                return BranchCommitResult(branch_name=request.branch_name, commit_sha=commit_sha)
            finally:
                if worktree_created:
                    _run(
                        ["git", "worktree", "remove", "--force", str(worktree_path)],
                        cwd=self._repo_root,
                    )

    def create_draft_pull_request(
        self,
        request: DraftPullRequestRequest,
    ) -> PullRequestSummary:
        _run(
            [
                "gh",
                "pr",
                "create",
                "--draft",
                "--base",
                request.base_branch,
                "--head",
                request.branch_name,
                "--title",
                request.title,
                "--body",
                request.body,
            ],
            cwd=self._repo_root,
        )
        result = _run(
            [
                "gh",
                "pr",
                "view",
                request.branch_name,
                "--json",
                "number,url,title,headRefName,baseRefName",
            ],
            cwd=self._repo_root,
        )
        payload = json.loads(result.stdout)
        return PullRequestSummary(
            number=payload["number"],
            url=payload["url"],
            title=payload["title"],
            head_ref_name=payload["headRefName"],
            base_ref_name=payload["baseRefName"],
        )


def _run(command: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=True,
        cwd=cwd,
    )
