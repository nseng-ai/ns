from __future__ import annotations

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
    gateway = FakePackageRegistryGateway(
        pypi_results={"sample-name": pypi_result},
        npm_results={"sample-name": npm_result},
    )

    assert gateway.check_pypi("sample-name") == pypi_result
    assert gateway.check_npm("sample-name") == npm_result
    assert gateway.pypi_checked_names == ["sample-name"]
    assert gateway.npm_checked_names == ["sample-name"]


def test_fake_registry_gateway_returns_error_for_unconfigured_names() -> None:
    gateway = FakePackageRegistryGateway()

    result = gateway.check_pypi("unknown-name")

    assert result.registry is Registry.PYPI
    assert result.status is CheckStatus.ERROR
    assert result.input_name == "unknown-name"
    assert "no fake PyPI result configured" in result.message
