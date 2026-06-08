from __future__ import annotations

from pathlib import Path

import pytest

from roaster.review_definition import parse_review_definition

_REPO_ROOT = Path(__file__).parents[4]
_DIGNIFIED_PYTHON_REVIEW = _REPO_ROOT / "reviews" / "dignified-python.md"
_SIMPLIFY_REVIEW = _REPO_ROOT / "reviews" / "simplify.md"
_TYPESCRIPT_STYLE_REVIEW = _REPO_ROOT / "reviews" / "typescript-style.md"


@pytest.mark.parametrize(
    ("review_path", "name", "expected_model", "expected_ci", "expected_when_changed"),
    [
        (_DIGNIFIED_PYTHON_REVIEW, "dignified-python", "haiku", True, ("**/*.py",)),
        (
            _TYPESCRIPT_STYLE_REVIEW,
            "typescript-style",
            "haiku",
            True,
            ("**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"),
        ),
        (
            _SIMPLIFY_REVIEW,
            "simplify",
            "sonnet",
            False,
            (
                "**/*.c",
                "**/*.cc",
                "**/*.cpp",
                "**/*.cs",
                "**/*.go",
                "**/*.java",
                "**/*.js",
                "**/*.jsx",
                "**/*.kt",
                "**/*.mjs",
                "**/*.mts",
                "**/*.py",
                "**/*.rs",
                "**/*.sh",
                "**/*.swift",
                "**/*.ts",
                "**/*.tsx",
            ),
        ),
    ],
)
def test_parse_real_review_definition(
    review_path: Path,
    name: str,
    expected_model: str,
    expected_ci: bool,
    expected_when_changed: tuple[str, ...],
) -> None:
    source = review_path.read_text(encoding="utf-8")
    definition = parse_review_definition(source, name=name)

    assert definition.name == name
    assert definition.description.strip()
    assert definition.default_model == expected_model
    assert definition.ci is expected_ci
    assert definition.when_changed == expected_when_changed
    assert definition.instructions.strip()


def test_parse_review_definition_success() -> None:
    definition = parse_review_definition(
        "---\n"
        "description: Review Python diffs for style violations.\n"
        "default_model: sonnet\n"
        "ci: true\n"
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
    assert definition.ci is True
    assert definition.when_changed == ("**/*.py", "pyproject.toml")


def test_parse_review_definition_without_default_model() -> None:
    definition = parse_review_definition(
        "---\n"
        "description: Review Python diffs for style violations.\n"
        "ci: true\n"
        "---\n"
        "\n"
        "Flag concrete issues in the diff.\n",
        name="dignified-python",
    )

    assert definition.default_model is None
    assert definition.ci is True
    assert definition.when_changed == ()


def test_parse_review_definition_accepts_ci_false() -> None:
    definition = parse_review_definition(
        "---\n"
        "description: Review Python diffs for style violations.\n"
        "ci: false\n"
        "---\n"
        "\n"
        "Flag concrete issues in the diff.\n",
        name="dignified-python",
    )

    assert definition.ci is False


def test_parse_review_definition_requires_ci() -> None:
    with pytest.raises(ValueError, match="missing required field `ci`"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_rejects_ci_string() -> None:
    with pytest.raises(ValueError, match="literal true or false"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            'ci: "true"\n'
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_rejects_ci_non_literal_boolean() -> None:
    with pytest.raises(ValueError, match="literal true or false"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "ci: yes\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_rejects_ci_number() -> None:
    with pytest.raises(ValueError, match="literal true or false"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "ci: 1\n"
            "---\n"
            "\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_rejects_when_changed_string() -> None:
    with pytest.raises(ValueError, match="`when_changed`"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "ci: true\n"
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
            "ci: true\n"
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
            "ci: true\n"
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
            "---\ndescription: Review Python diffs for style violations.\nci: true\n---\n",
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
            "---\ndefault_model: sonnet\nci: true\n---\n\nFlag concrete issues in the diff.\n",
            name="dignified-python",
        )


def test_parse_review_definition_requires_non_empty_name() -> None:
    with pytest.raises(ValueError, match="name"):
        parse_review_definition(
            "---\n"
            "description: Review Python diffs for style violations.\n"
            "ci: true\n"
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
            "ci: true\n"
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
            "ci: true\n"
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
        f"ci: true\n"
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
            "ci: true\n"
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
            "ci: true\n"
            "  bad-indent: value\n"
            "\tmixed: tabs\n"
            "---\n"
            "\nFlag concrete issues.\n",
            name="dignified-python",
        )
