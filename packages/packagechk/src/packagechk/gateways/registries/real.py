from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import cast

from packagechk.brew import brew_formula_validation_error
from packagechk.gateways.registries.gateway import PackageRegistryGateway
from packagechk.models import Registry, RegistryCheckResult
from packagechk.npm import npm_validation_error
from packagechk.pypi import normalize_pypi_name, pypi_validation_error

StatusCodeFetcher = Callable[[str, float], int]
RegistryResponseFetcher = Callable[[str, float], "RegistryHttpResponse"]
JsonObject = Mapping[str, object]


@dataclass(frozen=True)
class RegistryHttpResponse:
    status_code: int
    json_body: JsonObject | None = None


@dataclass(frozen=True)
class RegistryMetadata:
    package_url: str
    latest_version: str | None = None
    description: str | None = None


class RealPackageRegistryGateway(PackageRegistryGateway):
    """Real registry gateway."""

    def __init__(
        self,
        *,
        response_fetcher: RegistryResponseFetcher | None = None,
        status_code_fetcher: StatusCodeFetcher | None = None,
        timeout_seconds: float = 5.0,
    ) -> None:
        if response_fetcher is not None and status_code_fetcher is not None:
            raise ValueError("pass either response_fetcher or status_code_fetcher, not both")
        if response_fetcher is not None:
            self._response_fetcher = response_fetcher
        elif status_code_fetcher is not None:
            self._response_fetcher = _response_fetcher_from_status_code_fetcher(status_code_fetcher)
        else:
            self._response_fetcher = _urllib_response
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
            response = self._response_fetcher(url, self._timeout_seconds)
        except (OSError, TimeoutError, urllib.error.URLError) as error:
            return RegistryCheckResult.error(
                Registry.PYPI,
                input_name=package_name,
                lookup_name=lookup_name,
                message=f"PyPI lookup failed: {error}",
            )

        if response.status_code == 200:
            metadata = _pypi_metadata(lookup_name, response.json_body)
            return RegistryCheckResult.taken(
                Registry.PYPI,
                input_name=package_name,
                lookup_name=lookup_name,
                package_url=metadata.package_url,
                latest_version=metadata.latest_version,
                description=metadata.description,
            )
        if response.status_code == 404:
            return RegistryCheckResult.available(
                Registry.PYPI,
                input_name=package_name,
                lookup_name=lookup_name,
            )
        return RegistryCheckResult.error(
            Registry.PYPI,
            input_name=package_name,
            lookup_name=lookup_name,
            message=f"PyPI returned unexpected HTTP status {response.status_code}",
        )

    def check_npm(self, package_name: str) -> RegistryCheckResult:
        validation_error = npm_validation_error(package_name)
        if validation_error is not None:
            return RegistryCheckResult.invalid(
                Registry.NPM,
                input_name=package_name,
                lookup_name=package_name,
                message=validation_error,
            )

        url = _npm_package_url(package_name)
        try:
            response = self._response_fetcher(url, self._timeout_seconds)
        except (OSError, TimeoutError, urllib.error.URLError) as error:
            return RegistryCheckResult.error(
                Registry.NPM,
                input_name=package_name,
                lookup_name=package_name,
                message=f"npm lookup failed: {error}",
            )

        if response.status_code == 200:
            metadata = _npm_metadata(package_name, response.json_body)
            return RegistryCheckResult.taken(
                Registry.NPM,
                input_name=package_name,
                lookup_name=package_name,
                package_url=metadata.package_url,
                latest_version=metadata.latest_version,
                description=metadata.description,
            )
        if response.status_code == 404:
            return RegistryCheckResult.available(
                Registry.NPM,
                input_name=package_name,
                lookup_name=package_name,
            )
        return RegistryCheckResult.error(
            Registry.NPM,
            input_name=package_name,
            lookup_name=package_name,
            message=f"npm returned unexpected HTTP status {response.status_code}",
        )

    def check_brew(self, package_name: str) -> RegistryCheckResult:
        validation_error = brew_formula_validation_error(package_name)
        if validation_error is not None:
            return RegistryCheckResult.invalid(
                Registry.BREW,
                input_name=package_name,
                lookup_name=package_name,
                message=validation_error,
            )

        url = _brew_formula_json_url(package_name)
        try:
            response = self._response_fetcher(url, self._timeout_seconds)
        except (OSError, TimeoutError, urllib.error.URLError) as error:
            return RegistryCheckResult.error(
                Registry.BREW,
                input_name=package_name,
                lookup_name=package_name,
                message=f"Homebrew formula lookup failed: {error}",
            )

        if response.status_code == 200:
            metadata = _brew_formula_metadata(package_name, response.json_body)
            return RegistryCheckResult.taken(
                Registry.BREW,
                input_name=package_name,
                lookup_name=package_name,
                package_url=metadata.package_url,
                latest_version=metadata.latest_version,
                description=metadata.description,
            )
        if response.status_code == 404:
            return RegistryCheckResult.available(
                Registry.BREW,
                input_name=package_name,
                lookup_name=package_name,
            )
        return RegistryCheckResult.error(
            Registry.BREW,
            input_name=package_name,
            lookup_name=package_name,
            message=f"Homebrew formula API returned unexpected HTTP status {response.status_code}",
        )


def _response_fetcher_from_status_code_fetcher(
    status_code_fetcher: StatusCodeFetcher,
) -> RegistryResponseFetcher:
    def fetch_response(url: str, timeout_seconds: float) -> RegistryHttpResponse:
        return RegistryHttpResponse(status_code=status_code_fetcher(url, timeout_seconds))

    return fetch_response


def _pypi_metadata(lookup_name: str, json_body: JsonObject | None) -> RegistryMetadata:
    latest_version = None
    description = None
    if json_body is not None:
        info = _mapping_field(json_body, "info")
        if info is not None:
            latest_version = _string_field(info, "version")
            description = _string_field(info, "summary")
    return RegistryMetadata(
        package_url=_pypi_project_url(lookup_name),
        latest_version=latest_version,
        description=description,
    )


def _npm_metadata(package_name: str, json_body: JsonObject | None) -> RegistryMetadata:
    latest_version = None
    description = None
    if json_body is not None:
        dist_tags = _mapping_field(json_body, "dist-tags")
        if dist_tags is not None:
            latest_version = _string_field(dist_tags, "latest")
        description = _string_field(json_body, "description")
    return RegistryMetadata(
        package_url=_npm_package_page_url(package_name),
        latest_version=latest_version,
        description=description,
    )


def _brew_formula_metadata(formula_name: str, json_body: JsonObject | None) -> RegistryMetadata:
    latest_version = None
    description = None
    if json_body is not None:
        versions = _mapping_field(json_body, "versions")
        if versions is not None:
            latest_version = _string_field(versions, "stable")
        description = _string_field(json_body, "desc")
    return RegistryMetadata(
        package_url=_brew_formula_page_url(formula_name),
        latest_version=latest_version,
        description=description,
    )


def _mapping_field(fields: JsonObject, key: str) -> JsonObject | None:
    value = fields.get(key)
    if isinstance(value, Mapping):
        return cast(JsonObject, value)
    return None


def _string_field(fields: JsonObject, key: str) -> str | None:
    value = fields.get(key)
    if isinstance(value, str) and value != "":
        return value
    return None


def _pypi_project_json_url(normalized_name: str) -> str:
    quoted_name = urllib.parse.quote(normalized_name, safe="")
    return f"https://pypi.org/pypi/{quoted_name}/json"


def _pypi_project_url(normalized_name: str) -> str:
    quoted_name = urllib.parse.quote(normalized_name, safe="")
    return f"https://pypi.org/project/{quoted_name}/"


def _npm_package_url(package_name: str) -> str:
    quoted_name = urllib.parse.quote(package_name, safe="@")
    return f"https://registry.npmjs.org/{quoted_name}"


def _npm_package_page_url(package_name: str) -> str:
    quoted_name = urllib.parse.quote(package_name, safe="@/")
    return f"https://www.npmjs.com/package/{quoted_name}"


def _brew_formula_json_url(formula_name: str) -> str:
    quoted_name = urllib.parse.quote(formula_name, safe="")
    return f"https://formulae.brew.sh/api/formula/{quoted_name}.json"


def _brew_formula_page_url(formula_name: str) -> str:
    quoted_name = urllib.parse.quote(formula_name, safe="")
    return f"https://formulae.brew.sh/formula/{quoted_name}"


def _urllib_response(url: str, timeout_seconds: float) -> RegistryHttpResponse:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "packagechk/0.1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return RegistryHttpResponse(
                status_code=response.status,
                json_body=_read_json_object(response.read()),
            )
    except urllib.error.HTTPError as error:
        return RegistryHttpResponse(status_code=error.code)


def _read_json_object(raw_body: bytes) -> JsonObject | None:
    if len(raw_body) == 0:
        return None
    try:
        payload: object = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if isinstance(payload, dict):
        return cast(dict[str, object], payload)
    return None
