from __future__ import annotations

from packagechk.gateways.registries.gateway import PackageRegistryGateway
from packagechk.models import Registry, RegistryCheckResult


class FakePackageRegistryGateway(PackageRegistryGateway):
    """In-memory registry gateway for scenario tests."""

    def __init__(
        self,
        *,
        pypi_results: dict[str, RegistryCheckResult] | None = None,
        npm_results: dict[str, RegistryCheckResult] | None = None,
        brew_results: dict[str, RegistryCheckResult] | None = None,
    ) -> None:
        self._pypi_results = pypi_results or {}
        self._npm_results = npm_results or {}
        self._brew_results = brew_results or {}
        self._pypi_checked_names: list[str] = []
        self._npm_checked_names: list[str] = []
        self._brew_checked_names: list[str] = []

    @property
    def pypi_checked_names(self) -> list[str]:
        return self._pypi_checked_names.copy()

    @property
    def npm_checked_names(self) -> list[str]:
        return self._npm_checked_names.copy()

    @property
    def brew_checked_names(self) -> list[str]:
        return self._brew_checked_names.copy()

    def check_pypi(self, package_name: str) -> RegistryCheckResult:
        self._pypi_checked_names.append(package_name)
        if package_name in self._pypi_results:
            return self._pypi_results[package_name]
        return RegistryCheckResult.error(
            Registry.PYPI,
            input_name=package_name,
            lookup_name=package_name,
            message=f"no fake PyPI result configured for {package_name!r}",
        )

    def check_npm(self, package_name: str) -> RegistryCheckResult:
        self._npm_checked_names.append(package_name)
        if package_name in self._npm_results:
            return self._npm_results[package_name]
        return RegistryCheckResult.error(
            Registry.NPM,
            input_name=package_name,
            lookup_name=package_name,
            message=f"no fake npm result configured for {package_name!r}",
        )

    def check_brew(self, package_name: str) -> RegistryCheckResult:
        self._brew_checked_names.append(package_name)
        if package_name in self._brew_results:
            return self._brew_results[package_name]
        return RegistryCheckResult.error(
            Registry.BREW,
            input_name=package_name,
            lookup_name=package_name,
            message=f"no fake Homebrew result configured for {package_name!r}",
        )
