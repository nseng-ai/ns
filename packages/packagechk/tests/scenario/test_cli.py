from __future__ import annotations

import json

from click.testing import CliRunner

from packagechk.cli import build_cli
from packagechk.gateways.registries.fake import FakePackageRegistryGateway
from packagechk.gateways.registries.real import RealPackageRegistryGateway, RegistryHttpResponse
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
        "schema_version": 1,
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


def test_packagechk_json_output_includes_taken_metadata() -> None:
    gateway = FakePackageRegistryGateway(
        pypi_results={
            "sample-name": RegistryCheckResult.taken(
                Registry.PYPI,
                input_name="sample-name",
                lookup_name="sample-name",
                package_url="https://pypi.org/project/sample-name/",
                latest_version="1.2.3",
                description="Sample PyPI package",
            )
        },
    )

    result = CliRunner().invoke(
        build_cli(gateway),
        ["sample-name", "--registry", "pypi", "--json"],
    )

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "name": "sample-name",
        "schema_version": 1,
        "results": [
            {
                "description": "Sample PyPI package",
                "input_name": "sample-name",
                "latest_version": "1.2.3",
                "lookup_name": "sample-name",
                "message": "pypi package name is already taken",
                "package_url": "https://pypi.org/project/sample-name/",
                "registry": "pypi",
                "status": "taken",
            }
        ],
    }


def test_packagechk_pypi_registry_reports_available_with_normalized_name() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 404)

    result = CliRunner().invoke(build_cli(gateway), ["Foo_Bar", "--registry", "pypi"])

    assert result.exit_code == 0
    assert result.output == "pypi: available as 'foo-bar'\n"


def test_packagechk_pypi_registry_reports_taken() -> None:
    gateway = RealPackageRegistryGateway(
        response_fetcher=lambda _url, _timeout_seconds: RegistryHttpResponse(
            status_code=200,
            json_body={"info": {"version": "1.2.3", "summary": "Sample PyPI package"}},
        )
    )

    result = CliRunner().invoke(build_cli(gateway), ["sample-name", "--registry", "pypi"])

    assert result.exit_code == 1
    assert result.output == (
        "pypi: taken — latest 1.2.3 — Sample PyPI package — https://pypi.org/project/sample-name/\n"
    )


def test_packagechk_pypi_registry_rejects_invalid_name() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 200)

    result = CliRunner().invoke(build_cli(gateway), ["bad!name", "--registry", "pypi"])

    assert result.exit_code == 2
    assert "pypi: invalid" in result.output
    assert "must start and end" in result.output


def test_packagechk_npm_registry_reports_available_without_rewriting_name() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 404)

    result = CliRunner().invoke(build_cli(gateway), ["sample_name", "--registry", "npm"])

    assert result.exit_code == 0
    assert result.output == "npm: available\n"


def test_packagechk_npm_registry_reports_taken() -> None:
    gateway = RealPackageRegistryGateway(
        response_fetcher=lambda _url, _timeout_seconds: RegistryHttpResponse(
            status_code=200,
            json_body={
                "dist-tags": {"latest": "4.5.6"},
                "description": "Sample npm package",
            },
        )
    )

    result = CliRunner().invoke(build_cli(gateway), ["sample-name", "--registry", "npm"])

    assert result.exit_code == 1
    assert result.output == (
        "npm: taken — latest 4.5.6 — Sample npm package — "
        "https://www.npmjs.com/package/sample-name\n"
    )


def test_packagechk_npm_registry_rejects_scoped_names() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 200)

    result = CliRunner().invoke(build_cli(gateway), ["@scope/name", "--registry", "npm"])

    assert result.exit_code == 2
    assert "npm: invalid" in result.output
    assert "scoped package names are not supported in v1" in result.output


def test_packagechk_npm_registry_rejects_uppercase_names_without_rewriting() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 200)

    result = CliRunner().invoke(build_cli(gateway), ["SampleName", "--registry", "npm"])

    assert result.exit_code == 2
    assert "npm: invalid" in result.output
    assert "must be lowercase" in result.output


def test_packagechk_default_registries_exit_zero_when_both_available() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 404)

    result = CliRunner().invoke(build_cli(gateway), ["sample-name"])

    assert result.exit_code == 0
    assert result.output.splitlines() == ["pypi: available", "npm: available"]


def test_packagechk_default_registries_exit_one_when_any_registry_is_taken() -> None:
    def fetch_status_code(url: str, _timeout_seconds: float) -> int:
        if "pypi.org" in url:
            return 404
        return 200

    gateway = RealPackageRegistryGateway(status_code_fetcher=fetch_status_code)

    result = CliRunner().invoke(build_cli(gateway), ["sample-name"])

    assert result.exit_code == 1
    assert result.output.splitlines() == [
        "pypi: available",
        "npm: taken — https://www.npmjs.com/package/sample-name",
    ]


def test_packagechk_default_registries_exit_two_when_any_registry_errors() -> None:
    def fetch_status_code(url: str, _timeout_seconds: float) -> int:
        if "pypi.org" in url:
            return 404
        raise OSError("registry unavailable")

    gateway = RealPackageRegistryGateway(status_code_fetcher=fetch_status_code)

    result = CliRunner().invoke(build_cli(gateway), ["sample-name"])

    assert result.exit_code == 2
    assert "pypi: available" in result.output
    assert "npm: error" in result.output
    assert "registry unavailable" in result.output


def test_packagechk_default_json_output_includes_both_registries_and_schema_version() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 404)

    result = CliRunner().invoke(build_cli(gateway), ["sample-name", "--json"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["schema_version"] == 1
    assert payload["name"] == "sample-name"
    assert payload["exit_code"] == 0
    assert [item["registry"] for item in payload["results"]] == ["pypi", "npm"]
    assert [item["status"] for item in payload["results"]] == ["available", "available"]
