from __future__ import annotations

from abc import ABC, abstractmethod

from packagechk.models import RegistryCheckResult


class PackageRegistryGateway(ABC):
    """Name-availability lookups for supported package registries."""

    @abstractmethod
    def check_pypi(self, package_name: str) -> RegistryCheckResult:
        """Check PyPI package-name availability."""

    @abstractmethod
    def check_npm(self, package_name: str) -> RegistryCheckResult:
        """Check npm package-name availability."""

    @abstractmethod
    def check_brew(self, package_name: str) -> RegistryCheckResult:
        """Check Homebrew formula-name availability."""
