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


def _symlink_to(link_path: Path, target_path: Path, *, target_is_directory: bool) -> None:
    try:
        link_path.symlink_to(target_path, target_is_directory=target_is_directory)
    except OSError as exc:
        pytest.skip(f"symlink creation is unavailable: {exc}")


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


def test_resolve_prompt_rejects_symlinked_prompt_file(tmp_path: Path) -> None:
    secret_path = tmp_path / "secret.txt"
    secret_path.write_text("secret material\n", encoding="utf-8")
    prompt_path = tmp_path / ".asdl" / "prompts" / "subagent-launch.md"
    prompt_path.parent.mkdir(parents=True)
    _symlink_to(prompt_path, secret_path, target_is_directory=False)

    with pytest.raises(PromptError) as exc_info:
        resolve_prompt("subagent-launch", repo_root=tmp_path)

    assert exc_info.value.error_type == "prompt_root_invalid"
    assert "symlinks" in exc_info.value.message


def test_resolve_prompt_rejects_symlinked_repo_prompt_directory(tmp_path: Path) -> None:
    outside_asdl = tmp_path / "outside-asdl"
    outside_prompt_path = outside_asdl / "prompts" / "subagent-launch.md"
    outside_prompt_path.parent.mkdir(parents=True)
    outside_prompt_path.write_text("outside prompt\n", encoding="utf-8")
    _symlink_to(tmp_path / ".asdl", outside_asdl, target_is_directory=True)

    with pytest.raises(PromptError) as exc_info:
        resolve_prompt("subagent-launch", repo_root=tmp_path)

    assert exc_info.value.error_type == "prompt_root_invalid"
    assert "symlinks" in exc_info.value.message


def test_resolve_prompt_rejects_explicit_symlinked_prompt_root(tmp_path: Path) -> None:
    actual_prompt_root = tmp_path / "actual-prompts"
    actual_prompt_root.mkdir()
    (actual_prompt_root / "launch.md").write_text("linked prompt\n", encoding="utf-8")
    prompt_root = tmp_path / "prompts-link"
    _symlink_to(prompt_root, actual_prompt_root, target_is_directory=True)

    with pytest.raises(PromptError) as exc_info:
        resolve_prompt("launch", prompt_root=prompt_root)

    assert exc_info.value.error_type == "prompt_root_invalid"
    assert "symlinks" in exc_info.value.message


def test_resolve_prompt_rejects_symlinked_repo_prompt_directory_before_default(
    tmp_path: Path,
) -> None:
    outside_asdl = tmp_path / "outside-asdl"
    outside_asdl.mkdir()
    _symlink_to(tmp_path / ".asdl", outside_asdl, target_is_directory=True)

    with pytest.raises(PromptError) as exc_info:
        resolve_prompt("subagent-launch", repo_root=tmp_path)

    assert exc_info.value.error_type == "prompt_root_invalid"
    assert "symlinks" in exc_info.value.message


def test_resolve_prompt_rejects_explicit_symlinked_prompt_root_before_missing_result(
    tmp_path: Path,
) -> None:
    actual_prompt_root = tmp_path / "actual-prompts"
    actual_prompt_root.mkdir()
    prompt_root = tmp_path / "prompts-link"
    _symlink_to(prompt_root, actual_prompt_root, target_is_directory=True)

    with pytest.raises(PromptError) as exc_info:
        resolve_prompt("missing", prompt_root=prompt_root, embedded_defaults={})

    assert exc_info.value.error_type == "prompt_root_invalid"
    assert "symlinks" in exc_info.value.message


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


def test_resolve_prompt_uses_packaged_planned_branch_write_plan_default(tmp_path: Path) -> None:
    resolution = resolve_prompt("planned-branch-write-plan", repo_root=tmp_path)

    assert resolution.provenance.source == "embedded_default"
    assert resolution.provenance.repo_prompt_path == (
        tmp_path / ".asdl" / "prompts" / "planned-branch-write-plan.md"
    )
    assert resolution.provenance.prompt_path is None
    assert resolution.provenance.default_name == "planned-branch-write-plan"
    assert "Plan audience and context contract:" in resolution.content
    assert "write_source_branch_plan_file" in resolution.content


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


def test_checked_in_planned_branch_write_plan_prompt_is_intentional_repo_override() -> None:
    repo_root = _repo_root()
    checked_in_prompt = repo_root / ".asdl" / "prompts" / "planned-branch-write-plan.md"
    checked_in_content = checked_in_prompt.read_text(encoding="utf-8")
    embedded_prompt = load_embedded_default_prompt("planned-branch-write-plan")

    assert embedded_prompt is not None
    assert checked_in_content != embedded_prompt

    resolution = resolve_prompt("planned-branch-write-plan", repo_root=repo_root)

    assert resolution.provenance.source == "repo"
    assert resolution.provenance.prompt_path == checked_in_prompt
    assert resolution.content == checked_in_content
    assert "Subagent orchestration opportunities:" not in embedded_prompt
    assert "Subagent orchestration opportunities:" in resolution.content
    assert "`Subagent orchestration opportunities: none` with a one-sentence rationale" in (
        resolution.content
    )
    assert "launch-readiness quality bar" in resolution.content
    assert "Prefer ordered waves" in resolution.content
    assert "recommend sequential dispatch and parent validation" in resolution.content
    assert "Subagent model routing:" in resolution.content
    assert "For implementation/editing subagents:" in resolution.content
    assert (
        "Do not set `dispatch_runner_subagent.model` to a cheap/review model."
        in resolution.content
    )
    assert "Never reuse review model guidance for implementation" in resolution.content
    assert (
        "exclusively for in-session review subagents after implementation is complete"
        in resolution.content
    )
    assert "dispatch_runner_subagent.model" in resolution.content
    assert "default_model: haiku" in resolution.content
    assert "openai-codex/gpt-5.4-mini:medium" in resolution.content
    assert "openai-codex/gpt-5.5:high" in resolution.content
