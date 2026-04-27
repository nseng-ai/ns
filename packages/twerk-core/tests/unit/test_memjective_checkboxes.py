from __future__ import annotations

import textwrap

from twerk_core.memjective.exec.checkboxes import (
    count_checkboxes,
    extract_section,
    iter_checkbox_items,
)


def test_count_checkboxes_empty_string() -> None:
    assert count_checkboxes("") == (0, 0)


def test_count_checkboxes_no_checkboxes() -> None:
    md = "# Heading\n\nSome prose with no checklists.\n"

    assert count_checkboxes(md) == (0, 0)


def test_count_checkboxes_all_checked() -> None:
    md = textwrap.dedent(
        """\
        - [x] one
        - [x] two
        - [x] three
        """
    )

    assert count_checkboxes(md) == (3, 3)


def test_count_checkboxes_none_checked() -> None:
    md = textwrap.dedent(
        """\
        - [ ] one
        - [ ] two
        """
    )

    assert count_checkboxes(md) == (0, 2)


def test_count_checkboxes_mixed_with_uppercase_x_and_other_bullets() -> None:
    md = textwrap.dedent(
        """\
        - [x] dash checked
        - [ ] dash unchecked
        * [X] asterisk uppercase x counts as checked
        + [ ] plus bullet works
        """
    )

    assert count_checkboxes(md) == (2, 4)


def test_count_checkboxes_includes_nested_items() -> None:
    md = textwrap.dedent(
        """\
        - [x] outer
          - [ ] nested unchecked
          - [x] nested checked
            - [ ] doubly nested
        """
    )

    assert count_checkboxes(md) == (2, 4)


def test_count_checkboxes_skips_lines_that_only_look_like_checkboxes() -> None:
    md = textwrap.dedent(
        """\
        - [x] real item
        Lorem [x] not at line start
        - missing brackets x
        - [xx] not a single-char marker
        """
    )

    assert count_checkboxes(md) == (1, 1)


def test_iter_checkbox_items_preserves_order_and_strips_text() -> None:
    md = textwrap.dedent(
        """\
        - [ ] alpha
        - [x] beta
          - [ ] gamma
        """
    )

    assert iter_checkbox_items(md) == [
        (False, "alpha"),
        (True, "beta"),
        (False, "gamma"),
    ]


def test_extract_section_returns_text_until_next_heading_of_same_level() -> None:
    md = textwrap.dedent(
        """\
        # Title

        Intro prose.

        ## Description

        First paragraph.

        Second paragraph.

        ## Out of scope

        Not this part.
        """
    )

    assert extract_section(md, "Description") == "First paragraph.\n\nSecond paragraph."


def test_extract_section_terminates_at_higher_level_heading() -> None:
    md = textwrap.dedent(
        """\
        ## Completion Criteria

        - [x] one
        - [ ] two

        # Top-level
        """
    )

    assert extract_section(md, "Completion Criteria") == "- [x] one\n- [ ] two"


def test_extract_section_includes_subsections_until_sibling() -> None:
    md = textwrap.dedent(
        """\
        ## Description

        Lead paragraph.

        ### Sub

        Subdetail.

        ## Out of scope

        Other.
        """
    )

    assert extract_section(md, "Description") == ("Lead paragraph.\n\n### Sub\n\nSubdetail.")


def test_extract_section_is_case_insensitive_and_returns_empty_when_missing() -> None:
    md = "## description\n\nlowercase heading.\n"

    assert extract_section(md, "Description") == "lowercase heading."
    assert extract_section(md, "Nonexistent") == ""


def test_extract_section_returns_to_end_when_no_following_heading() -> None:
    md = textwrap.dedent(
        """\
        ## Completion Criteria

        - [x] only one
        """
    )

    assert extract_section(md, "Completion Criteria") == "- [x] only one"
