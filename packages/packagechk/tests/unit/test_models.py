from __future__ import annotations

from packagechk.models import CheckStatus, PackageCheckReport, Registry, RegistryCheckResult


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
