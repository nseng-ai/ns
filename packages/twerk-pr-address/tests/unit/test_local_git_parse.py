"""Unit tests for local_git parser and subprocess integration."""

from __future__ import annotations

import subprocess

import pytest

from twerk_core.gh.types import RestructuredFile
from twerk_pr_address.cli.pr_address import local_git
from twerk_pr_address.cli.pr_address.local_git import (
    LocalGitFailure,
    RestructuredFiles,
    get_restructured_files,
    parse_name_status_output,
)


@pytest.mark.parametrize(
    ("stdout", "expected"),
    [
        pytest.param("", (), id="empty_string"),
        pytest.param(
            "R100\told.py\tnew.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="old.py",
                    new_path="new.py",
                    similarity=100,
                ),
            ),
            id="single_rename_with_similarity",
        ),
        pytest.param(
            "C85\tsrc/a.py\tsrc/b.py\n",
            (
                RestructuredFile(
                    status="C",
                    old_path="src/a.py",
                    new_path="src/b.py",
                    similarity=85,
                ),
            ),
            id="single_copy_with_similarity",
        ),
        pytest.param(
            "R\told.py\tnew.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="old.py",
                    new_path="new.py",
                    similarity=100,
                ),
            ),
            id="bare_r_defaults_similarity_to_100",
        ),
        pytest.param(
            "C\told.py\tnew.py\n",
            (
                RestructuredFile(
                    status="C",
                    old_path="old.py",
                    new_path="new.py",
                    similarity=100,
                ),
            ),
            id="bare_c_defaults_similarity_to_100",
        ),
        pytest.param(
            "Rfoo\told.py\tnew.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="old.py",
                    new_path="new.py",
                    similarity=100,
                ),
            ),
            id="malformed_similarity_defaults_to_100",
        ),
        pytest.param(
            "A\tadded.py\nM\tmodified.py\nD\tdeleted.py\nT\ttype_changed.py\n",
            (),
            id="non_rename_copy_statuses_filtered_out",
        ),
        pytest.param(
            "\n   \n\t\t\n",
            (),
            id="blank_and_whitespace_lines_filtered_out",
        ),
        pytest.param(
            "R100\told.py\nR\tonly_one_field\n",
            (),
            id="fewer_than_three_tab_fields_filtered_out",
        ),
        pytest.param(
            (
                "R100\tsrc/old.py\tsrc/new.py\n"
                "\n"
                "M\tsrc/other.py\n"
                "C75\tsrc/a.py\tsrc/b.py\n"
                "R100\ttoo_few\n"
                "R90\tsrc/x.py\tsrc/y.py\n"
            ),
            (
                RestructuredFile(
                    status="R",
                    old_path="src/old.py",
                    new_path="src/new.py",
                    similarity=100,
                ),
                RestructuredFile(
                    status="C",
                    old_path="src/a.py",
                    new_path="src/b.py",
                    similarity=75,
                ),
                RestructuredFile(
                    status="R",
                    old_path="src/x.py",
                    new_path="src/y.py",
                    similarity=90,
                ),
            ),
            id="mixed_input_preserves_order_of_renames_and_copies",
        ),
        pytest.param(
            "R100\told path with spaces.py\tnew path with spaces.py\n",
            (
                RestructuredFile(
                    status="R",
                    old_path="old path with spaces.py",
                    new_path="new path with spaces.py",
                    similarity=100,
                ),
            ),
            id="paths_with_spaces_preserved",
        ),
    ],
)
def test_parse_name_status_output(
    stdout: str,
    expected: RestructuredFiles,
) -> None:
    assert parse_name_status_output(stdout) == expected


def test_get_restructured_files_returns_parsed_tuple_on_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        assert cmd == [
            "git",
            "diff",
            "--name-status",
            "-M",
            "-C",
            "origin/master...HEAD",
        ]
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout="R100\tsrc/old.py\tsrc/new.py\n",
            stderr="",
        )

    monkeypatch.setattr(local_git.subprocess, "run", fake_run)

    result = get_restructured_files("master")

    assert result == (
        RestructuredFile(
            status="R",
            old_path="src/old.py",
            new_path="src/new.py",
            similarity=100,
        ),
    )


def test_get_restructured_files_surfaces_git_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            cmd,
            128,
            stdout="",
            stderr="fatal: bad revision\n",
        )

    monkeypatch.setattr(local_git.subprocess, "run", fake_run)

    result = get_restructured_files("master")

    assert isinstance(result, LocalGitFailure)
    assert result.error_type == "git_failed"
    assert result.returncode == 128
    assert "fatal: bad revision" in result.message
