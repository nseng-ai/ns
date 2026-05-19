from __future__ import annotations

import json

from click.testing import CliRunner

from packagechk.cli import build_cli
from packagechk.gateways.registries.fake import FakePackageRegistryGateway
from packagechk.models import Registry, RegistryCheckResult


def test_packagechk_help() -> None:
    result = CliRunner().invoke(build_cli(), ["-h"])

    assert result.exit_code == 0
    assert "Usage: packagechk" in result.output
    assert "Check whether a package name is available to claim." in result.output
    assert "--registry" in result.output
    assert "--json" in result.output
    assert "--version" in result.output


def test_packagechk_version() -> None:
    result = CliRunner().invoke(build_cli(), ["--version"])

    assert result.exit_code == 0
    assert "packagechk" in result.output
    assert "version" in result.output.lower()


def test_packagechk_rejects_brew_registry_as_not_implemented() -> None:
    result = CliRunner().invoke(build_cli(), ["sample-name", "--registry", "brew"])

    assert result.exit_code == 2
    assert "brew: unsupported" in result.output
    assert "Homebrew availability checks are not implemented yet" in result.output


def test_packagechk_checks_default_registries_with_injected_gateway() -> None:
    gateway = FakePackageRegistryGateway(
        pypi_results={
            "sample-name": RegistryCheckResult.available(
                Registry.PYPI,
                input_name="sample-name",
                lookup_name="sample-name",
            )
        },
        npm_results={
            "sample-name": RegistryCheckResult.taken(
                Registry.NPM,
                input_name="sample-name",
                lookup_name="sample-name",
            )
        },
    )

    result = CliRunner().invoke(build_cli(gateway), ["sample-name"])

    assert result.exit_code == 1
    assert result.output.splitlines() == ["pypi: available", "npm: taken"]
    assert gateway.pypi_checked_names == ["sample-name"]
    assert gateway.npm_checked_names == ["sample-name"]


def test_packagechk_json_output_is_structured() -> None:
    gateway = FakePackageRegistryGateway(
        pypi_results={
            "sample-name": RegistryCheckResult.available(
                Registry.PYPI,
                input_name="sample-name",
                lookup_name="sample-name",
            )
        },
    )

    result = CliRunner().invoke(
        build_cli(gateway),
        ["sample-name", "--registry", "pypi", "--json"],
    )

    assert result.exit_code == 0
    assert json.loads(result.output) == {
        "exit_code": 0,
        "name": "sample-name",
        "results": [
            {
                "input_name": "sample-name",
                "lookup_name": "sample-name",
                "message": "pypi package name is available",
                "registry": "pypi",
                "status": "available",
            }
        ],
    }
    assert gateway.pypi_checked_names == ["sample-name"]
    assert gateway.npm_checked_names == []
