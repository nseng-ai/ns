from __future__ import annotations

import pytest

from twerk_reviewer.review_definition import parse_review_definition


def test_parse_review_definition_success() -> None:
    definition = parse_review_definition(
        "# Dignified Python\n\n"
        "## Description\n\n"
        "Review Python diffs for style violations.\n\n"
        "## Instructions\n\n"
        "Flag concrete issues in the diff.\n\n"
        "## Default Model\n\n"
        "gpt-5-mini\n"
    )

    assert definition.name == "Dignified Python"
    assert definition.description == "Review Python diffs for style violations."
    assert definition.instructions == "Flag concrete issues in the diff."
    assert definition.default_model == "gpt-5-mini"


def test_parse_review_definition_requires_instructions() -> None:
    with pytest.raises(ValueError, match="Instructions"):
        parse_review_definition(
            "# Dignified Python\n\n## Description\n\nReview Python diffs for style violations.\n"
        )


def test_parse_review_definition_rejects_content_before_sections() -> None:
    with pytest.raises(ValueError, match="first level-2 heading"):
        parse_review_definition(
            "# Dignified Python\n\n"
            "Some prose before the sections.\n\n"
            "## Description\n\n"
            "Review Python diffs for style violations.\n\n"
            "## Instructions\n\n"
            "Flag concrete issues in the diff.\n"
        )
