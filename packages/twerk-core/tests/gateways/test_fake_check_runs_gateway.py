"""Tests for FakeCheckRunsGateway."""

from __future__ import annotations

from twerk_core.gh.testing import FakeCheckRunsGateway
from twerk_core.gh.types import CheckRun, CheckRunAnnotation, CheckRunOutput


def _annotation(
    *,
    path: str = "src/foo.py",
    start_line: int = 10,
    end_line: int | None = None,
    message: str = "looks off",
    level: str = "warning",
) -> CheckRunAnnotation:
    return CheckRunAnnotation(
        path=path,
        start_line=start_line,
        end_line=end_line if end_line is not None else start_line,
        annotation_level=level,  # type: ignore[arg-type]
        message=message,
    )


def _output(title: str = "Reviewer", summary: str = "") -> CheckRunOutput:
    return CheckRunOutput(title=title, summary=summary)


def test_upsert_creates_new_check_run_when_none_exists() -> None:
    fake = FakeCheckRunsGateway()

    result = fake.upsert_check_run(
        head_sha="abc123",
        name="twerk-reviewer/dignified-python",
        output=_output(),
        annotations=[_annotation()],
    )

    assert result.head_sha == "abc123"
    assert result.name == "twerk-reviewer/dignified-python"
    assert result.status == "completed"
    assert result.conclusion == "neutral"


def test_upsert_replaces_existing_check_run_with_same_key() -> None:
    fake = FakeCheckRunsGateway()
    first = fake.upsert_check_run(
        head_sha="abc123",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=[_annotation(message="v1")],
    )
    second = fake.upsert_check_run(
        head_sha="abc123",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=[_annotation(message="v2")],
    )

    # Same id preserved — the upsert replaces, not duplicates.
    assert first.id == second.id
    # Latest annotations win.
    stored = fake.list_annotations(first.id)
    assert len(stored) == 1
    assert stored[0].message == "v2"


def test_upsert_different_head_sha_creates_separate_check_run() -> None:
    """Idempotence is per-(head_sha, name); a new SHA gets its own check run."""
    fake = FakeCheckRunsGateway()
    first = fake.upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=[],
    )
    second = fake.upsert_check_run(
        head_sha="def",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=[],
    )
    assert first.id != second.id


def test_find_check_run_returns_stored_entry() -> None:
    fake = FakeCheckRunsGateway()
    created = fake.upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=[],
    )

    found = fake.find_check_run("abc", "twerk-reviewer/r")
    assert found == created


def test_find_check_run_returns_none_for_missing() -> None:
    fake = FakeCheckRunsGateway()
    assert fake.find_check_run("abc", "twerk-reviewer/r") is None


def test_find_check_run_discriminates_by_name() -> None:
    fake = FakeCheckRunsGateway()
    fake.upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/a",
        output=_output(),
        annotations=[],
    )
    assert fake.find_check_run("abc", "twerk-reviewer/b") is None


def test_pagination_120_annotations_records_three_batches() -> None:
    """Mirror the real gateway's 50-per-request chunking.

    Tests seeding 120 annotations assert three batches (50 + 50 + 20)
    without having to exercise the REST surface.
    """
    fake = FakeCheckRunsGateway()
    annotations = [_annotation(start_line=i + 1) for i in range(120)]

    fake.upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=annotations,
    )

    assert fake._append_batches == [50, 50, 20]


def test_empty_annotations_records_zero_batch() -> None:
    fake = FakeCheckRunsGateway()
    fake.upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=[],
    )
    assert fake._append_batches == [0]


def test_upserted_calls_records_head_sha_name_and_count() -> None:
    fake = FakeCheckRunsGateway()
    fake.upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=[_annotation(), _annotation()],
    )
    assert fake._upserted_calls == [("abc", "twerk-reviewer/r", 2)]


def test_list_annotations_round_trips_upserted_annotations() -> None:
    fake = FakeCheckRunsGateway()
    annotations = [
        _annotation(start_line=1, message="one"),
        _annotation(start_line=2, message="two"),
    ]
    created = fake.upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=annotations,
    )

    stored = fake.list_annotations(created.id)
    assert tuple(a.message for a in stored) == ("one", "two")


def test_list_annotations_returns_empty_for_unknown_id() -> None:
    fake = FakeCheckRunsGateway()
    assert fake.list_annotations(9999) == ()


def test_preseeded_check_runs_are_findable() -> None:
    preseeded = CheckRun(
        id=42,
        name="twerk-reviewer/r",
        head_sha="abc",
        status="completed",
        conclusion="neutral",
        html_url="https://example.com/checks/42",
    )
    fake = FakeCheckRunsGateway(
        check_runs=[preseeded],
        annotations_by_id={42: [_annotation(message="preseed")]},
    )

    found = fake.find_check_run("abc", "twerk-reviewer/r")
    assert found == preseeded
    assert fake.list_annotations(42)[0].message == "preseed"


def test_upsert_after_preseed_preserves_id() -> None:
    preseeded = CheckRun(
        id=42,
        name="twerk-reviewer/r",
        head_sha="abc",
        status="completed",
        conclusion="neutral",
        html_url="https://example.com/checks/42",
    )
    fake = FakeCheckRunsGateway(check_runs=[preseeded])

    result = fake.upsert_check_run(
        head_sha="abc",
        name="twerk-reviewer/r",
        output=_output(),
        annotations=[_annotation(message="updated")],
    )
    assert result.id == 42
