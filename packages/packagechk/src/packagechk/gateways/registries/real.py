from __future__ import annotations

import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable

from packagechk.gateways.registries.gateway import PackageRegistryGateway
from packagechk.models import Registry, RegistryCheckResult
from packagechk.pypi import normalize_pypi_name, pypi_validation_error

StatusCodeFetcher = Callable[[str, float], int]


class RealPackageRegistryGateway(PackageRegistryGateway):
    """Real registry gateway."""

    def __init__(
        self,
        *,
        status_code_fetcher: StatusCodeFetcher | None = None,
        timeout_seconds: float = 5.0,
    ) -> None:
        self._status_code_fetcher = status_code_fetcher or _urllib_status_code
        self._timeout_seconds = timeout_seconds

    def check_pypi(self, package_name: str) -> RegistryCheckResult:
        lookup_name = normalize_pypi_name(package_name)
        validation_error = pypi_validation_error(package_name)
        if validation_error is not None:
            return RegistryCheckResult.invalid(
                Registry.PYPI,
                input_name=package_name,
                lookup_name=lookup_name,
                message=validation_error,
            )

        url = _pypi_project_json_url(lookup_name)
        try:
            status_code = self._status_code_fetcher(url, self._timeout_seconds)
        except (OSError, TimeoutError, urllib.error.URLError) as error:
            return RegistryCheckResult.error(
                Registry.PYPI,
                input_name=package_name,
                lookup_name=lookup_name,
                message=f"PyPI lookup failed: {error}",
            )

        if status_code == 200:
            return RegistryCheckResult.taken(
                Registry.PYPI,
                input_name=package_name,
                lookup_name=lookup_name,
            )
        if status_code == 404:
            return RegistryCheckResult.available(
                Registry.PYPI,
                input_name=package_name,
                lookup_name=lookup_name,
            )
        return RegistryCheckResult.error(
            Registry.PYPI,
            input_name=package_name,
            lookup_name=lookup_name,
            message=f"PyPI returned unexpected HTTP status {status_code}",
        )

    def check_npm(self, package_name: str) -> RegistryCheckResult:
        return RegistryCheckResult.error(
            Registry.NPM,
            input_name=package_name,
            lookup_name=package_name,
            message="npm lookup is not implemented yet",
        )


def _pypi_project_json_url(normalized_name: str) -> str:
    quoted_name = urllib.parse.quote(normalized_name, safe="")
    return f"https://pypi.org/pypi/{quoted_name}/json"


def _urllib_status_code(url: str, timeout_seconds: float) -> int:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "packagechk/0.1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
