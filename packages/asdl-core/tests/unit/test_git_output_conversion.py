"""Unit tests for Git subprocess output conversion helpers."""

from __future__ import annotations

from pathlib import Path

import pytest

from asdl_core.git.output_conversion import (
    parse_commit_graph_output,
    parse_local_branch_tip_output,
    parse_local_branch_tip_ref_output,
    parse_log_range_output,
    parse_name_status_output,
    parse_path_change_touches_output,
    parse_path_touch_output,
    parse_porcelain_status,
    parse_tree_oid_batch_check_output,
    parse_worktree_list_output,
)
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


@pytest.mark.parametrize(
    ("stdout", "expected"),
    [
        ("", FileStatus(False, False, False)),
        ("?? untracked.py\n", FileStatus(False, False, True)),
        (" M modified.py\n", FileStatus(False, True, False)),
        ("A  staged.py\n", FileStatus(True, False, False)),
        (" M modified.py\nA  staged.py\n?? untracked.py\n", FileStatus(True, True, True)),
        ("MM conflicted.py\n", FileStatus(True, True, False)),
        ("R  old.py -> new.py\n", FileStatus(True, False, False)),
        ("D  gone.py\n", FileStatus(True, False, False)),
        ("T  typechange.py\n", FileStatus(True, False, False)),
        ("?\n", FileStatus(False, False, False)),
    ],
    ids=[
        "empty",
        "untracked_only",
        "modified_only",
        "staged_only",
        "all_three",
        "staged_and_modified_same_file",
        "rename_staged",
        "deleted_staged",
        "typechange_staged",
        "short_line_ignored",
    ],
)
def test_parse_porcelain_status(stdout: str, expected: FileStatus) -> None:
    assert parse_porcelain_status(stdout) == expected


@pytest.mark.parametrize(
    ("stdout", "expected"),
    [
        (
            "",
            (),
        ),
        (
            "worktree /home/alice/repo\nHEAD abc123\nbranch refs/heads/main\n\n",
            (WorktreeInfo(path=Path("/home/alice/repo"), branch="main", is_bare=False),),
        ),
        (
            "worktree /home/alice/detached\nHEAD abc123\ndetached\n\n",
            (WorktreeInfo(path=Path("/home/alice/detached"), branch=None, is_bare=False),),
        ),
        (
            "worktree /tmp/bare.git\nbare\n\n",
            (WorktreeInfo(path=Path("/tmp/bare.git"), branch=None, is_bare=True),),
        ),
        (
            (
                "worktree /home/alice/repo\nHEAD abc\nbranch refs/heads/main\n\n"
                "worktree /home/alice/wt\nHEAD def\nbranch refs/heads/feat/x\n\n"
            ),
            (
                WorktreeInfo(path=Path("/home/alice/repo"), branch="main", is_bare=False),
                WorktreeInfo(path=Path("/home/alice/wt"), branch="feat/x", is_bare=False),
            ),
        ),
        (
            "worktree /home/alice/repo\nHEAD abc\nbranch refs/heads/main\n",
            (WorktreeInfo(path=Path("/home/alice/repo"), branch="main", is_bare=False),),
        ),
        (
            (
                "worktree /home/alice/repo\nHEAD abc\nbranch refs/heads/main\n"
                "sparse-checkout\nlocked\n\n"
            ),
            (WorktreeInfo(path=Path("/home/alice/repo"), branch="main", is_bare=False),),
        ),
        (
            "branch refs/heads/orphan\n\n",
            (),
        ),
    ],
    ids=[
        "empty",
        "single_with_branch",
        "detached_head",
        "bare",
        "multiple_worktrees",
        "no_trailing_blank_line",
        "unknown_porcelain_keys_ignored",
        "branch_line_before_worktree_line_ignored",
    ],
)
def test_parse_worktree_list_output(stdout: str, expected: tuple[WorktreeInfo, ...]) -> None:
    assert parse_worktree_list_output(stdout) == expected


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


def test_parse_log_range_output_empty() -> None:
    assert parse_log_range_output("") == ()


def test_parse_log_range_output_single_commit() -> None:
    line = "abc123\x002026-04-26T18:00:00+00:00\x00Initial commit\n"

    commits = parse_log_range_output(line)

    assert commits == (
        CommitSummary(
            sha="abc123",
            author_iso="2026-04-26T18:00:00+00:00",
            subject="Initial commit",
        ),
    )


def test_parse_log_range_output_multi_commit_preserves_order() -> None:
    stdout = (
        "sha-2\x002026-04-26T19:00:00+00:00\x00Second commit\n"
        "sha-1\x002026-04-26T18:00:00+00:00\x00First commit\n"
    )

    commits = parse_log_range_output(stdout)

    assert commits == (
        CommitSummary(
            sha="sha-2",
            author_iso="2026-04-26T19:00:00+00:00",
            subject="Second commit",
        ),
        CommitSummary(
            sha="sha-1",
            author_iso="2026-04-26T18:00:00+00:00",
            subject="First commit",
        ),
    )


def test_parse_log_range_output_keeps_subjects_with_spaces_and_tabs() -> None:
    stdout = "sha-1\x002026-04-26T18:00:00+00:00\x00fix(core): handle\twhitespace in subjects\n"

    commits = parse_log_range_output(stdout)

    assert commits == (
        CommitSummary(
            sha="sha-1",
            author_iso="2026-04-26T18:00:00+00:00",
            subject="fix(core): handle\twhitespace in subjects",
        ),
    )


def test_parse_log_range_output_skips_malformed_lines() -> None:
    stdout = "abc123\x002026-04-26T18:00:00+00:00\x00ok\nbadline-no-nuls\n"

    commits = parse_log_range_output(stdout)

    assert commits == (
        CommitSummary(
            sha="abc123",
            author_iso="2026-04-26T18:00:00+00:00",
            subject="ok",
        ),
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


def test_parse_path_change_touches_output_reads_name_status_rows() -> None:
    assert parse_path_change_touches_output(
        "newer\x002026-05-20T11:00:00-04:00\n"
        "A\t.asdl/objectives/alpha/objective.md\n"
        "M\t.asdl/objectives/alpha/roadmap.md\n"
        "D\t.asdl/objectives/deleted/objective.md\n"
        "R100\t.asdl/objectives/old/objective.md\t.asdl/objectives/new/objective.md\n"
        "C85\t.asdl/objectives/template/objective.md\t.asdl/objectives/copy/objective.md\n"
        "R100\t.asdl/objective-archive/old/objective.md\t.asdl/objective-archive/new/objective.md\n"
        "M\toutside.txt\n",
        ".asdl/objectives",
    ) == (
        PathChangeTouch(
            oid="newer",
            committed_iso="2026-05-20T11:00:00-04:00",
            paths=(
                ".asdl/objectives/alpha/objective.md",
                ".asdl/objectives/alpha/roadmap.md",
                ".asdl/objectives/deleted/objective.md",
                ".asdl/objectives/old/objective.md",
                ".asdl/objectives/new/objective.md",
                ".asdl/objectives/template/objective.md",
                ".asdl/objectives/copy/objective.md",
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
