from __future__ import annotations

from click.testing import CliRunner

from packagechk.cli import build_cli
from packagechk.gateways.npm_publish.fake import FakeNpmPublishGateway
from packagechk.gateways.registries.fake import FakePackageRegistryGateway
from packagechk.models import Registry, RegistryCheckResult


def _available_result(name: str = "sample-name") -> RegistryCheckResult:
    return RegistryCheckResult.available(
        Registry.NPM,
        input_name=name,
        lookup_name=name,
    )


def test_packagechk_help_includes_claim_npm_command() -> None:
    result = CliRunner().invoke(build_cli(), ["-h"])

    assert result.exit_code == 0
    assert "claim-npm" in result.output


def test_claim_npm_help_lists_options() -> None:
    result = CliRunner().invoke(build_cli(), ["claim-npm", "--help"])

    assert result.exit_code == 0
    assert "--dry-run" in result.output
    assert "--force" in result.output
    assert "--skip-check" in result.output
    assert "--version" in result.output
    assert "--description" in result.output


def test_claim_npm_dry_run_avoids_external_effects() -> None:
    registry = FakePackageRegistryGateway()
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "sample-name", "--dry-run"],
    )

    assert result.exit_code == 0
    assert "[DRY RUN]" in result.output
    assert "Package name: sample-name" in result.output
    assert "License: MIT" in result.output
    assert "npm URL: https://www.npmjs.com/package/sample-name" in result.output
    assert registry.npm_checked_names == []
    assert publisher.tool_checks == 0
    assert publisher.published_project_dirs == []


def test_claim_npm_invalid_name_exits_before_effects() -> None:
    registry = FakePackageRegistryGateway()
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "Bad-Name", "--dry-run"],
    )

    assert result.exit_code == 2
    assert "npm: invalid" in result.output
    assert "lowercase" in result.output
    assert registry.npm_checked_names == []
    assert publisher.tool_checks == 0
    assert publisher.published_project_dirs == []


def test_claim_npm_scoped_name_dry_run_preserves_name() -> None:
    registry = FakePackageRegistryGateway()
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "@asdl-io/aretro", "--dry-run"],
    )

    assert result.exit_code == 0
    assert "[DRY RUN]" in result.output
    assert "Package name: @asdl-io/aretro" in result.output
    assert "npm URL: https://www.npmjs.com/package/@asdl-io/aretro" in result.output
    assert registry.npm_checked_names == []
    assert publisher.tool_checks == 0
    assert publisher.published_project_dirs == []


def test_claim_npm_scoped_name_successful_claim_publishes() -> None:
    registry = FakePackageRegistryGateway(
        npm_results={
            "@asdl-io/aretro": RegistryCheckResult.available(
                Registry.NPM,
                input_name="@asdl-io/aretro",
                lookup_name="@asdl-io/aretro",
            )
        }
    )
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "@asdl-io/aretro", "--force"],
    )

    assert result.exit_code == 0
    assert "✓ Claimed npm package name '@asdl-io/aretro'." in result.output
    assert "View package: https://www.npmjs.com/package/@asdl-io/aretro" in result.output
    assert registry.npm_checked_names == ["@asdl-io/aretro"]
    assert publisher.tool_checks == 1
    assert len(publisher.published_project_dirs) == 1


def test_claim_npm_malformed_scoped_name_rejected() -> None:
    registry = FakePackageRegistryGateway()
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "@scope/Bad-Name", "--dry-run"],
    )

    assert result.exit_code == 2
    assert "npm: invalid" in result.output
    assert "lowercase" in result.output
    assert registry.npm_checked_names == []
    assert publisher.tool_checks == 0
    assert publisher.published_project_dirs == []


def test_claim_npm_taken_name_exits_before_publish_effects() -> None:
    registry = FakePackageRegistryGateway(
        npm_results={
            "sample-name": RegistryCheckResult.taken(
                Registry.NPM,
                input_name="sample-name",
                lookup_name="sample-name",
                package_url="https://www.npmjs.com/package/sample-name",
            )
        }
    )
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "sample-name", "--force"],
    )

    assert result.exit_code == 1
    assert "npm: taken" in result.output
    assert "https://www.npmjs.com/package/sample-name" in result.output
    assert registry.npm_checked_names == ["sample-name"]
    assert publisher.tool_checks == 0
    assert publisher.published_project_dirs == []


def test_claim_npm_availability_error_exits_before_publish_effects() -> None:
    registry = FakePackageRegistryGateway(
        npm_results={
            "sample-name": RegistryCheckResult.error(
                Registry.NPM,
                input_name="sample-name",
                lookup_name="sample-name",
                message="lookup failed",
            )
        }
    )
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "sample-name", "--force"],
    )

    assert result.exit_code == 2
    assert "npm: error: lookup failed" in result.output
    assert registry.npm_checked_names == ["sample-name"]
    assert publisher.tool_checks == 0
    assert publisher.published_project_dirs == []


def test_claim_npm_skip_check_bypasses_registry() -> None:
    registry = FakePackageRegistryGateway()
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "sample-name", "--skip-check", "--force"],
    )

    assert result.exit_code == 0
    assert registry.npm_checked_names == []
    assert publisher.tool_checks == 1
    assert len(publisher.published_project_dirs) == 1


def test_claim_npm_successful_claim_publishes() -> None:
    registry = FakePackageRegistryGateway(npm_results={"sample-name": _available_result()})
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "sample-name", "--force"],
    )

    assert result.exit_code == 0
    assert "✓ Claimed npm package name 'sample-name'." in result.output
    assert "View package: https://www.npmjs.com/package/sample-name" in result.output
    assert registry.npm_checked_names == ["sample-name"]
    assert publisher.tool_checks == 1
    assert len(publisher.published_project_dirs) == 1


def test_claim_npm_confirmation_decline_aborts_before_publish() -> None:
    registry = FakePackageRegistryGateway(npm_results={"sample-name": _available_result()})
    publisher = FakeNpmPublishGateway()

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "sample-name"],
        input="n\n",
    )

    assert result.exit_code == 1
    assert "Warning: this will publish a real package to npm." in result.output
    assert "Aborted by user." in result.output
    assert registry.npm_checked_names == ["sample-name"]
    assert publisher.tool_checks == 1
    assert publisher.published_project_dirs == []


def test_claim_npm_tool_missing_exits_before_publish() -> None:
    registry = FakePackageRegistryGateway(npm_results={"sample-name": _available_result()})
    publisher = FakeNpmPublishGateway(tools_error="npm is missing")

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "sample-name", "--force"],
    )

    assert result.exit_code == 2
    assert "npm is missing" in result.output
    assert publisher.tool_checks == 1
    assert publisher.published_project_dirs == []


def test_claim_npm_publish_failure_exits_after_publish_attempt() -> None:
    registry = FakePackageRegistryGateway(npm_results={"sample-name": _available_result()})
    publisher = FakeNpmPublishGateway(publish_error="npm publish failed with E403")

    result = CliRunner().invoke(
        build_cli(registry_gateway=registry, npm_publish_gateway=publisher),
        ["claim-npm", "sample-name", "--force"],
    )

    assert result.exit_code == 2
    assert "npm publish failed with E403" in result.output
    assert len(publisher.published_project_dirs) == 1
