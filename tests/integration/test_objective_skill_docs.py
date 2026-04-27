"""Contract checks for objective skill documentation."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _skill_text(name: str) -> str:
    return (REPO_ROOT / "skills" / name / "SKILL.md").read_text()


def test_objective_current_skill_contract_is_stack_map() -> None:
    text = _skill_text("objective-current")

    assert "description: 'Read-only stack map" in text
    assert "Read-only current stack map" in text
    assert "## Stack Map" in text
    assert "## Current Branch Context" in text
    assert "## Next Orientation Step" in text
    assert "objective-digest <slug>" in text
    assert "Do not render `body_last_touched`" in text
    assert "body_last_touched" in text
    assert "body last touched" not in text
    assert "## Downstack" not in text
    assert "## Upstack" not in text
    assert "orientation digest" not in text


def test_objective_digest_skill_contract_is_dossier() -> None:
    text = _skill_text("objective-digest")

    assert "description: 'Read-only objective dossier" in text
    assert "Render a one-page objective dossier" in text
    assert "## Related Objective Views" in text
    assert "objective-current" in text
    assert "where am I in the current stack" in text
