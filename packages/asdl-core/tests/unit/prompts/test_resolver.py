"""Tests for repo-local prompt resolution."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from asdl_core.prompts.embedded import load_embedded_default_prompt
from asdl_core.prompts.errors import PromptError
from asdl_core.prompts.models import PromptProvenance, PromptResolution
from asdl_core.prompts.resolver import resolve_prompt


def _repo_root() -> Path:
    current_file = Path(__file__)
    if current_file.exists():
        for candidate in current_file.resolve().parents:
            if (candidate / ".asdl" / "prompts" / "subagent-launch.md").exists():
                return candidate
    raise AssertionError("Could not find repository root with .asdl/prompts/subagent-launch.md")


def test_prompt_error_exposes_stable_type_message_and_string() -> None:
    error = PromptError(error_type="prompt_not_found", message="missing prompt")

    assert error.error_type == "prompt_not_found"
    assert error.message == "missing prompt"
    assert str(error) == "missing prompt"


def test_prompt_provenance_forbids_extra_fields(tmp_path: Path) -> None:
    data = PromptProvenance(
        source="repo",
        repo_prompt_path=tmp_path / ".asdl" / "prompts" / "probe.md",
        prompt_path=tmp_path / ".asdl" / "prompts" / "probe.md",
    ).model_dump()
    data["tier"] = "project"

    with pytest.raises(ValidationError):
        PromptProvenance(**data)


def test_prompt_resolution_is_frozen(tmp_path: Path) -> None:
    resolution = PromptResolution(
        name="probe",
        content="body\n",
        provenance=PromptProvenance(
            source="repo",
            repo_prompt_path=tmp_path / ".asdl" / "prompts" / "probe.md",
            prompt_path=tmp_path / ".asdl" / "prompts" / "probe.md",
        ),
    )

    with pytest.raises(ValidationError):
        resolution.content = "changed\n"  # type: ignore[misc]


def test_resolve_prompt_reads_repo_local_prompt_from_repo_root(tmp_path: Path) -> None:
    prompt_path = tmp_path / ".asdl" / "prompts" / "subagent-launch.md"
    prompt_path.parent.mkdir(parents=True)
    prompt_path.write_text("repo prompt\n\n", encoding="utf-8")

    resolution = resolve_prompt("subagent-launch", repo_root=tmp_path)

    assert resolution.name == "subagent-launch"
    assert resolution.content == "repo prompt\n\n"
    assert resolution.provenance.source == "repo"
    assert resolution.provenance.repo_prompt_path == prompt_path
    assert resolution.provenance.prompt_path == prompt_path
    assert resolution.provenance.default_name is None


def test_resolve_prompt_reads_repo_local_prompt_from_prompt_root(tmp_path: Path) -> None:
    prompt_root = tmp_path / "custom-prompts"
    prompt_root.mkdir()
    prompt_path = prompt_root / "launch.md"
    prompt_path.write_text("custom prompt\n", encoding="utf-8")

    resolution = resolve_prompt("launch", prompt_root=prompt_root)

    assert resolution.content == "custom prompt\n"
    assert resolution.provenance.source == "repo"
    assert resolution.provenance.repo_prompt_path == prompt_path
    assert resolution.provenance.prompt_path == prompt_path


def test_resolve_prompt_rejects_missing_and_duplicate_root_inputs(tmp_path: Path) -> None:
    with pytest.raises(PromptError) as missing_exc_info:
        resolve_prompt("subagent-launch")

    assert missing_exc_info.value.error_type == "prompt_root_invalid"

    with pytest.raises(PromptError) as duplicate_exc_info:
        resolve_prompt("subagent-launch", repo_root=tmp_path, prompt_root=tmp_path / "prompts")

    assert duplicate_exc_info.value.error_type == "prompt_root_invalid"


@pytest.mark.parametrize("name", ["BadName", "nested/prompt", "", ".hidden"])
def test_resolve_prompt_rejects_unsafe_prompt_names(tmp_path: Path, name: str) -> None:
    with pytest.raises(PromptError) as exc_info:
        resolve_prompt(name, repo_root=tmp_path)

    assert exc_info.value.error_type == "prompt_name_invalid"


def test_resolve_prompt_rejects_directory_at_prompt_path(tmp_path: Path) -> None:
    prompt_path = tmp_path / ".asdl" / "prompts" / "subagent-launch.md"
    prompt_path.mkdir(parents=True)

    with pytest.raises(PromptError) as exc_info:
        resolve_prompt("subagent-launch", repo_root=tmp_path)

    assert exc_info.value.error_type == "prompt_root_invalid"


def test_resolve_prompt_uses_injected_embedded_default_with_symbolic_provenance(
    tmp_path: Path,
) -> None:
    resolution = resolve_prompt(
        "probe",
        repo_root=tmp_path,
        embedded_defaults={"probe": "embedded prompt\n"},
    )

    assert resolution.content == "embedded prompt\n"
    assert resolution.provenance.source == "embedded_default"
    assert resolution.provenance.repo_prompt_path == tmp_path / ".asdl" / "prompts" / "probe.md"
    assert resolution.provenance.prompt_path is None
    assert resolution.provenance.default_name == "probe"


def test_resolve_prompt_uses_packaged_subagent_launch_default(tmp_path: Path) -> None:
    resolution = resolve_prompt("subagent-launch", repo_root=tmp_path)

    assert resolution.provenance.source == "embedded_default"
    assert resolution.provenance.repo_prompt_path == (
        tmp_path / ".asdl" / "prompts" / "subagent-launch.md"
    )
    assert resolution.provenance.prompt_path is None
    assert resolution.provenance.default_name == "subagent-launch"
    assert "# Subagent Launch Policy\n" in resolution.content
    assert "## Pi Launch Guidance\n" in resolution.content
    assert "## Claude Launch Guidance\n" in resolution.content
    assert "## Codex Launch Guidance\n" in resolution.content
    assert "## Fallback Behavior\n" in resolution.content


def test_resolve_prompt_reports_missing_prompt_when_default_absent(tmp_path: Path) -> None:
    with pytest.raises(PromptError) as exc_info:
        resolve_prompt("missing", repo_root=tmp_path, embedded_defaults={})

    assert exc_info.value.error_type == "prompt_not_found"
    assert str(tmp_path / ".asdl" / "prompts" / "missing.md") in exc_info.value.message


def test_checked_in_subagent_launch_prompt_matches_embedded_default() -> None:
    checked_in_prompt = _repo_root() / ".asdl" / "prompts" / "subagent-launch.md"
    embedded_prompt = load_embedded_default_prompt("subagent-launch")

    assert embedded_prompt is not None
    assert checked_in_prompt.read_text(encoding="utf-8") == embedded_prompt
