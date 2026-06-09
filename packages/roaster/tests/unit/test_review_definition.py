from __future__ import annotations

from pathlib import Path

import pytest

from roaster.models import ReviewApplicability
from roaster.review_definition import parse_review_definition

_REPO_ROOT = Path(__file__).parents[4]
_DIGNIFIED_PYTHON_REVIEW = _REPO_ROOT / "reviews" / "dignified-python.md"
_TYPESCRIPT_STYLE_REVIEW = _REPO_ROOT / "reviews" / "typescript-style.md"


@pytest.mark.parametrize(
    ("review_path", "name", "expected_model", "expected_applicability"),
    [
        (
            _DIGNIFIED_PYTHON_REVIEW,
            "dignified-python",
            "haiku",
            ReviewApplicability(include=("**/*.py",), exclude=("**/tests/**/*.py",)),
        ),
        (
            _TYPESCRIPT_STYLE_REVIEW,
            "typescript-style",
            "haiku",
            ReviewApplicability(include=("**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts")),
        ),
    ],
)
def test_parse_real_review_definition(
    review_path: Path,
    name: str,
    expected_model: str,
    expected_applicability: ReviewApplicability,
) -> None:
    source = review_path.read_text(encoding="utf-8")
    definition = parse_review_definition(source, name=name)

    assert definition.name == name
    assert definition.description.strip()
    assert definition.default_model == expected_model
    assert definition.applicability == expected_applicability
    assert definition.instructions.strip()


def test_parse_review_definition_success() -> None:
    definition = parse_review_definition(
        "---\n"
        "description: Review Python diffs for style violations.\n"
        "default_model: sonnet\n"
        "---\n"
        "\n"
        "Flag concrete issues in the diff.\n",
        name="dignified-python",
    )

    assert definition.name == "dignified-python"
    assert definition.description == "Review Python diffs for style violations."
    assert definition.instructions == "Flag concrete issues in the diff."
    assert definition.default_model == "sonnet"
    assert definition.applicability == ReviewApplicability()


def test_parse_review_definition_with_applicability() -> None:
    definition = parse_review_definition(
        "---\n"
        "description: Review Python diffs for style violations.\n"
        "default_model: sonnet\n"
        "applies_to:\n"
        "  include:\n"
        "    - '**/*.py'\n"
        "  exclude:\n"
        "    - '**/tests/**/*.py'\n"
        "---\n"
        "\n"
        "Flag concrete issues in the diff.\n",
        name="dignified-python",
    )

    assert definition.applicability == ReviewApplicability(
        include=("**/*.py",),
        exclude=("**/tests/**/*.py",),
    )


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
    assert definition.applicability == ReviewApplicability()


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
            "---\ndefault_model: sonnet\n---\n\nFlag concrete issues in the diff.\n",
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


def test_parse_review_definition_rejects_unknown_frontmatter_key() -> None:
    with pytest.raises(ValueError, match=r"unknown field\(s\).*`severity`"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "default_model: sonnet\n"
            "severity: error\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_lists_all_unknown_frontmatter_keys() -> None:
    with pytest.raises(ValueError) as excinfo:
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "default_model: sonnet\n"
            "severity: error\n"
            "owner: team-platform\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )
    message = str(excinfo.value)
    assert "`owner`" in message
    assert "`severity`" in message
    assert "Allowed fields:" in message


@pytest.mark.parametrize(
    "model",
    ["sonnet", "opus", "haiku", "claude-sonnet-4-6", "gpt-5-mini"],
)
def test_parse_review_definition_accepts_non_empty_default_models(model: str) -> None:
    definition = parse_review_definition(
        f"---\n"
        f"description: Review Python diffs for style violations.\n"
        f"default_model: {model}\n"
        f"---\n"
        f"\nFlag concrete issues in the diff.\n",
        name="dignified-python",
    )

    assert definition.default_model == model


@pytest.mark.parametrize("default_model", ["", "   ", "[]", "123"])
def test_parse_review_definition_rejects_invalid_default_model(default_model: str) -> None:
    with pytest.raises(ValueError, match="default_model"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            f"default_model: {default_model}\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


@pytest.mark.parametrize(
    ("applies_to_yaml", "message"),
    [
        ("applies_to: []\n", "applies_to"),
        (
            "applies_to:\n  include:\n    - '**/*.py'\n  owner: team-platform\n",
            "unknown field",
        ),
        (
            "applies_to:\n  exclude:\n    - '**/tests/**/*.py'\n",
            "applies_to.include",
        ),
        (
            "applies_to:\n  include: []\n",
            "applies_to.include",
        ),
        (
            "applies_to:\n  include: '**/*.py'\n",
            "list of strings",
        ),
        (
            "applies_to:\n  include:\n    - 123\n",
            "non-empty strings",
        ),
        (
            "applies_to:\n  include:\n    - ''\n",
            "non-empty strings",
        ),
        (
            "applies_to:\n  include:\n    - '/src/**/*.py'\n",
            "repo-relative",
        ),
        (
            "applies_to:\n  include:\n    - '../src/**/*.py'\n",
            "must not contain `..`",
        ),
        (
            "applies_to:\n  include:\n    - ':(glob)**/*.py'\n",
            "not git pathspecs",
        ),
    ],
)
def test_parse_review_definition_rejects_invalid_applicability(
    applies_to_yaml: str,
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            f"{applies_to_yaml}"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )
