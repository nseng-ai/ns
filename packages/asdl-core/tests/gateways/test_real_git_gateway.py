from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_core.git import real_git_gateway
from asdl_core.git.real_git_gateway import (
    RealGitGateway,
    parse_commit_graph_output,
    parse_local_branch_tip_output,
    parse_local_branch_tip_ref_output,
    parse_name_status_output,
    parse_path_change_touches_output,
    parse_path_touch_output,
    parse_tree_oid_batch_check_output,
)
from asdl_core.git.types import (
    BranchCommitGraph,
    CommitGraphNode,
    DetachedHead,
    GitCommandFailure,
    LocalBranchTip,
    LocalBranchTipRef,
    PathChangeTouch,
    PathTouch,
    RestructuredFile,
)


def test_get_current_branch_returns_branch_name(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == ["git", "symbolic-ref", "--short", "HEAD"]
        return subprocess.CompletedProcess(cmd, 0, stdout="feature\n", stderr="")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_current_branch(Path("/repo")) == "feature"


def test_get_current_branch_returns_detached_head(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            cmd,
            128,
            stdout="",
            stderr="fatal: ref HEAD is not a symbolic ref",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_current_branch(Path("/repo")) == DetachedHead()


def test_get_current_branch_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            cmd,
            128,
            stdout="",
            stderr="fatal: not a git repository",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_current_branch(Path("/repo")) == GitCommandFailure(
        message="fatal: not a git repository",
        returncode=128,
    )


def test_delete_local_branch_invokes_safe_git_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[list[str], Path | None]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        cwd = kwargs.get("cwd")
        assert cwd is None or isinstance(cwd, Path)
        calls.append((cmd, cwd))
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    result = RealGitGateway(repo_root=Path("/repo")).delete_local_branch("feature", force=False)

    assert result is None
    assert calls == [(["git", "branch", "-d", "feature"], Path("/repo"))]


def test_delete_local_branch_invokes_force_git_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[list[str], Path | None]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        cwd = kwargs.get("cwd")
        assert cwd is None or isinstance(cwd, Path)
        calls.append((cmd, cwd))
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    result = RealGitGateway(repo_root=Path("/repo")).delete_local_branch("feature", force=True)

    assert result is None
    assert calls == [(["git", "branch", "-D", "feature"], Path("/repo"))]


def test_delete_remote_branch_invokes_origin_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[list[str], Path | None]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        cwd = kwargs.get("cwd")
        assert cwd is None or isinstance(cwd, Path)
        calls.append((cmd, cwd))
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    result = RealGitGateway(repo_root=Path("/repo")).delete_remote_branch("origin", "feature")

    assert result is None
    assert calls == [(["git", "push", "origin", "--delete", "feature"], Path("/repo"))]


def test_delete_branch_methods_return_command_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="not merged\n")

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)
    gateway = RealGitGateway(repo_root=Path("/repo"))

    local_result = gateway.delete_local_branch("feature", force=False)
    remote_result = gateway.delete_remote_branch("origin", "feature")

    assert local_result == GitCommandFailure(message="not merged", returncode=1)
    assert remote_result == GitCommandFailure(message="not merged", returncode=1)


@pytest.mark.parametrize(
    ("stdout", "expected"),
    [
        ("", ()),
        (
            "R100\told.py\tnew.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="old.py",
                    new_path="new.py",
                    similarity=100,
                ),
            ),
        ),
        (
            "C85\tsrc/a.py\tsrc/b.py\n",
            (
                RestructuredFile(
                    status="C",
                    old_path="src/a.py",
                    new_path="src/b.py",
                    similarity=85,
                ),
            ),
        ),
        (
            "R100\told path.py\tnew path.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="old path.py",
                    new_path="new path.py",
                    similarity=100,
                ),
            ),
        ),
        (
            "M\tmodified.py\nR90\tsrc/x.py\tsrc/y.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="src/x.py",
                    new_path="src/y.py",
                    similarity=90,
                ),
            ),
        ),
    ],
)
def test_parse_name_status_output(
    stdout: str,
    expected: tuple[RestructuredFile, ...],
) -> None:
    assert parse_name_status_output(stdout) == expected


def test_get_restructured_files_returns_parsed_files(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == [
            "git",
            "diff",
            "--name-status",
            "-M",
            "-C",
            "origin/main...HEAD",
        ]
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout="R100\tsrc/old.py\tsrc/new.py\n",
            stderr="",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_restructured_files(Path("/repo"), "main") == (
        RestructuredFile(
            status="R",
            old_path="src/old.py",
            new_path="src/new.py",
            similarity=100,
        ),
    )


def test_get_restructured_files_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            cmd,
            128,
            stdout="",
            stderr="fatal: bad revision 'origin/main...HEAD'",
        )

    monkeypatch.setattr(real_git_gateway.subprocess, "run", fake_run)

    assert RealGitGateway().get_restructured_files(Path("/repo"), "main") == GitCommandFailure(
        message="Failed to detect restructured files against origin/main: "
        "fatal: bad revision 'origin/main...HEAD'",
        returncode=128,
    )


def test_parse_local_branch_tip_output_parses_nul_delimited_lines() -> None:
    assert parse_local_branch_tip_output(
        "main\x002026-05-20T10:44:08-04:00\n"
        "feat/x\x002026-05-20T11:15:42-04:00\n"
        "missing-separator\n"
        "empty-time\x00\n"
    ) == (
        LocalBranchTip(name="main", head_iso="2026-05-20T10:44:08-04:00"),
        LocalBranchTip(name="feat/x", head_iso="2026-05-20T11:15:42-04:00"),
        LocalBranchTip(name="empty-time", head_iso=None),
    )


def test_parse_local_branch_tip_ref_output_parses_nul_delimited_lines() -> None:
    assert parse_local_branch_tip_ref_output(
        "main\x00abc123\nfeat/x\x00def456\nmissing-separator\nmissing-oid\x00\n"
    ) == (
        LocalBranchTipRef(branch="main", oid="abc123"),
        LocalBranchTipRef(branch="feat/x", oid="def456"),
    )


def test_parse_commit_graph_output_parses_parent_lines() -> None:
    assert parse_commit_graph_output(
        "child base other-parent\nbase root\nmalformed-but-still-an-oid\n\n"
    ) == (
        CommitGraphNode(oid="child", parent_oids=("base", "other-parent")),
        CommitGraphNode(oid="base", parent_oids=("root",)),
        CommitGraphNode(oid="malformed-but-still-an-oid", parent_oids=()),
    )


def test_parse_tree_oid_batch_check_output_maps_only_trees() -> None:
    assert parse_tree_oid_batch_check_output(
        "treeoid tree\nbloboid blob\nrefs/heads/missing:.asdl/objectives missing\n",
        ("refs/heads/tree", "refs/heads/blob", "refs/heads/missing"),
    ) == {
        "refs/heads/tree": "treeoid",
        "refs/heads/blob": None,
        "refs/heads/missing": None,
    }


def test_parse_tree_oid_batch_check_output_returns_failure_on_row_count_mismatch() -> None:
    result = parse_tree_oid_batch_check_output("treeoid tree\n", ("a", "b"))

    assert isinstance(result, GitCommandFailure)
    assert "unexpected number of rows" in result.message


def test_list_local_branch_tips_returns_branch_names_and_timestamps(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "initial")
    _git(repo, "branch", "-M", "main")
    _git(repo, "branch", "feat/x")

    result = RealGitGateway(repo_root=repo).list_local_branch_tips()

    assert tuple(tip.name for tip in result) == ("feat/x", "main")
    assert all(tip.head_iso is not None for tip in result)
    assert all("T" in tip.head_iso for tip in result if tip.head_iso is not None)


def test_commit_graph_from_base_returns_requested_branch_tips_and_graph(
    tmp_path: Path,
) -> None:
    repo = _init_git_repo(tmp_path)
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "initial")
    _git(repo, "branch", "-M", "main")
    _git(repo, "checkout", "-b", "feat/base")
    (repo / "base.txt").write_text("base\n", encoding="utf-8")
    _git(repo, "add", "base.txt")
    _git(repo, "commit", "-m", "base")
    _git(repo, "checkout", "-b", "feat/child")
    (repo / "child.txt").write_text("child\n", encoding="utf-8")
    _git(repo, "add", "child.txt")
    _git(repo, "commit", "-m", "child")
    _git(repo, "branch", "feat/zero", "main")

    result = RealGitGateway(repo_root=repo).commit_graph_from_base(
        base_branch="main",
        branches=("feat/child", "feat/base", "feat/zero"),
    )

    assert isinstance(result, BranchCommitGraph)
    assert result.base_branch == "main"
    assert tuple(tip.branch for tip in result.branch_tips) == (
        "feat/base",
        "feat/child",
        "feat/zero",
    )
    base_oid = _git(repo, "rev-parse", "feat/base").stdout.strip()
    child_oid = _git(repo, "rev-parse", "feat/child").stdout.strip()
    assert {commit.oid for commit in result.commits} == {base_oid, child_oid}
    assert child_oid in {tip.oid for tip in result.branch_tips}
    child_node = _commit_node(result, child_oid)
    assert base_oid in child_node.parent_oids


def test_commit_graph_from_base_returns_failure_for_unknown_branch(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "initial")
    _git(repo, "branch", "-M", "main")

    result = RealGitGateway(repo_root=repo).commit_graph_from_base(
        base_branch="main",
        branches=("missing",),
    )

    assert isinstance(result, GitCommandFailure)
    assert result.returncode == 1
    assert "missing" in result.message


def test_list_branches_merged_into_returns_local_ancestor_branches(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "initial")
    _git(repo, "branch", "-M", "main")
    _git(repo, "branch", "feat/base")
    _git(repo, "checkout", "-b", "feat/child")
    (repo / "child.txt").write_text("child\n", encoding="utf-8")
    _git(repo, "add", "child.txt")
    _git(repo, "commit", "-m", "child")
    _git(repo, "branch", "feat/sibling", "main")

    result = RealGitGateway(repo_root=repo).list_branches_merged_into("feat/child")

    assert result == ("feat/base", "feat/child", "feat/sibling", "main")


def test_list_branches_merged_into_returns_failure_for_unknown_branch(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)

    result = RealGitGateway(repo_root=repo).list_branches_merged_into("missing")

    assert isinstance(result, GitCommandFailure)
    assert result.returncode != 0


def test_parse_path_touch_output_returns_touch() -> None:
    assert parse_path_touch_output("abc123\x002026-05-20T10:44:08-04:00\n") == PathTouch(
        oid="abc123",
        committed_iso="2026-05-20T10:44:08-04:00",
    )


def test_parse_path_touch_output_rejects_empty_or_malformed_rows() -> None:
    assert parse_path_touch_output("") is None
    assert parse_path_touch_output("abc123 2026-05-20T10:44:08-04:00") is None


def test_parse_path_change_touches_output_groups_commit_paths() -> None:
    assert parse_path_change_touches_output(
        "newer\x002026-05-20T11:00:00-04:00\n"
        "\n"
        ".asdl/objectives/alpha/objective.md\n"
        ".asdl/objectives/alpha/updates/progress.md\n"
        "outside.txt\n"
        "older\x002026-05-20T10:00:00-04:00\n"
        ".asdl/objectives/beta/objective.md\n",
        ".asdl/objectives",
    ) == (
        PathChangeTouch(
            oid="newer",
            committed_iso="2026-05-20T11:00:00-04:00",
            paths=(
                ".asdl/objectives/alpha/objective.md",
                ".asdl/objectives/alpha/updates/progress.md",
            ),
        ),
        PathChangeTouch(
            oid="older",
            committed_iso="2026-05-20T10:00:00-04:00",
            paths=(".asdl/objectives/beta/objective.md",),
        ),
    )


def test_parse_path_change_touches_output_parses_name_status_changes_and_renames() -> None:
    assert parse_path_change_touches_output(
        "commit\x002026-05-20T11:00:00-04:00\n"
        "A\t.asdl/objectives/added/objective.md\n"
        "M\t.asdl/objectives/modified/objective.md\n"
        "D\t.asdl/objectives/deleted/objective.md\n"
        "R100\t.asdl/objectives/old/objective.md\t.asdl/objectives/new/objective.md\n"
        "R100\t.asdl/objective-archive/restored/objective.md\t"
        ".asdl/objectives/restored/objective.md\n"
        "R100\t.asdl/objectives/retired/objective.md\t"
        ".asdl/objective-archive/retired/objective.md\n"
        "M\t.asdl/objective-archive/ignored/objective.md\n"
        "M\toutside.txt\n",
        ".asdl/objectives",
    ) == (
        PathChangeTouch(
            oid="commit",
            committed_iso="2026-05-20T11:00:00-04:00",
            paths=(
                ".asdl/objectives/added/objective.md",
                ".asdl/objectives/modified/objective.md",
                ".asdl/objectives/deleted/objective.md",
                ".asdl/objectives/old/objective.md",
                ".asdl/objectives/new/objective.md",
                ".asdl/objectives/restored/objective.md",
                ".asdl/objectives/retired/objective.md",
            ),
        ),
    )


def test_parse_path_change_touches_output_skips_malformed_blocks() -> None:
    assert parse_path_change_touches_output(
        ".asdl/objectives/before-header/objective.md\n"
        "missing-iso\x00\n"
        ".asdl/objectives/bad/objective.md\n"
        "ok\x002026-05-20T10:00:00-04:00\n"
        ".asdl/objectives/good/objective.md\n",
        ".asdl/objectives",
    ) == (
        PathChangeTouch(
            oid="ok",
            committed_iso="2026-05-20T10:00:00-04:00",
            paths=(".asdl/objectives/good/objective.md",),
        ),
    )


def test_path_last_touched_returns_latest_touch(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    record = repo / ".asdl" / "objectives" / "alpha"
    record.mkdir(parents=True)
    (record / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objective")

    result = RealGitGateway(repo_root=repo).path_last_touched("HEAD", ".asdl/objectives/alpha")

    assert result is not None
    assert len(result.oid) == 40
    assert "T" in result.committed_iso


def test_has_uncommitted_changes_under_returns_false_for_clean_path(tmp_path: Path) -> None:
    repo = _repo_with_committed_objective(tmp_path)

    assert not RealGitGateway(repo_root=repo).has_uncommitted_changes_under(
        repo,
        ".asdl/objectives/alpha",
    )


def test_has_uncommitted_changes_under_detects_staged_changes(tmp_path: Path) -> None:
    repo = _repo_with_committed_objective(tmp_path)
    (repo / ".asdl" / "objectives" / "alpha" / "objective.md").write_text(
        "# Alpha\n\nStaged change.\n",
        encoding="utf-8",
    )
    _git(repo, "add", ".asdl/objectives/alpha/objective.md")

    assert RealGitGateway(repo_root=repo).has_uncommitted_changes_under(
        repo,
        ".asdl/objectives/alpha",
    )


def test_has_uncommitted_changes_under_detects_unstaged_changes(tmp_path: Path) -> None:
    repo = _repo_with_committed_objective(tmp_path)
    (repo / ".asdl" / "objectives" / "alpha" / "objective.md").write_text(
        "# Alpha\n\nUnstaged change.\n",
        encoding="utf-8",
    )

    assert RealGitGateway(repo_root=repo).has_uncommitted_changes_under(
        repo,
        ".asdl/objectives/alpha",
    )


def test_has_uncommitted_changes_under_detects_untracked_files(tmp_path: Path) -> None:
    repo = _repo_with_committed_objective(tmp_path)
    (repo / ".asdl" / "objectives" / "alpha" / "notes.md").write_text(
        "# Notes\n",
        encoding="utf-8",
    )

    assert RealGitGateway(repo_root=repo).has_uncommitted_changes_under(
        repo,
        ".asdl/objectives/alpha",
    )


def test_has_uncommitted_changes_under_ignores_unrelated_changes(tmp_path: Path) -> None:
    repo = _repo_with_committed_objective(tmp_path)
    (repo / "outside.txt").write_text("outside\n", encoding="utf-8")

    assert not RealGitGateway(repo_root=repo).has_uncommitted_changes_under(
        repo,
        ".asdl/objectives/alpha",
    )


def test_path_last_touched_accepts_revision_range(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    _git(repo, "branch", "-M", "main")
    record = repo / ".asdl" / "objectives" / "alpha"
    updates = record / "updates"
    updates.mkdir(parents=True)
    (record / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objective")
    _git(repo, "checkout", "-b", "feature")
    (updates / "progress.md").write_text("# Progress\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objective progress")
    _git(repo, "checkout", "main")
    _git(repo, "checkout", "-b", "inherited")

    gateway = RealGitGateway(repo_root=repo)

    touched = gateway.path_last_touched("main..feature", ".asdl/objectives/alpha")
    inherited = gateway.path_last_touched("main..inherited", ".asdl/objectives/alpha")

    assert touched is not None
    assert len(touched.oid) == 40
    assert "T" in touched.committed_iso
    assert inherited is None


def test_path_touches_under_returns_newest_first_commits_with_paths(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    _git(repo, "branch", "-M", "main")
    alpha = repo / ".asdl" / "objectives" / "alpha"
    beta = repo / ".asdl" / "objectives" / "beta"
    alpha.mkdir(parents=True)
    beta.mkdir(parents=True)
    (alpha / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "alpha")
    (beta / "objective.md").write_text("# Beta\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "beta")

    result = RealGitGateway(repo_root=repo).path_touches_under("HEAD", ".asdl/objectives")

    assert not isinstance(result, GitCommandFailure)
    assert [touch.paths for touch in result] == [
        (".asdl/objectives/beta/objective.md",),
        (".asdl/objectives/alpha/objective.md",),
    ]
    assert all(len(touch.oid) == 40 for touch in result)


def test_path_touches_under_surfaces_deleted_paths(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    _git(repo, "branch", "-M", "main")
    record = repo / ".asdl" / "objectives" / "deleted"
    record.mkdir(parents=True)
    (record / "objective.md").write_text("# Deleted\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "add deleted objective")
    base = _git(repo, "rev-parse", "HEAD").stdout.strip()
    _git(repo, "rm", "-r", ".asdl/objectives/deleted")
    _git(repo, "commit", "-m", "delete objective")

    result = RealGitGateway(repo_root=repo).path_touches_under(
        f"{base}..HEAD",
        ".asdl/objectives",
    )

    assert not isinstance(result, GitCommandFailure)
    assert result == (
        PathChangeTouch(
            oid=result[0].oid,
            committed_iso=result[0].committed_iso,
            paths=(".asdl/objectives/deleted/objective.md",),
        ),
    )
    assert len(result[0].oid) == 40
    assert "T" in result[0].committed_iso


def test_path_touches_under_preserves_both_active_paths_for_renames(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    _git(repo, "branch", "-M", "main")
    old_record = repo / ".asdl" / "objectives" / "old"
    old_record.mkdir(parents=True)
    (old_record / "objective.md").write_text("# Old\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "add old objective")
    base = _git(repo, "rev-parse", "HEAD").stdout.strip()
    new_record = repo / ".asdl" / "objectives" / "new"
    new_record.mkdir()
    _git(
        repo,
        "mv",
        ".asdl/objectives/old/objective.md",
        ".asdl/objectives/new/objective.md",
    )
    old_record.rmdir()
    _git(repo, "commit", "-m", "rename objective")

    result = RealGitGateway(repo_root=repo).path_touches_under(
        f"{base}..HEAD",
        ".asdl/objectives",
    )

    assert not isinstance(result, GitCommandFailure)
    assert result == (
        PathChangeTouch(
            oid=result[0].oid,
            committed_iso=result[0].committed_iso,
            paths=(
                ".asdl/objectives/old/objective.md",
                ".asdl/objectives/new/objective.md",
            ),
        ),
    )
    assert len(result[0].oid) == 40
    assert "T" in result[0].committed_iso


def test_path_touches_under_returns_failure_for_bad_ref(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)

    result = RealGitGateway(repo_root=repo).path_touches_under("missing", ".asdl/objectives")

    assert isinstance(result, GitCommandFailure)
    assert result.returncode != 0


def test_list_tracked_paths_at_ref_returns_recursive_paths(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    root = repo / ".asdl" / "objectives"
    (root / "alpha" / "updates").mkdir(parents=True)
    (root / "beta").mkdir()
    (root / "alpha" / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    (root / "alpha" / "updates" / "progress.md").write_text("# Progress\n", encoding="utf-8")
    (root / "beta" / "closed.md").write_text("closed\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objectives")

    result = RealGitGateway(repo_root=repo).list_tracked_paths_at_ref("HEAD", ".asdl/objectives")

    assert result == (
        ".asdl/objectives/alpha/objective.md",
        ".asdl/objectives/alpha/updates/progress.md",
        ".asdl/objectives/beta/closed.md",
    )


def test_list_tracked_paths_at_ref_missing_tree_path_returns_empty(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "initial")

    result = RealGitGateway(repo_root=repo).list_tracked_paths_at_ref("HEAD", ".asdl/objectives")

    assert result == ()


def test_list_tracked_paths_at_ref_invalid_ref_returns_failure(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)

    result = RealGitGateway(repo_root=repo).list_tracked_paths_at_ref(
        "refs/heads/does-not-exist",
        ".asdl/objectives",
    )

    assert isinstance(result, GitCommandFailure)
    assert result.returncode != 0


def test_list_directories_at_ref_missing_tree_path_returns_empty(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "initial")

    result = RealGitGateway(repo_root=repo).list_directories_at_ref("HEAD", ".asdl/objectives")

    assert result == ()


def test_list_directories_at_ref_returns_direct_child_directories(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    root = repo / ".asdl" / "objectives"
    (root / "beta").mkdir(parents=True)
    (root / "alpha").mkdir()
    (root / "root-note.md").write_text("not a directory\n", encoding="utf-8")
    (root / "alpha" / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    (root / "beta" / "objective.md").write_text("# Beta\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objectives")

    result = RealGitGateway(repo_root=repo).list_directories_at_ref("HEAD", ".asdl/objectives")

    assert result == ("alpha", "beta")


def test_tree_oids_at_refs_returns_shared_tree_oids_and_missing_paths(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    root = repo / ".asdl" / "objectives"
    (root / "alpha").mkdir(parents=True)
    (root / "alpha" / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objectives")
    _git(repo, "branch", "-M", "main")
    _git(repo, "branch", "feat/same")
    _git(repo, "checkout", "-b", "feat/other")
    (root / "beta").mkdir()
    (root / "beta" / "objective.md").write_text("# Beta\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "beta")
    _git(repo, "checkout", "main")
    _git(repo, "checkout", "-b", "feat/no-objectives")
    _git(repo, "rm", "-r", ".asdl")
    _git(repo, "commit", "-m", "remove objectives")

    result = RealGitGateway(repo_root=repo).tree_oids_at_refs(
        (
            "refs/heads/main",
            "refs/heads/feat/same",
            "refs/heads/feat/other",
            "refs/heads/feat/no-objectives",
        ),
        ".asdl/objectives",
    )

    assert not isinstance(result, GitCommandFailure)
    assert result["refs/heads/main"] is not None
    assert result["refs/heads/main"] == result["refs/heads/feat/same"]
    assert result["refs/heads/feat/other"] != result["refs/heads/main"]
    assert result["refs/heads/feat/no-objectives"] is None


def test_path_exists_at_ref_reports_file_existence(tmp_path: Path) -> None:
    repo = _init_git_repo(tmp_path)
    record = repo / ".asdl" / "objectives" / "alpha"
    record.mkdir(parents=True)
    (record / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objective")
    gateway = RealGitGateway(repo_root=repo)

    assert gateway.path_exists_at_ref("HEAD", ".asdl/objectives/alpha/objective.md")
    assert not gateway.path_exists_at_ref("HEAD", ".asdl/objectives/alpha/closed.md")


def _commit_node(graph: BranchCommitGraph, oid: str) -> CommitGraphNode:
    matches = [commit for commit in graph.commits if commit.oid == oid]
    assert len(matches) == 1
    return matches[0]


def _init_git_repo(path: Path) -> Path:
    _git(path, "init")
    _git(path, "config", "user.email", "test@example.com")
    _git(path, "config", "user.name", "Test User")
    return path


def _repo_with_committed_objective(path: Path) -> Path:
    repo = _init_git_repo(path)
    record = repo / ".asdl" / "objectives" / "alpha"
    record.mkdir(parents=True)
    (record / "objective.md").write_text("# Alpha\n", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "objective")
    return repo


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )
