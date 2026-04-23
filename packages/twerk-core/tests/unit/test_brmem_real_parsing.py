from __future__ import annotations

from twerk_core.brmem.gateway import EntryRef, ref_name_for_entry
from twerk_core.brmem.real import (
    _parse_existing_keys,
    _parse_ls_tree_lines,
    _parse_source_pairs,
)


def _source_line(namespace: str, key: str, branch: str, sha: str) -> str:
    return f"{ref_name_for_entry(namespace, key, branch)} {sha}"


def _dest_line(namespace: str, key: str, branch: str) -> str:
    return ref_name_for_entry(namespace, key, branch)


def test_parse_source_pairs_empty_listing_returns_empty_list() -> None:
    assert _parse_source_pairs("", "memjectives", "feat/a") == []


def test_parse_source_pairs_returns_entries_sorted_by_key() -> None:
    stdout = "\n".join(
        [
            _source_line("memjectives", "zeta", "feat/a", "a" * 40),
            _source_line("memjectives", "alpha", "feat/a", "b" * 40),
            _source_line("memjectives", "mike", "feat/a", "c" * 40),
        ]
    )

    pairs = _parse_source_pairs(stdout, "memjectives", "feat/a")

    assert [entry.key for entry, _ in pairs] == ["alpha", "mike", "zeta"]
    shas = {entry.key: sha for entry, sha in pairs}
    assert shas == {"alpha": "b" * 40, "mike": "c" * 40, "zeta": "a" * 40}
    for entry, _sha in pairs:
        assert isinstance(entry, EntryRef)
        assert entry.namespace == "memjectives"
        assert entry.branch == "feat/a"


def test_parse_source_pairs_skips_line_with_missing_objectname() -> None:
    stdout = "\n".join(
        [
            ref_name_for_entry("memjectives", "alpha", "feat/a"),  # no sha, no space
            _source_line("memjectives", "beta", "feat/a", "d" * 40),
        ]
    )

    pairs = _parse_source_pairs(stdout, "memjectives", "feat/a")

    assert [entry.key for entry, _ in pairs] == ["beta"]


def test_parse_source_pairs_skips_unparseable_refname() -> None:
    stdout = "\n".join(
        [
            "refs/heads/main deadbeef",
            _source_line("memjectives", "alpha", "feat/a", "e" * 40),
        ]
    )

    pairs = _parse_source_pairs(stdout, "memjectives", "feat/a")

    assert [entry.key for entry, _ in pairs] == ["alpha"]


def test_parse_source_pairs_filters_out_other_namespaces() -> None:
    stdout = "\n".join(
        [
            _source_line("memjectives", "alpha", "feat/a", "f" * 40),
            _source_line("workbr", "beta", "feat/a", "1" * 40),
        ]
    )

    pairs = _parse_source_pairs(stdout, "memjectives", "feat/a")

    assert [entry.key for entry, _ in pairs] == ["alpha"]


def test_parse_source_pairs_filters_out_other_branches() -> None:
    stdout = "\n".join(
        [
            _source_line("memjectives", "alpha", "feat/a", "2" * 40),
            _source_line("memjectives", "beta", "feat/b", "3" * 40),
        ]
    )

    pairs = _parse_source_pairs(stdout, "memjectives", "feat/a")

    assert [entry.key for entry, _ in pairs] == ["alpha"]


def test_parse_source_pairs_skips_whitespace_only_lines() -> None:
    stdout = "\n".join(
        [
            "   ",
            "",
            _source_line("memjectives", "alpha", "feat/a", "4" * 40),
        ]
    )

    pairs = _parse_source_pairs(stdout, "memjectives", "feat/a")

    assert [entry.key for entry, _ in pairs] == ["alpha"]


def test_parse_existing_keys_empty_listing_returns_empty_set() -> None:
    assert _parse_existing_keys("", "memjectives", "feat/a") == set()


def test_parse_existing_keys_collects_keys_from_matching_refs() -> None:
    stdout = "\n".join(
        [
            _dest_line("memjectives", "alpha", "feat/a"),
            _dest_line("memjectives", "beta", "feat/a"),
            _dest_line("memjectives", "alpha", "feat/a"),  # duplicate, same set
        ]
    )

    assert _parse_existing_keys(stdout, "memjectives", "feat/a") == {"alpha", "beta"}


def test_parse_existing_keys_skips_unparseable_lines() -> None:
    stdout = "\n".join(
        [
            "refs/heads/main",
            _dest_line("memjectives", "alpha", "feat/a"),
        ]
    )

    assert _parse_existing_keys(stdout, "memjectives", "feat/a") == {"alpha"}


def test_parse_existing_keys_filters_mismatched_namespace_and_branch() -> None:
    stdout = "\n".join(
        [
            _dest_line("memjectives", "alpha", "feat/a"),
            _dest_line("workbr", "beta", "feat/a"),
            _dest_line("memjectives", "gamma", "feat/b"),
        ]
    )

    assert _parse_existing_keys(stdout, "memjectives", "feat/a") == {"alpha"}


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
