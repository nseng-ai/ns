"""Contract checks for objective skill documentation."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _skill_text(name: str) -> str:
    return (REPO_ROOT / "skills" / name / "SKILL.md").read_text()


def test_objective_current_skill_contract_is_stack_map() -> None:
    text = _skill_text("objective-current")

    assert "description: 'Read-only orientation view" in text
    assert "Read-only orientation view" in text
    assert "Bash(objective exec current *)" in text
    assert "objective exec current" in text
    assert "## Stack Map" in text
    assert "## Current Branch Context" in text
    assert "## Next Orientation Step" in text
    assert "objective-digest <slug>" in text
    assert "No objective-content analysis" in text
    assert "## Downstack" not in text
    assert "## Upstack" not in text


def test_objective_digest_skill_contract_is_dossier() -> None:
    text = _skill_text("objective-digest")

    assert "description: 'Read-only objective dossier" in text
    assert "Render a one-page objective dossier" in text
    assert "## Related Objective Views" in text
    assert "objective-current" in text
    assert "where am I in the current stack" in text


def test_objective_next_skill_delegates_deterministic_facts_to_cli() -> None:
    text = _skill_text("objective-next")

    assert "Bash(objective exec next-context *)" in text
    assert "Bash(objective exec next-collision *)" in text
    assert "objective exec next-context [<slug>] --format json" in text
    assert "objective exec next-collision <candidate-slug> --format json" in text
    frontmatter = text.split("---", 2)[1]

    assert "Bash(git" not in frontmatter
    assert "Bash(brmem" not in frontmatter
    assert "objective exec update-precheck" not in frontmatter


def test_objective_next_skill_uses_current_branch_creation_wording() -> None:
    text = _skill_text("objective-next")

    assert "brmem-branch-create" in text
    assert "brmem-create-branch" not in text
