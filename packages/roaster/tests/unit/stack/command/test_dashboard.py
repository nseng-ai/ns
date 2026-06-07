from __future__ import annotations

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRDiscussionComment
from roaster.stack.command.dashboard import (
    RejectedStackFinding,
    StackDashboardBatch,
    StackDashboardCounts,
    StackDashboardPublication,
    StackDashboardPublicationError,
    StackDashboardState,
    preserve_dashboard_activity_log,
    publish_stack_dashboard,
    render_stack_dashboard,
)
from roaster.stack.common.markers import render_stack_dashboard_marker
from roaster.stack.common.run_storage import ROASTER_RUNS_NAMESPACE, StackRunLocator


def _manifest_locator() -> StackRunLocator:
    return StackRunLocator(
        namespace=ROASTER_RUNS_NAMESPACE,
        key="runs/impl/thermonuclear-stack/run-1/manifest.md",
        branch="feature/impl",
    )


def _dashboard_state(
    *,
    batches: tuple[StackDashboardBatch, ...] = (),
    rejected_findings: tuple[RejectedStackFinding, ...] = (),
    activity_entries: tuple[str, ...] = (),
) -> StackDashboardState:
    return StackDashboardState(
        profile_slug="thermonuclear-stack",
        run_slug="run-1",
        implementation_branch="feature/impl",
        implementation_pr_number=123,
        implementation_pr_url="https://github.com/acme/widgets/pull/123",
        manifest_locator=_manifest_locator(),
        reviewer_run_count=3,
        finding_count=7,
        counts=StackDashboardCounts(
            accepted=len(batches),
            rejected=len(rejected_findings),
            superseded=1,
            submitted=1,
            failed=0,
            blocked=0,
        ),
        batches=batches,
        rejected_findings=rejected_findings,
        activity_entries=activity_entries,
    )


def _batch() -> StackDashboardBatch:
    return StackDashboardBatch(
        slug="fix-tests",
        title="Fix tests",
        summary="Repair brittle assertions",
        finding_ids=("F-1", "F-2"),
        confidence="high",
        risk="mechanical",
        generated_branch="impl/roaster/run-1/fix-tests",
        generated_pr_number=456,
        generated_pr_url="https://github.com/acme/widgets/pull/456",
        resolver_status="completed",
        validation_status="passed",
        validation_summary="just test passed",
    )


def _existing_dashboard_comment(body: str) -> PRDiscussionComment:
    return PRDiscussionComment(
        id=99,
        body=body,
        author="github-actions[bot]",
        url="https://github.com/acme/widgets/pull/123#issuecomment-99",
    )


# -- render_stack_dashboard -------------------------------------------------


def test_render_stack_dashboard_includes_run_counts_and_batch_table() -> None:
    body = render_stack_dashboard(
        _dashboard_state(
            batches=(_batch(),),
            rejected_findings=(
                RejectedStackFinding(
                    finding_id="F-3",
                    summary="Out of scope",
                    rationale="belongs to follow-up",
                ),
            ),
            activity_entries=("reviewers completed", "dashboard updated"),
        )
    )

    assert body.startswith(render_stack_dashboard_marker("thermonuclear-stack") + "\n")
    assert "## roaster stack · thermonuclear-stack" in body
    assert "- **Implementation branch:** `feature/impl`" in body
    assert "- **Implementation PR:** [#123](https://github.com/acme/widgets/pull/123)" in body
    assert "- **Run slug:** `run-1`" in body
    assert (
        "- **Manifest:** Branch Memory `roaster-runs` / "
        "`runs/impl/thermonuclear-stack/run-1/manifest.md` on `feature/impl`"
    ) in body
    assert "- **Reviewers run:** 3" in body
    assert "- **Findings:** 7" in body
    assert "accepted 1, rejected 1, superseded 1, submitted 1, failed 0, blocked 0" in body
    assert (
        "| `fix-tests` | Fix tests — Repair brittle assertions | high / mechanical | "
        "`F-1`, `F-2` | `impl/roaster/run-1/fix-tests` | "
        "[#456](https://github.com/acme/widgets/pull/456) | completed | "
        "passed: just test passed |"
    ) in body
    assert "1 rejected finding." in body
    assert "- `F-3` — Out of scope (belongs to follow-up)" in body
    assert "### Activity Log" in body
    assert "- reviewers completed" in body
    assert "- dashboard updated" in body


def test_render_stack_dashboard_zero_accepted_batches_still_has_useful_content() -> None:
    body = render_stack_dashboard(_dashboard_state())

    assert "### Batches" in body
    assert "| — | No accepted batches yet. | — | — | — | — | — | — |" in body
    assert "0 rejected findings." in body
    assert "## roaster stack · thermonuclear-stack" in body


def test_render_stack_dashboard_caps_activity_entries() -> None:
    entries = tuple(f"entry {index}" for index in range(12))

    body = render_stack_dashboard(_dashboard_state(activity_entries=entries))

    lines = body.splitlines()
    assert "- entry 0" not in lines
    assert "- entry 1" not in lines
    assert "- entry 2" in lines
    assert "- entry 11" in lines


def test_preserve_dashboard_activity_log_merges_and_caps_prior_entries() -> None:
    existing = "body\n\n### Activity Log\n\n" + "\n".join(f"- old {index}" for index in range(10))
    new_body = "new body\n"

    merged = preserve_dashboard_activity_log(existing, new_body, "new entry")

    assert merged.startswith("new body\n\n### Activity Log\n")
    assert "- old 0" not in merged
    assert "- old 1" in merged
    assert "- old 9" in merged
    assert "- new entry" in merged


# -- publish_stack_dashboard -----------------------------------------------


def test_publish_stack_dashboard_creates_comment_without_inline_mutations() -> None:
    gateway = FakePRGateway()

    result = publish_stack_dashboard(
        gateway,
        implementation_pr_number=123,
        state=_dashboard_state(batches=(_batch(),)),
    )

    assert isinstance(result, StackDashboardPublication)
    assert result.action == "created"
    assert len(gateway.comments) == 1
    assert gateway.comments[0][0] == 123
    assert render_stack_dashboard_marker("thermonuclear-stack") in gateway.comments[0][1]
    assert gateway.updated_comments == ()
    assert gateway.created_reviews == ()
    assert gateway.thread_replies == ()
    assert gateway.resolved_thread_ids == ()
    assert gateway.unresolved_thread_ids == ()


def test_publish_stack_dashboard_updates_existing_marker_comment_without_inline_mutations() -> None:
    existing_body = render_stack_dashboard(_dashboard_state(activity_entries=("first",)))
    gateway = FakePRGateway(
        discussion_comments={123: (_existing_dashboard_comment(existing_body),)}
    )

    result = publish_stack_dashboard(
        gateway,
        implementation_pr_number=123,
        state=_dashboard_state(batches=(_batch(),)),
        activity_entry="second",
    )

    assert isinstance(result, StackDashboardPublication)
    assert result.action == "updated"
    assert gateway.comments == ()
    assert len(gateway.updated_comments) == 1
    assert gateway.updated_comments[0][0] == 99
    assert "| `fix-tests` |" in gateway.updated_comments[0][1]
    assert "- first" in gateway.updated_comments[0][1]
    assert "- second" in gateway.updated_comments[0][1]
    assert gateway.created_reviews == ()
    assert gateway.thread_replies == ()
    assert gateway.resolved_thread_ids == ()
    assert gateway.unresolved_thread_ids == ()


def test_publish_stack_dashboard_returns_non_ideal_result_for_gateway_failure() -> None:
    gateway = _FailingAddPRGateway()

    result = publish_stack_dashboard(
        gateway,
        implementation_pr_number=123,
        state=_dashboard_state(),
    )

    assert isinstance(result, StackDashboardPublicationError)
    assert result.error_type == "stack_dashboard_publication_failed"
    assert "add failed" in result.message


class _FailingAddPRGateway(FakePRGateway):
    def add_pr_discussion_comment(self, pr_number: int, body: str) -> PRDiscussionComment:
        raise RuntimeError("add failed")
