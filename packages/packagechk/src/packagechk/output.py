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
        return f"{result.registry.value}: taken{lookup_suffix}"
    return f"{result.registry.value}: {result.status.value}: {result.message}"
