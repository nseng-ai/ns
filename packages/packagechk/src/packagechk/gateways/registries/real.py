from __future__ import annotations

from packagechk.gateways.registries.gateway import PackageRegistryGateway
from packagechk.models import Registry, RegistryCheckResult


class RealPackageRegistryGateway(PackageRegistryGateway):
    """Real registry gateway.

    Individual registry lookups are implemented in later stack slices. Until
    then, the real gateway fails closed instead of guessing availability.
    """

    def check_pypi(self, package_name: str) -> RegistryCheckResult:
        return RegistryCheckResult.error(
            Registry.PYPI,
            input_name=package_name,
            lookup_name=package_name,
            message="PyPI lookup is not implemented yet",
        )

    def check_npm(self, package_name: str) -> RegistryCheckResult:
        return RegistryCheckResult.error(
            Registry.NPM,
            input_name=package_name,
            lookup_name=package_name,
            message="npm lookup is not implemented yet",
        )
