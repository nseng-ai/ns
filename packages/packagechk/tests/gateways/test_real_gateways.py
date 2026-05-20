from __future__ import annotations

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
