from __future__ import annotations

from roaster.stack.common.markers import (
    GeneratedPrBodyRequest,
    GeneratedPrBranchMemoryLocator,
    StackDashboardMarker,
    StackDashboardMarkerParseError,
    StackGeneratedPrMarker,
    StackGeneratedPrMarkerParseError,
    parse_stack_dashboard_marker,
    parse_stack_dashboard_marker_from_body,
    parse_stack_generated_pr_marker,
    parse_stack_generated_pr_marker_from_body,
    render_generated_pr_body,
    render_stack_dashboard_marker,
    render_stack_generated_pr_marker,
)
from roaster.stack.common.run_storage import ROASTER_RUNS_NAMESPACE

# -- stack dashboard markers ------------------------------------------------


def test_render_stack_dashboard_marker_uses_compact_deterministic_json() -> None:
    marker = render_stack_dashboard_marker("thermonuclear-stack")

    assert marker == (
        '<!-- roaster-stack-dashboard {"version":1,"profile_slug":"thermonuclear-stack"} -->'
    )


def test_parse_stack_dashboard_marker_accepts_canonical_marker() -> None:
    parsed = parse_stack_dashboard_marker(
        '<!-- roaster-stack-dashboard {"version":1,"profile_slug":"thermonuclear-stack"} -->'
    )

    assert parsed == StackDashboardMarker(profile_slug="thermonuclear-stack")


def test_parse_stack_dashboard_marker_from_body_requires_first_line_marker() -> None:
    body = f"{render_stack_dashboard_marker('thermonuclear-stack')}\n## body\n"

    parsed = parse_stack_dashboard_marker_from_body(body)

    assert parsed == StackDashboardMarker(profile_slug="thermonuclear-stack")


def test_parse_stack_dashboard_marker_rejects_unknown_marker_shape() -> None:
    parsed = parse_stack_dashboard_marker('<!-- roaster-other {"version":1} -->')

    assert isinstance(parsed, StackDashboardMarkerParseError)
    assert "expected dashboard marker" in parsed.message


def test_parse_stack_dashboard_marker_rejects_malformed_json() -> None:
    parsed = parse_stack_dashboard_marker("<!-- roaster-stack-dashboard {bad} -->")

    assert isinstance(parsed, StackDashboardMarkerParseError)
    assert "JSON is invalid" in parsed.message


def test_parse_stack_dashboard_marker_rejects_unknown_keys() -> None:
    parsed = parse_stack_dashboard_marker(
        '<!-- roaster-stack-dashboard {"version":1,'
        '"profile_slug":"thermonuclear-stack","extra":true} -->'
    )

    assert isinstance(parsed, StackDashboardMarkerParseError)
    assert "unknown key" in parsed.message


def test_parse_stack_dashboard_marker_rejects_unknown_version() -> None:
    parsed = parse_stack_dashboard_marker(
        '<!-- roaster-stack-dashboard {"version":2,"profile_slug":"thermonuclear-stack"} -->'
    )

    assert isinstance(parsed, StackDashboardMarkerParseError)
    assert "`version` must be 1" in parsed.message


# -- pure/deferred generated PR markers and bodies --------------------------


def _generated_pr_locator() -> GeneratedPrBranchMemoryLocator:
    return GeneratedPrBranchMemoryLocator(
        namespace=ROASTER_RUNS_NAMESPACE,
        branch="feature/impl",
        key="runs/impl/thermonuclear-stack/run-1/batches/fix-tests/resolver.md",
    )


def test_render_stack_generated_pr_marker_uses_compact_deterministic_json() -> None:
    marker = render_stack_generated_pr_marker(
        implementation_branch="feature/impl",
        implementation_pr="123",
        profile_slug="thermonuclear-stack",
        run_slug="run-1",
        batch_slug="fix-tests",
        finding_ids=("F-1", "F-2"),
        branch_memory=_generated_pr_locator(),
    )

    assert marker == (
        '<!-- roaster-stack-generated-pr {"version":1,"implementation_branch":"feature/impl",'
        '"implementation_pr":"123","profile_slug":"thermonuclear-stack","run_slug":"run-1",'
        '"batch_slug":"fix-tests","finding_ids":["F-1","F-2"],'
        '"branch_memory_namespace":"roaster-runs","branch_memory_branch":"feature/impl",'
        '"branch_memory_key":"runs/impl/thermonuclear-stack/run-1/batches/fix-tests/'
        'resolver.md"} -->'
    )


def test_parse_stack_generated_pr_marker_accepts_canonical_marker() -> None:
    marker = render_stack_generated_pr_marker(
        implementation_branch="feature/impl",
        implementation_pr="123",
        profile_slug="thermonuclear-stack",
        run_slug="run-1",
        batch_slug="fix-tests",
        finding_ids=("F-1", "F-2"),
        branch_memory=_generated_pr_locator(),
    )

    parsed = parse_stack_generated_pr_marker(marker)

    assert parsed == StackGeneratedPrMarker(
        implementation_branch="feature/impl",
        implementation_pr="123",
        profile_slug="thermonuclear-stack",
        run_slug="run-1",
        batch_slug="fix-tests",
        finding_ids=("F-1", "F-2"),
        branch_memory_namespace=ROASTER_RUNS_NAMESPACE,
        branch_memory_branch="feature/impl",
        branch_memory_key="runs/impl/thermonuclear-stack/run-1/batches/fix-tests/resolver.md",
    )


def test_parse_stack_generated_pr_marker_from_body_requires_first_line_marker() -> None:
    body = render_generated_pr_body(
        GeneratedPrBodyRequest(
            implementation_branch="feature/impl",
            implementation_pr="123",
            profile_slug="thermonuclear-stack",
            run_slug="run-1",
            batch_slug="fix-tests",
            batch_title="Fix tests",
            batch_summary="Repair brittle tests.",
            finding_ids=("F-1",),
            validation_summary="just test passed",
            branch_memory=_generated_pr_locator(),
            dashboard_pointer="https://github.com/acme/widgets/pull/123#issuecomment-99",
        )
    )

    parsed = parse_stack_generated_pr_marker_from_body(body)

    assert isinstance(parsed, StackGeneratedPrMarker)
    assert parsed.batch_slug == "fix-tests"


def test_parse_stack_generated_pr_marker_rejects_malformed_payload() -> None:
    parsed = parse_stack_generated_pr_marker("<!-- roaster-stack-generated-pr {bad} -->")

    assert isinstance(parsed, StackGeneratedPrMarkerParseError)
    assert "JSON is invalid" in parsed.message


def test_render_generated_pr_body_includes_source_batch_validation_and_dashboard() -> None:
    body = render_generated_pr_body(
        GeneratedPrBodyRequest(
            implementation_branch="feature/impl",
            implementation_pr="https://github.com/acme/widgets/pull/123",
            profile_slug="thermonuclear-stack",
            run_slug="run-1",
            batch_slug="fix-tests",
            batch_title="Fix tests",
            batch_summary="Repair brittle tests.",
            finding_ids=("F-1", "F-2"),
            validation_summary="just test passed",
            branch_memory=_generated_pr_locator(),
            dashboard_pointer="https://github.com/acme/widgets/pull/123#issuecomment-99",
        )
    )

    assert body.startswith("<!-- roaster-stack-generated-pr ")
    assert "## roaster stack resolution · fix-tests" in body
    assert "- **Branch:** `feature/impl`" in body
    assert "- **PR:** https://github.com/acme/widgets/pull/123" in body
    assert "- **Profile:** `thermonuclear-stack`" in body
    assert "- **Run:** `run-1`" in body
    assert "- **Title:** Fix tests" in body
    assert "- **Findings:** `F-1`, `F-2`" in body
    assert "just test passed" in body
    assert "- **Branch Memory:** `roaster-runs` / " in body
    assert "- **Dashboard:** https://github.com/acme/widgets/pull/123#issuecomment-99" in body
