"""Contract checks for objective skill documentation."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _skill_text(name: str) -> str:
    return (REPO_ROOT / "skills" / name / "SKILL.md").read_text(encoding="utf-8")


def _objective_file(relative_path: str) -> str:
    return (REPO_ROOT / "skills" / "objective" / relative_path).read_text(encoding="utf-8")


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
    assert "preassigned marker slug from the roadmap" in text
    assert "Do not generate a fallback slug" in text
    frontmatter = text.split("---", 2)[1]

    assert "Bash(git" not in frontmatter
    assert "Bash(brmem" not in frontmatter
    assert "objective exec update-precheck" not in frontmatter


def test_objective_next_skill_uses_generic_branch_creation_wording() -> None:
    text = _skill_text("objective-next")
    readme = _objective_file("README.md")
    branch_create = "brmem-branch" + "-create"
    branch_impl = "brmem-branch" + "-impl"
    dev_branch_create = "dev-" + branch_create
    dev_branch_impl = "dev-" + branch_impl

    assert "normal branch workflow" in text
    assert branch_create not in text
    assert branch_impl not in text
    assert dev_branch_create not in text
    assert dev_branch_impl not in text
    assert branch_create not in readme
    assert branch_impl not in readme
    assert dev_branch_create not in readme
    assert dev_branch_impl not in readme


def test_objective_create_and_template_preassign_roadmap_slice_slugs() -> None:
    create = _skill_text("objective-create")
    template = _objective_file("templates/roadmap-template.md")

    assert "Preassigned slice slugs" in create
    assert "visible marker shaped ``(slice: `<slug>`)``" in create
    assert "do not get their own markers" in create
    assert "(slice: `steelthread-core-surface`)" in template
    assert "(slice: `next-core-surface`)" in template


def test_objective_shared_docs_preserve_roadmap_slice_markers() -> None:
    objective = _skill_text("objective")
    contract = _objective_file("references/mutation-contract.md")
    update = _skill_text("objective-update")
    reconcile = _skill_text("objective-reconcile")

    assert "preassigned marker shaped ``(slice: `<slug>`)``" in objective
    assert "preserving the old section's marker" in contract
    assert "remove existing slice markers" in update
    assert "add fresh markers immediately" in reconcile
