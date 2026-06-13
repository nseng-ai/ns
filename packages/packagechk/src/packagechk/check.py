from __future__ import annotations

from packagechk.gateways.registries.gateway import PackageRegistryGateway
from packagechk.models import PackageCheckReport, Registry, RegistryCheckResult

DEFAULT_REGISTRIES: tuple[Registry, ...] = (Registry.PYPI, Registry.NPM)


def registry_selection(registry_options: tuple[str, ...]) -> tuple[Registry, ...]:
    if not registry_options:
        return DEFAULT_REGISTRIES
    return tuple(Registry(option) for option in registry_options)


def check_package_name(
    *,
    package_name: str,
    registries: tuple[Registry, ...],
    registry_gateway: PackageRegistryGateway,
) -> PackageCheckReport:
    results: list[RegistryCheckResult] = []
    for registry in registries:
        if registry is Registry.PYPI:
            results.append(registry_gateway.check_pypi(package_name))
        elif registry is Registry.NPM:
            results.append(registry_gateway.check_npm(package_name))
        elif registry is Registry.BREW:
            results.append(registry_gateway.check_brew(package_name))
        else:
            results.append(
                RegistryCheckResult.unsupported(
                    registry,
                    input_name=package_name,
                    message=f"{registry.value} availability checks are not supported",
                )
            )
    return PackageCheckReport(input_name=package_name, results=tuple(results))
