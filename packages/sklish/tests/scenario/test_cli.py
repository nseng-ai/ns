"""Scenario tests for the `sklish` CLI.

Uses fake `ManifestSource`, `NpxRunner`, and `SkillStateSource` gateways,
injected via `ctx.obj`, to exercise every user-facing flow without touching
real entry-point metadata or spawning real subprocesses.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from click.testing import CliRunner

from sklish.cli import cli
from sklish.discovery import Manifest, ManifestSource
from sklish.invocation import NpxRunner, SkillStateSource


class FakeManifestSource(ManifestSource):
    def __init__(self, manifests: Sequence[Manifest]) -> None:
        self._manifests = tuple(manifests)

    def get_manifests(self) -> tuple[Manifest, ...]:
        return self._manifests


class FakeNpxRunner(NpxRunner):
    def __init__(self, *, available: bool = True, exit_codes: Sequence[int] = ()) -> None:
        self._available = available
        self._exit_codes = list(exit_codes)
        self.invocations: list[tuple[str, ...]] = []

    def is_available(self) -> bool:
        return self._available

    def run(self, argv: Sequence[str]) -> int:
        self.invocations.append(tuple(argv))
        if self._exit_codes:
            return self._exit_codes.pop(0)
        return 0


class FakeSkillStateSource(SkillStateSource):
    def __init__(self, states: Mapping[str, Mapping[str, str]] | None = None) -> None:
        self._states: dict[str, dict[str, str]] = {
            name: dict(inner) for name, inner in (states or {}).items()
        }

    def get_states(self) -> Mapping[str, Mapping[str, str]]:
        return self._states

    @classmethod
    def from_scopes(
        cls,
        scopes_by_skill: Mapping[str, Sequence[str]],
        *,
        source_type: str = "github",
    ) -> FakeSkillStateSource:
        return cls(
            {
                name: {scope: source_type for scope in scopes}
                for name, scopes in scopes_by_skill.items()
            }
        )


def _obj(
    source: ManifestSource,
    runner: NpxRunner,
    state: SkillStateSource | None = None,
) -> dict[str, object]:
    return {
        "manifest_source": source,
        "npx_runner": runner,
        "skill_state_source": state if state is not None else FakeSkillStateSource(),
    }


# -- smoke --


def test_version() -> None:
    result = CliRunner().invoke(cli, ["--version"])
    assert result.exit_code == 0
    assert "version" in result.output


def test_help_short_flag() -> None:
    result = CliRunner().invoke(cli, ["-h"])
    assert result.exit_code == 0
    assert "list" in result.output
    assert "install" in result.output


# -- list --


def test_list_empty() -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["list"],
        obj=_obj(FakeManifestSource([]), FakeNpxRunner()),
    )
    assert result.exit_code == 0
    assert "No sklish manifests" in result.output


def test_list_one_row_per_skill() -> None:
    manifests = [
        Manifest(dist_name="twerk-objectives", source="dagster-io/twerk", skills=("a", "b")),
        Manifest(dist_name="twerk-pr-address", source="dagster-io/twerk", skills=("pr-address",)),
    ]
    result = CliRunner().invoke(
        cli,
        ["list", "--all"],
        obj=_obj(FakeManifestSource(manifests), FakeNpxRunner()),
    )
    assert result.exit_code == 0
    skill_rows = [
        line
        for line in result.output.splitlines()
        if ("twerk-objectives" in line or "twerk-pr-address" in line)
    ]
    assert len(skill_rows) == 3
    assert any("twerk-objectives" in row and " a " in f" {row} " for row in skill_rows)
    assert any("twerk-objectives" in row and " b " in f" {row} " for row in skill_rows)
    assert any("twerk-pr-address" in row and "pr-address" in row for row in skill_rows)
    assert all("dagster-io/twerk" in row for row in skill_rows)


def test_list_defaults_to_all_when_no_flags_given() -> None:
    manifests = [
        Manifest(dist_name="pkg-a", source="o/r", skills=("a1",)),
        Manifest(dist_name="pkg-b", source="o/r", skills=("b1",)),
    ]
    result = CliRunner().invoke(
        cli,
        ["list"],
        obj=_obj(FakeManifestSource(manifests), FakeNpxRunner()),
    )
    assert result.exit_code == 0
    assert "pkg-a" in result.output
    assert "pkg-b" in result.output
    assert "a1" in result.output
    assert "b1" in result.output


def test_list_shows_installed_scope_per_skill() -> None:
    manifests = [
        Manifest(dist_name="pkg", source="o/r", skills=("only-proj", "only-glob", "both", "none")),
    ]
    states = FakeSkillStateSource.from_scopes(
        {
            "only-proj": ("project",),
            "only-glob": ("global",),
            "both": ("project", "global"),
        }
    )
    result = CliRunner().invoke(
        cli,
        ["list"],
        obj=_obj(FakeManifestSource(manifests), FakeNpxRunner(), states),
    )
    assert result.exit_code == 0
    lines = result.output.splitlines()

    def row_for(skill: str) -> str:
        for line in lines:
            if skill in line:
                return line
        raise AssertionError(f"no row for skill {skill!r} in output:\n{result.output}")

    assert "project (github)" in row_for("only-proj")
    assert "global (github)" in row_for("only-glob")
    assert "project+global (github)" in row_for("both")
    assert "—" in row_for("none")


def test_list_shows_local_source_type() -> None:
    manifests = [
        Manifest(dist_name="pkg", source="o/r", skills=("local-skill", "github-skill")),
    ]
    states = FakeSkillStateSource(
        {
            "local-skill": {"project": "local"},
            "github-skill": {"project": "github"},
        }
    )
    result = CliRunner().invoke(
        cli,
        ["list"],
        obj=_obj(FakeManifestSource(manifests), FakeNpxRunner(), states),
    )
    assert result.exit_code == 0
    lines = result.output.splitlines()

    def row_for(skill: str) -> str:
        for line in lines:
            if skill in line:
                return line
        raise AssertionError(f"no row for skill {skill!r} in output:\n{result.output}")

    assert "project (local)" in row_for("local-skill")
    assert "project (github)" in row_for("github-skill")


def test_list_filters_by_package() -> None:
    manifests = [
        Manifest(dist_name="pkg-a", source="o/r", skills=("a1", "a2")),
        Manifest(dist_name="pkg-b", source="o/r", skills=("b1",)),
    ]
    result = CliRunner().invoke(
        cli,
        ["list", "--package", "pkg-b"],
        obj=_obj(FakeManifestSource(manifests), FakeNpxRunner()),
    )
    assert result.exit_code == 0
    assert "pkg-b" in result.output
    assert "b1" in result.output
    assert "o/r" in result.output
    assert "pkg-a" not in result.output
    assert "a1" not in result.output
    assert "a2" not in result.output


def test_list_unknown_package_errors_with_known_list() -> None:
    manifests = [Manifest(dist_name="pkg-a", source="o/r", skills=("a",))]
    result = CliRunner().invoke(
        cli,
        ["list", "--package", "bogus"],
        obj=_obj(FakeManifestSource(manifests), FakeNpxRunner()),
    )
    assert result.exit_code != 0
    assert "Unknown package" in result.output
    assert "pkg-a" in result.output


def test_list_mutually_exclusive_flags() -> None:
    manifests = [Manifest(dist_name="pkg-a", source="o/r", skills=("a",))]
    result = CliRunner().invoke(
        cli,
        ["list", "--all", "--package", "pkg-a"],
        obj=_obj(FakeManifestSource(manifests), FakeNpxRunner()),
    )
    assert result.exit_code != 0
    assert "mutually exclusive" in result.output


# -- install --


def _twerk_manifests() -> list[Manifest]:
    return [
        Manifest(
            dist_name="twerk-objectives",
            source="dagster-io/twerk",
            skills=("objective", "objective-create"),
        ),
        Manifest(
            dist_name="twerk-pr-address",
            source="dagster-io/twerk",
            skills=("pr-address",),
        ),
    ]


def test_install_dry_run_prints_single_batched_command() -> None:
    npx = FakeNpxRunner(available=False)
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "project", "--dry-run"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code == 0
    lines = [line for line in result.output.splitlines() if line]
    assert len(lines) == 1
    assert "npx skills add dagster-io/twerk" in lines[0]
    assert "--skill objective objective-create pr-address" in lines[0]
    assert "--agent codex claude-code -y" in lines[0]
    assert " -g" not in lines[0]
    assert npx.invocations == []


def test_install_dry_run_bypasses_npx_preflight() -> None:
    npx = FakeNpxRunner(available=False)
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "project", "--dry-run"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code == 0


def test_install_runs_npx_for_each_source_group() -> None:
    manifests = [
        Manifest(dist_name="pkg-a", source="o1/r1", skills=("a",)),
        Manifest(dist_name="pkg-b", source="o2/r2", skills=("b",)),
    ]
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "project"],
        obj=_obj(FakeManifestSource(manifests), npx),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 2
    assert npx.invocations[0][:4] == ("npx", "skills", "add", "o1/r1")
    assert npx.invocations[1][:4] == ("npx", "skills", "add", "o2/r2")


def test_install_user_scope_appends_g() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "user"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    assert npx.invocations[0][-1] == "-g"


def test_install_both_scope_runs_twice() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "both"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 2
    has_g = ["-g" in argv for argv in npx.invocations]
    assert has_g == [False, True]


def test_install_filters_by_package() -> None:
    manifests = [
        Manifest(dist_name="pkg-a", source="o1/r1", skills=("a",)),
        Manifest(dist_name="pkg-b", source="o2/r2", skills=("b",)),
    ]
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--package", "pkg-b", "--scope", "project"],
        obj=_obj(FakeManifestSource(manifests), npx),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    assert npx.invocations[0][3] == "o2/r2"


def test_install_package_same_source_batches_into_one_npx_call() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        [
            "install",
            "--package",
            "twerk-objectives",
            "--package",
            "twerk-pr-address",
            "--scope",
            "project",
        ],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    argv = npx.invocations[0]
    assert argv[:4] == ("npx", "skills", "add", "dagster-io/twerk")
    skill_idx = argv.index("--skill")
    agent_idx = argv.index("--agent")
    assert argv[skill_idx + 1 : agent_idx] == ("objective", "objective-create", "pr-address")


def test_install_unknown_package_errors_with_known_list() -> None:
    manifests = [Manifest(dist_name="pkg-a", source="o1/r1", skills=("a",))]
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--package", "bogus", "--scope", "project"],
        obj=_obj(FakeManifestSource(manifests), npx),
    )
    assert result.exit_code != 0
    assert "Unknown package" in result.output
    assert "pkg-a" in result.output
    assert npx.invocations == []


def test_install_requires_targeting_flag() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--scope", "project"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code != 0
    assert "--package" in result.output
    assert "--all" in result.output
    assert npx.invocations == []


def test_install_mutually_exclusive_flags() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--package", "twerk-objectives", "--scope", "project"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code != 0
    assert "mutually exclusive" in result.output
    assert npx.invocations == []


def test_install_no_manifests_is_noop() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--scope", "project"],
        obj=_obj(FakeManifestSource([]), npx),
    )
    assert result.exit_code == 0
    assert npx.invocations == []
    assert "No sklish manifests" in result.output


def test_install_missing_npx_exits_non_zero_with_helpful_message() -> None:
    npx = FakeNpxRunner(available=False)
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "project"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code != 0
    assert "npx is not on PATH" in result.output
    assert "--dry-run" in result.output
    assert npx.invocations == []


def test_install_propagates_non_zero_exit_and_fails_fast() -> None:
    manifests = [
        Manifest(dist_name="pkg-a", source="o1/r1", skills=("a",)),
        Manifest(dist_name="pkg-b", source="o2/r2", skills=("b",)),
    ]
    npx = FakeNpxRunner(exit_codes=(7, 0))
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "project"],
        obj=_obj(FakeManifestSource(manifests), npx),
    )
    assert result.exit_code == 7
    assert len(npx.invocations) == 1


def test_install_prompts_for_scope_when_absent_and_defaults_to_project() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--all"],
        input="\n",
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code == 0
    assert "Install scope" in result.output
    assert len(npx.invocations) == 1
    assert "-g" not in npx.invocations[0]


def _all_twerk_skills_at_project() -> FakeSkillStateSource:
    return FakeSkillStateSource.from_scopes(
        {
            "objective": ("project",),
            "objective-create": ("project",),
            "pr-address": ("project",),
        }
    )


def test_install_is_noop_when_all_installed_at_project_without_scope_flag() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, _all_twerk_skills_at_project()),
    )
    assert result.exit_code == 0
    assert "already installed at project scope" in result.output
    assert "Install scope" not in result.output
    assert npx.invocations == []


def test_install_skips_already_installed_skills_for_explicit_scope() -> None:
    npx = FakeNpxRunner()
    states = FakeSkillStateSource.from_scopes({"objective": ("project",)})
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "project"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, states),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    argv = npx.invocations[0]
    skill_idx = argv.index("--skill")
    agent_idx = argv.index("--agent")
    assert argv[skill_idx + 1 : agent_idx] == ("objective-create", "pr-address")


def test_install_explicit_project_scope_noop_when_already_covered() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "project"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, _all_twerk_skills_at_project()),
    )
    assert result.exit_code == 0
    assert "already installed at project scope" in result.output
    assert npx.invocations == []


def test_install_both_scope_skips_variant_that_is_fully_covered() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--scope", "both"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, _all_twerk_skills_at_project()),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    assert "-g" in npx.invocations[0]


def test_install_dry_run_noop_prints_already_installed_message() -> None:
    npx = FakeNpxRunner(available=False)
    result = CliRunner().invoke(
        cli,
        ["install", "--all", "--dry-run"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, _all_twerk_skills_at_project()),
    )
    assert result.exit_code == 0
    assert "already installed at project scope" in result.output
    assert "Install scope" not in result.output
    assert "npx skills add" not in result.output
    assert npx.invocations == []


# -- update --


def test_update_no_manifests_is_noop() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource([]), npx),
    )
    assert result.exit_code == 0
    assert npx.invocations == []
    assert "No sklish manifests" in result.output


def test_update_with_no_installed_skills_prints_message() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code == 0
    assert npx.invocations == []
    assert "No installed skills to update" in result.output


def test_update_project_only_skills_runs_with_p_flag() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, _all_twerk_skills_at_project()),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    argv = npx.invocations[0]
    assert argv[:3] == ("npx", "skills", "update")
    assert "-p" in argv
    assert "-g" not in argv
    assert "-y" in argv
    assert "objective" in argv
    assert "objective-create" in argv
    assert "pr-address" in argv


def test_update_global_only_skills_runs_with_g_flag() -> None:
    npx = FakeNpxRunner()
    states = FakeSkillStateSource.from_scopes(
        {
            "objective": ("global",),
            "objective-create": ("global",),
            "pr-address": ("global",),
        }
    )
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, states),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    argv = npx.invocations[0]
    assert "-g" in argv
    assert "-p" not in argv


def test_update_mixed_scopes_runs_two_commands_project_then_global() -> None:
    npx = FakeNpxRunner()
    states = FakeSkillStateSource.from_scopes(
        {
            "objective": ("project",),
            "objective-create": ("project", "global"),
            "pr-address": ("global",),
        }
    )
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, states),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 2
    first, second = npx.invocations
    assert "-p" in first
    assert "-g" in second
    assert "objective" in first and "objective-create" in first and "pr-address" not in first
    assert "objective-create" in second and "pr-address" in second and "objective" not in second


def test_update_skips_uninstalled_skills() -> None:
    npx = FakeNpxRunner()
    states = FakeSkillStateSource.from_scopes({"objective": ("project",)})
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, states),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    argv = npx.invocations[0]
    assert "objective" in argv
    assert "objective-create" not in argv
    assert "pr-address" not in argv


def test_update_filters_by_package() -> None:
    npx = FakeNpxRunner()
    states = FakeSkillStateSource.from_scopes(
        {
            "objective": ("project",),
            "objective-create": ("project",),
            "pr-address": ("project",),
        }
    )
    result = CliRunner().invoke(
        cli,
        ["update", "--package", "twerk-pr-address"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, states),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    argv = npx.invocations[0]
    assert "pr-address" in argv
    assert "objective" not in argv


def test_update_requires_targeting_flag() -> None:
    npx = FakeNpxRunner()
    result = CliRunner().invoke(
        cli,
        ["update"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx),
    )
    assert result.exit_code != 0
    assert "--package" in result.output
    assert "--all" in result.output
    assert npx.invocations == []


def test_update_dry_run_prints_commands_without_executing() -> None:
    npx = FakeNpxRunner(available=False)
    result = CliRunner().invoke(
        cli,
        ["update", "--all", "--dry-run"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, _all_twerk_skills_at_project()),
    )
    assert result.exit_code == 0
    lines = [line for line in result.output.splitlines() if line]
    assert len(lines) == 1
    assert "npx skills update" in lines[0]
    assert " -p" in lines[0]
    assert " -y" in lines[0]
    assert npx.invocations == []


def test_update_missing_npx_exits_non_zero() -> None:
    npx = FakeNpxRunner(available=False)
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, _all_twerk_skills_at_project()),
    )
    assert result.exit_code != 0
    assert "npx is not on PATH" in result.output
    assert npx.invocations == []


def test_update_skips_local_source_skills() -> None:
    npx = FakeNpxRunner()
    states = FakeSkillStateSource(
        {
            "objective": {"project": "local"},
            "objective-create": {"project": "local"},
            "pr-address": {"project": "github"},
        }
    )
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, states),
    )
    assert result.exit_code == 0
    assert len(npx.invocations) == 1
    argv = npx.invocations[0]
    assert "pr-address" in argv
    assert "objective" not in argv
    assert "objective-create" not in argv
    assert "Skipping local-source skills" in result.output
    assert "objective" in result.output
    assert "objective-create" in result.output


def test_update_all_local_source_skills_is_noop() -> None:
    npx = FakeNpxRunner()
    states = FakeSkillStateSource(
        {
            "objective": {"project": "local"},
            "objective-create": {"project": "local"},
            "pr-address": {"project": "local"},
        }
    )
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, states),
    )
    assert result.exit_code == 0
    assert npx.invocations == []
    assert "Skipping local-source skills" in result.output
    assert "No installed skills to update" not in result.output


def test_update_propagates_non_zero_exit_and_fails_fast() -> None:
    npx = FakeNpxRunner(exit_codes=(7, 0))
    states = FakeSkillStateSource.from_scopes(
        {
            "objective": ("project",),
            "pr-address": ("global",),
        }
    )
    result = CliRunner().invoke(
        cli,
        ["update", "--all"],
        obj=_obj(FakeManifestSource(_twerk_manifests()), npx, states),
    )
    assert result.exit_code == 7
    assert len(npx.invocations) == 1
    assert "-p" in npx.invocations[0]
