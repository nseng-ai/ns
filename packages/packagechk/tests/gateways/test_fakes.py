from __future__ import annotations

from pathlib import Path

import pytest

from packagechk.gateways.npm_publish.fake import FakeNpmPublishGateway
from packagechk.gateways.pypi_publish.fake import FakePypiPublishGateway
from packagechk.gateways.pypi_publish.gateway import PypiPublishError
from packagechk.gateways.registries.fake import FakePackageRegistryGateway
from packagechk.models import CheckStatus, Registry, RegistryCheckResult


def test_fake_registry_gateway_returns_configured_results_and_tracks_names() -> None:
    pypi_result = RegistryCheckResult.available(
        Registry.PYPI,
        input_name="sample-name",
        lookup_name="sample-name",
    )
    npm_result = RegistryCheckResult.taken(
        Registry.NPM,
        input_name="sample-name",
        lookup_name="sample-name",
    )
    brew_result = RegistryCheckResult.available(
        Registry.BREW,
        input_name="sample-name",
        lookup_name="sample-name",
    )
    gateway = FakePackageRegistryGateway(
        pypi_results={"sample-name": pypi_result},
        npm_results={"sample-name": npm_result},
        brew_results={"sample-name": brew_result},
    )

    assert gateway.check_pypi("sample-name") == pypi_result
    assert gateway.check_npm("sample-name") == npm_result
    assert gateway.check_brew("sample-name") == brew_result
    assert gateway.pypi_checked_names == ["sample-name"]
    assert gateway.npm_checked_names == ["sample-name"]
    assert gateway.brew_checked_names == ["sample-name"]


def test_fake_registry_gateway_returns_error_for_unconfigured_names() -> None:
    gateway = FakePackageRegistryGateway()

    result = gateway.check_brew("unknown-name")

    assert result.registry is Registry.BREW
    assert result.status is CheckStatus.ERROR
    assert result.input_name == "unknown-name"
    assert "no fake Homebrew result configured" in result.message


def test_fake_pypi_publish_gateway_records_operations_and_returns_artifacts() -> None:
    artifacts = [Path("dist/sample-0.0.1.tar.gz"), Path("dist/sample-0.0.1-py3-none-any.whl")]
    gateway = FakePypiPublishGateway(artifacts=artifacts)
    project_dir = Path("project")

    assert gateway.ensure_publish_tools_available() is None
    assert gateway.build_package(project_dir) == artifacts
    assert gateway.publish_artifacts(project_dir, artifacts) is None

    assert gateway.tool_checks == 1
    assert gateway.built_project_dirs == [project_dir]
    assert gateway.published_artifacts == [artifacts]


def test_fake_pypi_publish_gateway_returns_configured_tool_error() -> None:
    gateway = FakePypiPublishGateway(tools_error="uv is missing")

    assert gateway.ensure_publish_tools_available() == "uv is missing"
    assert gateway.tool_checks == 1


def test_fake_pypi_publish_gateway_raises_configured_build_error() -> None:
    gateway = FakePypiPublishGateway(build_error="build failed")
    project_dir = Path("project")

    with pytest.raises(PypiPublishError, match="build failed"):
        gateway.build_package(project_dir)

    assert gateway.built_project_dirs == [project_dir]


def test_fake_pypi_publish_gateway_returns_configured_publish_error() -> None:
    artifacts = [Path("dist/sample-0.0.1.tar.gz")]
    gateway = FakePypiPublishGateway(publish_error="publish failed")

    assert gateway.publish_artifacts(Path("project"), artifacts) == "publish failed"
    assert gateway.published_artifacts == [artifacts]


def test_fake_npm_publish_gateway_records_operations() -> None:
    gateway = FakeNpmPublishGateway()
    project_dir = Path("project")

    assert gateway.ensure_publish_tools_available() is None
    assert gateway.publish_project(project_dir) is None

    assert gateway.tool_checks == 1
    assert gateway.published_project_dirs == [project_dir]


def test_fake_npm_publish_gateway_returns_configured_tool_error() -> None:
    gateway = FakeNpmPublishGateway(tools_error="npm is missing")

    assert gateway.ensure_publish_tools_available() == "npm is missing"
    assert gateway.tool_checks == 1


def test_fake_npm_publish_gateway_returns_configured_publish_error() -> None:
    gateway = FakeNpmPublishGateway(publish_error="npm publish failed")
    project_dir = Path("project")

    assert gateway.publish_project(project_dir) == "npm publish failed"
    assert gateway.published_project_dirs == [project_dir]
