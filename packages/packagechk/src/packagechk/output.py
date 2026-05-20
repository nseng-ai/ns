from __future__ import annotations

import json

from packagechk.models import CheckStatus, PackageCheckReport, RegistryCheckResult


def render_json(report: PackageCheckReport) -> str:
    return json.dumps(report.to_json_dict(), sort_keys=True)


def render_human(report: PackageCheckReport) -> str:
    return "\n".join(_render_result(result) for result in report.results)


def _render_result(result: RegistryCheckResult) -> str:
    lookup_suffix = ""
    if result.lookup_name != result.input_name:
        lookup_suffix = f" as {result.lookup_name!r}"

    if result.status is CheckStatus.AVAILABLE:
        return f"{result.registry.value}: available{lookup_suffix}"
    if result.status is CheckStatus.TAKEN:
        details = [f"{result.registry.value}: taken{lookup_suffix}"]
        if result.latest_version is not None:
            details.append(f"latest {result.latest_version}")
        if result.description is not None:
            details.append(result.description)
        if result.package_url is not None:
            details.append(result.package_url)
        return " — ".join(details)
    return f"{result.registry.value}: {result.status.value}: {result.message}"
