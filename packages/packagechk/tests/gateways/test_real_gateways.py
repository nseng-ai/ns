from __future__ import annotations

from pathlib import Path

import pytest

from packagechk.gateways.pypi_publish.gateway import PypiPublishError
from packagechk.gateways.pypi_publish.real import PublishCommandResult, RealPypiPublishGateway
from packagechk.gateways.registries.real import RealPackageRegistryGateway, RegistryHttpResponse
from packagechk.models import CheckStatus, Registry


def test_real_gateway_maps_pypi_200_to_taken_with_metadata() -> None:
    urls: list[str] = []

    def fetch_response(url: str, timeout_seconds: float) -> RegistryHttpResponse:
        urls.append(url)
        assert timeout_seconds == 5.0
        return RegistryHttpResponse(
            status_code=200,
            json_body={"info": {"version": "1.2.3", "summary": "Sample PyPI package"}},
        )

    result = RealPackageRegistryGateway(response_fetcher=fetch_response).check_pypi("Foo_Bar")

    assert result.registry is Registry.PYPI
    assert result.status is CheckStatus.TAKEN
    assert result.input_name == "Foo_Bar"
    assert result.lookup_name == "foo-bar"
    assert result.package_url == "https://pypi.org/project/foo-bar/"
    assert result.latest_version == "1.2.3"
    assert result.description == "Sample PyPI package"
    assert urls == ["https://pypi.org/pypi/foo-bar/json"]


def test_real_gateway_maps_pypi_200_with_missing_metadata_to_taken() -> None:
    gateway = RealPackageRegistryGateway(
        response_fetcher=lambda _url, _timeout_seconds: RegistryHttpResponse(
            status_code=200,
            json_body={"info": {"version": 123, "summary": None}},
        )
    )

    result = gateway.check_pypi("sample-name")

    assert result.status is CheckStatus.TAKEN
    assert result.package_url == "https://pypi.org/project/sample-name/"
    assert result.latest_version is None
    assert result.description is None


def test_real_gateway_maps_pypi_404_to_available() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 404)

    result = gateway.check_pypi("available-name")

    assert result.status is CheckStatus.AVAILABLE
    assert result.lookup_name == "available-name"


def test_real_gateway_maps_unexpected_pypi_status_to_error() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 503)

    result = gateway.check_pypi("sample-name")

    assert result.status is CheckStatus.ERROR
    assert "unexpected HTTP status 503" in result.message


def test_real_gateway_maps_fetch_failure_to_error() -> None:
    def fetch_status_code(_url: str, _timeout_seconds: float) -> int:
        raise OSError("network unavailable")

    gateway = RealPackageRegistryGateway(status_code_fetcher=fetch_status_code)

    result = gateway.check_pypi("sample-name")

    assert result.status is CheckStatus.ERROR
    assert "network unavailable" in result.message


def test_real_gateway_rejects_invalid_pypi_name_before_fetching() -> None:
    urls: list[str] = []

    def fetch_status_code(url: str, _timeout_seconds: float) -> int:
        urls.append(url)
        return 200

    result = RealPackageRegistryGateway(status_code_fetcher=fetch_status_code).check_pypi("-bad")

    assert result.status is CheckStatus.INVALID
    assert "must start and end" in result.message
    assert urls == []


def test_real_gateway_maps_npm_200_to_taken_with_metadata() -> None:
    urls: list[str] = []

    def fetch_response(url: str, timeout_seconds: float) -> RegistryHttpResponse:
        urls.append(url)
        assert timeout_seconds == 5.0
        return RegistryHttpResponse(
            status_code=200,
            json_body={
                "dist-tags": {"latest": "4.5.6"},
                "description": "Sample npm package",
            },
        )

    gateway = RealPackageRegistryGateway(response_fetcher=fetch_response)

    result = gateway.check_npm("sample_name")

    assert result.registry is Registry.NPM
    assert result.status is CheckStatus.TAKEN
    assert result.input_name == "sample_name"
    assert result.lookup_name == "sample_name"
    assert result.package_url == "https://www.npmjs.com/package/sample_name"
    assert result.latest_version == "4.5.6"
    assert result.description == "Sample npm package"
    assert urls == ["https://registry.npmjs.org/sample_name"]


def test_real_gateway_maps_npm_200_with_missing_metadata_to_taken() -> None:
    gateway = RealPackageRegistryGateway(
        response_fetcher=lambda _url, _timeout_seconds: RegistryHttpResponse(
            status_code=200,
            json_body={"dist-tags": {"latest": []}, "description": 123},
        )
    )

    result = gateway.check_npm("sample-name")

    assert result.status is CheckStatus.TAKEN
    assert result.package_url == "https://www.npmjs.com/package/sample-name"
    assert result.latest_version is None
    assert result.description is None


def test_real_gateway_maps_npm_404_to_available() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 404)

    result = gateway.check_npm("available-name")

    assert result.status is CheckStatus.AVAILABLE
    assert result.lookup_name == "available-name"


def test_real_gateway_maps_unexpected_npm_status_to_error() -> None:
    gateway = RealPackageRegistryGateway(status_code_fetcher=lambda _url, _timeout_seconds: 503)

    result = gateway.check_npm("sample-name")

    assert result.status is CheckStatus.ERROR
    assert "unexpected HTTP status 503" in result.message


def test_real_gateway_maps_npm_fetch_failure_to_error() -> None:
    def fetch_status_code(_url: str, _timeout_seconds: float) -> int:
        raise OSError("network unavailable")

    gateway = RealPackageRegistryGateway(status_code_fetcher=fetch_status_code)

    result = gateway.check_npm("sample-name")

    assert result.status is CheckStatus.ERROR
    assert "network unavailable" in result.message


def test_real_gateway_rejects_invalid_npm_name_before_fetching() -> None:
    urls: list[str] = []

    def fetch_status_code(url: str, _timeout_seconds: float) -> int:
        urls.append(url)
        return 200

    gateway = RealPackageRegistryGateway(status_code_fetcher=fetch_status_code)

    result = gateway.check_npm("@scope/name")

    assert result.status is CheckStatus.INVALID
    assert "scoped package names are not supported" in result.message
    assert urls == []


def test_real_pypi_publish_gateway_reports_missing_uv() -> None:
    gateway = RealPypiPublishGateway(tool_finder=lambda _tool_name: False)

    error = gateway.ensure_publish_tools_available()

    assert error is not None
    assert "uv" in error


def test_real_pypi_publish_gateway_reports_missing_uvx() -> None:
    gateway = RealPypiPublishGateway(tool_finder=lambda tool_name: tool_name == "uv")

    error = gateway.ensure_publish_tools_available()

    assert error is not None
    assert "uvx" in error


def test_real_pypi_publish_gateway_build_invokes_uv_build(tmp_path: Path) -> None:
    calls: list[tuple[list[str], Path]] = []

    def run_command(command: list[str], cwd: Path) -> PublishCommandResult:
        calls.append((command, cwd))
        dist_dir = cwd / "dist"
        dist_dir.mkdir()
        (dist_dir / "sample-0.0.1.tar.gz").write_text("artifact", encoding="utf-8")
        return PublishCommandResult(return_code=0, stdout="", stderr="")

    artifacts = RealPypiPublishGateway(command_runner=run_command).build_package(tmp_path)

    assert calls == [(["uv", "build"], tmp_path)]
    assert artifacts == [tmp_path / "dist" / "sample-0.0.1.tar.gz"]


def test_real_pypi_publish_gateway_build_failure_raises_publish_error(tmp_path: Path) -> None:
    def run_command(_command: list[str], _cwd: Path) -> PublishCommandResult:
        return PublishCommandResult(return_code=2, stdout="", stderr="build failed")

    gateway = RealPypiPublishGateway(command_runner=run_command)

    with pytest.raises(PypiPublishError, match="uv build failed with exit code 2: build failed"):
        gateway.build_package(tmp_path)


def test_real_pypi_publish_gateway_build_requires_dist_artifacts(tmp_path: Path) -> None:
    def run_command(_command: list[str], cwd: Path) -> PublishCommandResult:
        (cwd / "dist").mkdir()
        return PublishCommandResult(return_code=0, stdout="", stderr="")

    gateway = RealPypiPublishGateway(command_runner=run_command)

    with pytest.raises(PypiPublishError, match="did not produce any artifacts"):
        gateway.build_package(tmp_path)


def test_real_pypi_publish_gateway_publish_invokes_uvx_uv_publish(tmp_path: Path) -> None:
    calls: list[tuple[list[str], Path]] = []
    artifacts = [
        tmp_path / "dist" / "sample-0.0.1.tar.gz",
        tmp_path / "dist" / "sample.whl",
    ]

    def run_command(command: list[str], cwd: Path) -> PublishCommandResult:
        calls.append((command, cwd))
        return PublishCommandResult(return_code=0, stdout="", stderr="")

    error = RealPypiPublishGateway(command_runner=run_command).publish_artifacts(
        tmp_path,
        artifacts,
    )

    assert error is None
    assert calls == [(["uvx", "uv-publish", *(str(artifact) for artifact in artifacts)], tmp_path)]


def test_real_pypi_publish_gateway_publish_failure_returns_error(tmp_path: Path) -> None:
    artifacts = [tmp_path / "dist" / "sample-0.0.1.tar.gz"]

    def run_command(_command: list[str], _cwd: Path) -> PublishCommandResult:
        return PublishCommandResult(return_code=1, stdout="", stderr="publish failed")

    error = RealPypiPublishGateway(command_runner=run_command).publish_artifacts(
        tmp_path,
        artifacts,
    )

    assert error == f"uvx uv-publish {artifacts[0]} failed with exit code 1: publish failed"
