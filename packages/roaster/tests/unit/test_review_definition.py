from __future__ import annotations

from pathlib import Path

import pytest

from roaster.review_definition import parse_review_definition

_REPO_ROOT = Path(__file__).parents[4]
_DIGNIFIED_PYTHON_REVIEW = _REPO_ROOT / "reviews" / "dignified-python.md"
_TYPESCRIPT_STYLE_REVIEW = _REPO_ROOT / "reviews" / "typescript-style.md"


def test_parse_real_dignified_python_review() -> None:
    source = _DIGNIFIED_PYTHON_REVIEW.read_text(encoding="utf-8")
    definition = parse_review_definition(source, name="dignified-python")

    assert definition.name == "dignified-python"
    assert definition.description.strip()
    assert definition.default_model == "haiku"
    assert definition.when_changed == ("**/*.py",)
    assert definition.instructions.strip()


def test_parse_real_typescript_style_review() -> None:
    source = _TYPESCRIPT_STYLE_REVIEW.read_text(encoding="utf-8")
    definition = parse_review_definition(source, name="typescript-style")

    assert definition.name == "typescript-style"
    assert definition.description.strip()
    assert definition.default_model == "haiku"
    assert definition.when_changed == ("**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts")
    assert definition.instructions.strip()


def test_parse_review_definition_success() -> None:
    definition = parse_review_definition(
        "---\n"
        "description: Review Python diffs for style violations.\n"
        "default_model: sonnet\n"
        "when_changed:\n"
        "  - '**/*.py'\n"
        "  - 'pyproject.toml'\n"
        "---\n"
        "\n"
        "Flag concrete issues in the diff.\n",
        name="dignified-python",
    )

    assert definition.name == "dignified-python"
    assert definition.description == "Review Python diffs for style violations."
    assert definition.instructions == "Flag concrete issues in the diff."
    assert definition.default_model == "sonnet"
    assert definition.when_changed == ("**/*.py", "pyproject.toml")


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
    assert definition.when_changed == ()


def test_parse_review_definition_rejects_when_changed_string() -> None:
    with pytest.raises(ValueError, match="`when_changed`"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "when_changed: '**/*.py'\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_rejects_empty_when_changed_list() -> None:
    with pytest.raises(ValueError, match="at least one"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "when_changed: []\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_rejects_empty_when_changed_item() -> None:
    with pytest.raises(ValueError, match="item 1"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "when_changed:\n"
            "  - '**/*.py'\n"
            "  - ''\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


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


@pytest.mark.parametrize("default_model", ["5", '""'])
def test_parse_review_definition_requires_default_model_non_empty_string(
    default_model: str,
) -> None:
    with pytest.raises(ValueError, match="`default_model`"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            f"default_model: {default_model}\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_rejects_non_mapping_frontmatter() -> None:
    with pytest.raises(ValueError, match="must be a YAML mapping"):
        parse_review_definition(
            "---\n- description: Review Python diffs.\n---\n\nFlag concrete issues.\n",
            name="dignified-python",
        )


def test_parse_review_definition_rejects_invalid_yaml_frontmatter() -> None:
    with pytest.raises(ValueError, match="not valid YAML"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs.\n"
            "default_model: sonnet\n"
            "  bad-indent: value\n"
            "\tmixed: tabs\n"
            "---\n"
            "\nFlag concrete issues.\n",
            name="dignified-python",
        )
