from __future__ import annotations

from packagechk.gateways.registries.real import RealPackageRegistryGateway
from packagechk.models import CheckStatus, Registry


def test_real_gateway_maps_pypi_200_to_taken() -> None:
    urls: list[str] = []

    def fetch_status_code(url: str, timeout_seconds: float) -> int:
        urls.append(url)
        assert timeout_seconds == 5.0
        return 200

    result = RealPackageRegistryGateway(status_code_fetcher=fetch_status_code).check_pypi("Foo_Bar")

    assert result.registry is Registry.PYPI
    assert result.status is CheckStatus.TAKEN
    assert result.input_name == "Foo_Bar"
    assert result.lookup_name == "foo-bar"
    assert urls == ["https://pypi.org/pypi/foo-bar/json"]


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
