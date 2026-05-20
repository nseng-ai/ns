from __future__ import annotations

from packagechk.models import CheckStatus, PackageCheckReport, Registry, RegistryCheckResult


def test_registry_check_result_json_includes_metadata_when_present() -> None:
    result = RegistryCheckResult.taken(
        Registry.PYPI,
        input_name="Foo_Bar",
        lookup_name="foo-bar",
        package_url="https://pypi.org/project/foo-bar/",
        latest_version="1.2.3",
        description="Sample PyPI package",
    )

    assert result.to_json_dict() == {
        "description": "Sample PyPI package",
        "input_name": "Foo_Bar",
        "latest_version": "1.2.3",
        "lookup_name": "foo-bar",
        "message": "pypi package name is already taken",
        "package_url": "https://pypi.org/project/foo-bar/",
        "registry": "pypi",
        "status": "taken",
    }


def test_report_exit_code_is_zero_when_all_results_available() -> None:
    report = PackageCheckReport(
        input_name="sample-name",
        results=(
            RegistryCheckResult.available(
                Registry.PYPI, input_name="sample-name", lookup_name="sample-name"
            ),
            RegistryCheckResult.available(
                Registry.NPM, input_name="sample-name", lookup_name="sample-name"
            ),
        ),
    )

    assert report.exit_code == 0


def test_report_exit_code_is_one_when_any_result_is_taken() -> None:
    report = PackageCheckReport(
        input_name="sample-name",
        results=(
            RegistryCheckResult.available(
                Registry.PYPI, input_name="sample-name", lookup_name="sample-name"
            ),
            RegistryCheckResult.taken(
                Registry.NPM, input_name="sample-name", lookup_name="sample-name"
            ),
        ),
    )

    assert report.exit_code == 1


def test_report_exit_code_is_two_for_invalid_unsupported_or_error() -> None:
    for status in (CheckStatus.INVALID, CheckStatus.UNSUPPORTED, CheckStatus.ERROR):
        report = PackageCheckReport(
            input_name="sample-name",
            results=(
                RegistryCheckResult(
                    registry=Registry.PYPI,
                    input_name="sample-name",
                    lookup_name="sample-name",
                    status=status,
                    message="not checkable",
                ),
            ),
        )

        assert report.exit_code == 2
