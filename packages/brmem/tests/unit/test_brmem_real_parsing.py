from __future__ import annotations

from brmem.real import _parse_ls_tree_lines


def test_parse_ls_tree_lines_empty_input_returns_empty_list() -> None:
    assert _parse_ls_tree_lines("") == []


def test_parse_ls_tree_lines_returns_pairs_in_input_order() -> None:
    stdout = "body.md\tabc123\nfoo/bar.md\tdef456\nzeta/alpha.md\t789xyz\n"

    assert _parse_ls_tree_lines(stdout) == [
        ("body.md", "abc123"),
        ("foo/bar.md", "def456"),
        ("zeta/alpha.md", "789xyz"),
    ]


def test_parse_ls_tree_lines_preserves_nested_paths() -> None:
    stdout = "foo/bar/baz/deep.md\tdeadbeef\n"

    assert _parse_ls_tree_lines(stdout) == [("foo/bar/baz/deep.md", "deadbeef")]


def test_parse_ls_tree_lines_skips_line_without_tab_separator() -> None:
    stdout = "no-tab-here\nvalid.md\tcafef00d\n"

    assert _parse_ls_tree_lines(stdout) == [("valid.md", "cafef00d")]


def test_parse_ls_tree_lines_skips_line_with_empty_path() -> None:
    stdout = "\tabc123\nvalid.md\tdef456\n"

    assert _parse_ls_tree_lines(stdout) == [("valid.md", "def456")]


def test_parse_ls_tree_lines_skips_line_with_empty_sha() -> None:
    stdout = "path-only.md\t\nvalid.md\tdef456\n"

    assert _parse_ls_tree_lines(stdout) == [("valid.md", "def456")]


def test_parse_ls_tree_lines_skips_blank_lines() -> None:
    stdout = "\n\nvalid.md\tabc123\n\n"

    assert _parse_ls_tree_lines(stdout) == [("valid.md", "abc123")]


def test_parse_ls_tree_lines_handles_missing_trailing_newline() -> None:
    stdout = "body.md\tabc123"

    assert _parse_ls_tree_lines(stdout) == [("body.md", "abc123")]
