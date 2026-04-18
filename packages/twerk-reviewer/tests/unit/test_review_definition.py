from __future__ import annotations

import pytest

from twerk_reviewer.review_definition import parse_review_definition


def test_parse_review_definition_success() -> None:
    definition = parse_review_definition(
        "---\n"
        "description: Review Python diffs for style violations.\n"
        "default_model: gpt-5-mini\n"
        "---\n"
        "\n"
        "Flag concrete issues in the diff.\n",
        name="dignified-python",
    )

    assert definition.name == "dignified-python"
    assert definition.description == "Review Python diffs for style violations."
    assert definition.instructions == "Flag concrete issues in the diff."
    assert definition.default_model == "gpt-5-mini"


def test_parse_review_definition_without_default_model() -> None:
    definition = parse_review_definition(
        "---\n"
        "description: Review Python diffs for style violations.\n"
        "---\n"
        "\n"
        "Flag concrete issues in the diff.\n",
        name="dignified-python",
    )

    assert definition.default_model is None


def test_parse_review_definition_requires_instructions() -> None:
    with pytest.raises(ValueError, match="instructions"):
        parse_review_definition(
            "---\ndescription: Review Python diffs for style violations.\n---\n",
            name="dignified-python",
        )


def test_parse_review_definition_requires_frontmatter_fence() -> None:
    with pytest.raises(ValueError, match="frontmatter fence"):
        parse_review_definition(
            "# Dignified Python\n\nSome prose without frontmatter.\n",
            name="dignified-python",
        )


def test_parse_review_definition_requires_closing_fence() -> None:
    with pytest.raises(ValueError, match="closing"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_requires_description() -> None:
    with pytest.raises(ValueError, match="description"):
        parse_review_definition(
            "---\ndefault_model: gpt-5-mini\n---\n\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_requires_non_empty_name() -> None:
    with pytest.raises(ValueError, match="name"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="   ",
        )
