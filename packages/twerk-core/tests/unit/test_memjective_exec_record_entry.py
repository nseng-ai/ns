from __future__ import annotations

from typing import Any

from twerk_core.memjective.exec_record_entry import (
    EntryInvalid,
    UpsertOk,
    UpsertReject,
    ValidEntry,
    apply_upsert,
    validate_entry_payload,
)
from twerk_core.memjective.state import (
    MemjectiveState,
    StateEntry,
    StateRoot,
)


def _state(*entries: dict[str, Any]) -> MemjectiveState:
    return MemjectiveState(
        version=1,
        slug="widget",
        root=StateRoot(namespace="memjectives", branch="master", path="widget"),
        entries=tuple(StateEntry(id=e["id"], raw=e) for e in entries),
    )


# ---------------------------------------------------------------------------
# validate_entry_payload
# ---------------------------------------------------------------------------


def test_validate_rejects_non_object() -> None:
    result = validate_entry_payload([])  # type: ignore[arg-type]

    assert isinstance(result, EntryInvalid)
    assert "JSON object" in result.reason


def test_validate_rejects_missing_id() -> None:
    result = validate_entry_payload({"resolution": "tracked"})

    assert isinstance(result, EntryInvalid)
    assert "id" in result.reason


def test_validate_rejects_empty_id() -> None:
    result = validate_entry_payload({"id": "", "resolution": "tracked"})

    assert isinstance(result, EntryInvalid)
    assert "non-empty" in result.reason


def test_validate_rejects_unsupported_id_shape() -> None:
    result = validate_entry_payload({"id": "issue-7", "resolution": "tracked"})

    assert isinstance(result, EntryInvalid)
    assert "pr-<int>" in result.reason


def test_validate_rejects_unknown_resolution() -> None:
    result = validate_entry_payload({"id": "branch-foo", "resolution": "rejected"})

    assert isinstance(result, EntryInvalid)
    assert "resolution" in result.reason


def test_validate_rejects_summary_non_string() -> None:
    payload = {
        "id": "branch-foo",
        "resolution": "tracked",
        "summary": 7,
    }
    result = validate_entry_payload(payload)

    assert isinstance(result, EntryInvalid)
    assert "summary" in result.reason


def test_validate_requires_pr_object_when_id_is_pr() -> None:
    result = validate_entry_payload({"id": "pr-221", "resolution": "incorporated"})

    assert isinstance(result, EntryInvalid)
    assert "entry.pr" in result.reason


def test_validate_rejects_pr_number_mismatch() -> None:
    payload = {
        "id": "pr-221",
        "resolution": "incorporated",
        "pr": {"number": 222},
    }
    result = validate_entry_payload(payload)

    assert isinstance(result, EntryInvalid)
    assert "222" in result.reason


def test_validate_rejects_pr_number_non_int() -> None:
    payload = {
        "id": "pr-221",
        "resolution": "incorporated",
        "pr": {"number": "221"},
    }
    result = validate_entry_payload(payload)

    assert isinstance(result, EntryInvalid)
    assert "integer" in result.reason


def test_validate_rejects_pr_state_invalid() -> None:
    payload = {
        "id": "pr-221",
        "resolution": "incorporated",
        "pr": {"number": 221, "state": "DRAFT"},
    }
    result = validate_entry_payload(payload)

    assert isinstance(result, EntryInvalid)
    assert "state" in result.reason


def test_validate_accepts_pr_entry() -> None:
    payload = {
        "id": "pr-221",
        "resolution": "incorporated",
        "summary": "lifted",
        "pr": {"number": 221, "state": "MERGED", "head_ref_name": "feat/x"},
        "source": {"branch": "feat/x"},
    }
    result = validate_entry_payload(payload)

    assert isinstance(result, ValidEntry)
    assert result.id == "pr-221"
    assert result.raw == payload


def test_validate_accepts_branch_entry_without_pr() -> None:
    payload = {"id": "branch-foo", "resolution": "tracked"}
    result = validate_entry_payload(payload)

    assert isinstance(result, ValidEntry)
    assert result.id == "branch-foo"


def test_validate_accepts_no_doc_change_resolution() -> None:
    payload = {
        "id": "pr-221",
        "resolution": "incorporated_no_doc_change",
        "pr": {"number": 221},
    }
    result = validate_entry_payload(payload)

    assert isinstance(result, ValidEntry)


# ---------------------------------------------------------------------------
# apply_upsert — happy paths
# ---------------------------------------------------------------------------


def test_upsert_creates_new_branch_entry() -> None:
    state = _state()
    valid = ValidEntry(raw={"id": "branch-foo", "resolution": "tracked"}, id="branch-foo")

    result = apply_upsert(state, valid, force=False)

    assert isinstance(result, UpsertOk)
    assert result.action == "created"
    assert [e.id for e in result.entries] == ["branch-foo"]


def test_upsert_updates_existing_entry_in_place() -> None:
    state = _state(
        {"id": "pr-1", "resolution": "tracked", "pr": {"number": 1}},
        {"id": "branch-foo", "resolution": "tracked"},
    )
    raw = {"id": "branch-foo", "resolution": "incorporated"}
    valid = ValidEntry(raw=raw, id="branch-foo")

    result = apply_upsert(state, valid, force=False)

    assert isinstance(result, UpsertOk)
    assert result.action == "updated"
    assert [e.id for e in result.entries] == ["pr-1", "branch-foo"]
    assert result.entries[1].raw == raw


def test_upsert_promotes_branch_to_pr_in_place() -> None:
    state = _state(
        {
            "id": "branch-feat-x",
            "resolution": "tracked",
            "pr": {"number": 221, "head_ref_name": "feat-x"},
        },
        {"id": "pr-7", "resolution": "incorporated", "pr": {"number": 7}},
    )
    raw = {
        "id": "pr-221",
        "resolution": "incorporated",
        "pr": {"number": 221, "head_ref_name": "feat-x"},
    }
    valid = ValidEntry(raw=raw, id="pr-221")

    result = apply_upsert(state, valid, force=False)

    assert isinstance(result, UpsertOk)
    assert result.action == "promoted"
    assert [e.id for e in result.entries] == ["pr-221", "pr-7"]


def test_upsert_does_not_promote_when_branch_name_does_not_match_head_ref() -> None:
    state = _state(
        {
            "id": "branch-other",
            "resolution": "tracked",
            "pr": {"number": 221, "head_ref_name": "other"},
        },
    )
    raw = {
        "id": "pr-221",
        "resolution": "incorporated",
        "pr": {"number": 221, "head_ref_name": "feat-x"},
    }
    valid = ValidEntry(raw=raw, id="pr-221")

    result = apply_upsert(state, valid, force=False)

    assert isinstance(result, UpsertReject)
    assert result.error_type == "duplicate_pr_number"


# ---------------------------------------------------------------------------
# apply_upsert — collisions and regression guard
# ---------------------------------------------------------------------------


def test_upsert_rejects_duplicate_pr_number_on_different_pr_id() -> None:
    state = _state(
        {"id": "pr-7", "resolution": "incorporated", "pr": {"number": 221}},
    )
    valid = ValidEntry(
        raw={
            "id": "pr-221",
            "resolution": "incorporated",
            "pr": {"number": 221},
        },
        id="pr-221",
    )

    result = apply_upsert(state, valid, force=False)

    assert isinstance(result, UpsertReject)
    assert result.error_type == "duplicate_pr_number"
    assert "pr-7" in result.message


def test_upsert_blocks_regression_from_incorporated_to_tracked() -> None:
    state = _state(
        {"id": "pr-7", "resolution": "incorporated", "pr": {"number": 7}},
    )
    valid = ValidEntry(
        raw={"id": "pr-7", "resolution": "tracked", "pr": {"number": 7}},
        id="pr-7",
    )

    result = apply_upsert(state, valid, force=False)

    assert isinstance(result, UpsertReject)
    assert result.error_type == "resolution_regression"


def test_upsert_force_overrides_regression_guard() -> None:
    state = _state(
        {"id": "pr-7", "resolution": "incorporated", "pr": {"number": 7}},
    )
    valid = ValidEntry(
        raw={"id": "pr-7", "resolution": "tracked", "pr": {"number": 7}},
        id="pr-7",
    )

    result = apply_upsert(state, valid, force=True)

    assert isinstance(result, UpsertOk)
    assert result.action == "updated"


def test_upsert_allows_forward_progress_from_tracked_to_incorporated() -> None:
    state = _state(
        {"id": "pr-7", "resolution": "tracked", "pr": {"number": 7}},
    )
    valid = ValidEntry(
        raw={"id": "pr-7", "resolution": "incorporated", "pr": {"number": 7}},
        id="pr-7",
    )

    result = apply_upsert(state, valid, force=False)

    assert isinstance(result, UpsertOk)
    assert result.action == "updated"
