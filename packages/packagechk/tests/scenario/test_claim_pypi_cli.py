from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner

from packagechk.cli import build_cli
from packagechk.gateways.pypi_publish.fake import FakePypiPublishGateway
from packagechk.gateways.registries.fake import FakePackageRegistryGateway
from packagechk.models import Registry, RegistryCheckResult


def _publish_artifacts() -> list[Path]:
    return [Path("dist/sample-0.0.1.tar.gz"), Path("dist/sample-0.0.1-py3-none-any.whl")]


def _available_result(name: str = "sample-name") -> RegistryCheckResult:
    return RegistryCheckResult.available(
        Registry.PYPI,
        input_name=name,
        lookup_name=name,
    )


def test_packagechk_help_includes_claim_pypi_command() -> None:
    result = CliRunner().invoke(build_cli(), ["-h"])

    assert result.exit_code == 0
    assert "claim-pypi" in result.output
    assert "Default check path" in result.output
    assert "--registry" in result.output
    assert "--json" in result.output


def test_claim_pypi_help_lists_options() -> None:
    result = CliRunner().invoke(build_cli(), ["claim-pypi", "--help"])

    assert result.exit_code == 0
    assert "--dry-run" in result.output
    assert "--force" in result.output
    assert "--skip-check" in result.output
    assert "--version" in result.output
    assert "--description" in result.output


def test_claim_pypi_dry_run_avoids_external_effects() -> None:
    registry = FakePackageRegistryGateway()
    publisher = FakePypiPublishGateway(artifacts=_publish_artifacts())

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "Foo_Bar", "--dry-run"],
    )

    assert result.exit_code == 0
    assert "[DRY RUN]" in result.output
    assert "PyPI lookup name: foo-bar" in result.output
    assert "Module name: foo_bar" in result.output
    assert "PyPI URL: https://pypi.org/project/foo-bar/" in result.output
    assert registry.pypi_checked_names == []
    assert publisher.tool_checks == 0
    assert publisher.built_project_dirs == []
    assert publisher.published_artifacts == []


def test_claim_pypi_invalid_name_exits_before_effects() -> None:
    registry = FakePackageRegistryGateway()
    publisher = FakePypiPublishGateway(artifacts=_publish_artifacts())

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "bad!name", "--dry-run"],
    )

    assert result.exit_code == 2
    assert "pypi: invalid" in result.output
    assert "must start and end" in result.output
    assert registry.pypi_checked_names == []
    assert publisher.tool_checks == 0
    assert publisher.built_project_dirs == []
    assert publisher.published_artifacts == []


def test_claim_pypi_taken_name_exits_before_publish_effects() -> None:
    registry = FakePackageRegistryGateway(
        pypi_results={
            "sample-name": RegistryCheckResult.taken(
                Registry.PYPI,
                input_name="sample-name",
                lookup_name="sample-name",
                package_url="https://pypi.org/project/sample-name/",
            )
        }
    )
    publisher = FakePypiPublishGateway(artifacts=_publish_artifacts())

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "sample-name", "--force"],
    )

    assert result.exit_code == 1
    assert "pypi: taken" in result.output
    assert "https://pypi.org/project/sample-name/" in result.output
    assert registry.pypi_checked_names == ["sample-name"]
    assert publisher.tool_checks == 0
    assert publisher.built_project_dirs == []
    assert publisher.published_artifacts == []


def test_claim_pypi_availability_error_exits_before_publish_effects() -> None:
    registry = FakePackageRegistryGateway(
        pypi_results={
            "sample-name": RegistryCheckResult.error(
                Registry.PYPI,
                input_name="sample-name",
                lookup_name="sample-name",
                message="lookup failed",
            )
        }
    )
    publisher = FakePypiPublishGateway(artifacts=_publish_artifacts())

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "sample-name", "--force"],
    )

    assert result.exit_code == 2
    assert "pypi: error: lookup failed" in result.output
    assert registry.pypi_checked_names == ["sample-name"]
    assert publisher.tool_checks == 0
    assert publisher.built_project_dirs == []
    assert publisher.published_artifacts == []


def test_claim_pypi_skip_check_bypasses_registry() -> None:
    registry = FakePackageRegistryGateway()
    artifacts = _publish_artifacts()
    publisher = FakePypiPublishGateway(artifacts=artifacts)

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "sample-name", "--skip-check", "--force"],
    )

    assert result.exit_code == 0
    assert registry.pypi_checked_names == []
    assert publisher.tool_checks == 1
    assert len(publisher.built_project_dirs) == 1
    assert publisher.published_artifacts == [artifacts]


def test_claim_pypi_successful_claim_builds_and_publishes() -> None:
    registry = FakePackageRegistryGateway(pypi_results={"sample-name": _available_result()})
    artifacts = _publish_artifacts()
    publisher = FakePypiPublishGateway(artifacts=artifacts)

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "sample-name", "--force"],
    )

    assert result.exit_code == 0
    assert "✓ Claimed PyPI package name 'sample-name'." in result.output
    assert "View project: https://pypi.org/project/sample-name/" in result.output
    assert registry.pypi_checked_names == ["sample-name"]
    assert publisher.tool_checks == 1
    assert len(publisher.built_project_dirs) == 1
    assert publisher.published_artifacts == [artifacts]


def test_claim_pypi_reports_normalized_lookup_name_before_publish() -> None:
    registry = FakePackageRegistryGateway(
        pypi_results={
            "Foo_Bar": RegistryCheckResult.available(
                Registry.PYPI,
                input_name="Foo_Bar",
                lookup_name="foo-bar",
            )
        }
    )
    publisher = FakePypiPublishGateway(artifacts=_publish_artifacts())

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "Foo_Bar", "--force"],
    )

    assert result.exit_code == 0
    assert "PyPI lookup name: foo-bar" in result.output
    assert "View project: https://pypi.org/project/foo-bar/" in result.output
    assert registry.pypi_checked_names == ["Foo_Bar"]


def test_claim_pypi_confirmation_decline_aborts_before_build() -> None:
    registry = FakePackageRegistryGateway(pypi_results={"sample-name": _available_result()})
    publisher = FakePypiPublishGateway(artifacts=_publish_artifacts())

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "sample-name"],
        input="n\n",
    )

    assert result.exit_code == 1
    assert "Warning: this will publish a real package to PyPI." in result.output
    assert "Aborted by user." in result.output
    assert registry.pypi_checked_names == ["sample-name"]
    assert publisher.tool_checks == 1
    assert publisher.built_project_dirs == []
    assert publisher.published_artifacts == []


def test_claim_pypi_tool_missing_exits_before_build() -> None:
    registry = FakePackageRegistryGateway(pypi_results={"sample-name": _available_result()})
    publisher = FakePypiPublishGateway(tools_error="uv is missing", artifacts=_publish_artifacts())

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "sample-name", "--force"],
    )

    assert result.exit_code == 2
    assert "uv is missing" in result.output
    assert publisher.tool_checks == 1
    assert publisher.built_project_dirs == []
    assert publisher.published_artifacts == []


def test_claim_pypi_publish_failure_exits_after_publish_attempt() -> None:
    registry = FakePackageRegistryGateway(pypi_results={"sample-name": _available_result()})
    artifacts = _publish_artifacts()
    publisher = FakePypiPublishGateway(artifacts=artifacts, publish_error="publish failed")

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, pypi_publish_gateway=publisher),
        ["claim-pypi", "sample-name", "--force"],
    )

    assert result.exit_code == 2
    assert "publish failed" in result.output
    assert len(publisher.built_project_dirs) == 1
    assert publisher.published_artifacts == [artifacts]


def test_packagechk_bare_name_still_dispatches_to_check_api() -> None:
    registry = FakePackageRegistryGateway(
        pypi_results={"sample-name": _available_result()},
        npm_results={
            "sample-name": RegistryCheckResult.available(
                Registry.NPM,
                input_name="sample-name",
                lookup_name="sample-name",
            )
        },
    )

    result = CliRunner().invoke(build_cli(registry_gateway=registry), ["sample-name"])

    assert result.exit_code == 0
    assert result.output.splitlines() == ["pypi: available", "npm: available"]
    assert registry.pypi_checked_names == ["sample-name"]
    assert registry.npm_checked_names == ["sample-name"]


def test_packagechk_legacy_check_options_can_still_come_before_name() -> None:
    registry = FakePackageRegistryGateway(pypi_results={"sample-name": _available_result()})

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry),
        ["--registry", "pypi", "sample-name"],
    )

    assert result.exit_code == 0
    assert result.output == "pypi: available\n"
    assert registry.pypi_checked_names == ["sample-name"]
    assert registry.npm_checked_names == []


def test_packagechk_legacy_check_version_option_still_works_after_name() -> None:
    result = CliRunner().invoke(build_cli(), ["sample-name", "--version"])

    assert result.exit_code == 0
    assert "packagechk" in result.output
    assert "version" in result.output.lower()
