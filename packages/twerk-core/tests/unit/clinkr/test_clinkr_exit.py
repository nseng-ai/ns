from __future__ import annotations

from dataclasses import FrozenInstanceError, dataclass

import pytest

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit, ExitStatus


@dataclass(frozen=True)
class SampleData(JsonSerializable):
    value: str


def test_ok_has_exit_code_zero() -> None:
    exit_obj = ClinkrExit.ok(SampleData(value="hi"))

    assert exit_obj.status is ExitStatus.OK
    assert exit_obj.exit_code == 0
    assert exit_obj.data == SampleData(value="hi")
    assert exit_obj.message is None
    assert exit_obj.error_type is None


def test_negative_has_exit_code_one() -> None:
    exit_obj = ClinkrExit.negative(SampleData(value="partial"), message="not found")

    assert exit_obj.status is ExitStatus.NEGATIVE
    assert exit_obj.exit_code == 1
    assert exit_obj.data == SampleData(value="partial")
    assert exit_obj.message == "not found"
    assert exit_obj.error_type is None


def test_negative_allows_no_data() -> None:
    exit_obj = ClinkrExit.negative(message="nothing here")

    assert exit_obj.exit_code == 1
    assert exit_obj.data is None
    assert exit_obj.message == "nothing here"


def test_failure_has_exit_code_two() -> None:
    exit_obj = ClinkrExit.failure(error_type="git_failed", message="detached head")

    assert exit_obj.status is ExitStatus.FAILURE
    assert exit_obj.exit_code == 2
    assert exit_obj.data is None
    assert exit_obj.message == "detached head"
    assert exit_obj.error_type == "git_failed"


def test_frozen_cannot_mutate() -> None:
    exit_obj = ClinkrExit.ok(SampleData(value="hi"))

    with pytest.raises(FrozenInstanceError):
        exit_obj.message = "tamper"  # type: ignore[misc]


def test_ok_rejects_message() -> None:
    with pytest.raises(ValueError, match="ok must not carry"):
        ClinkrExit(status=ExitStatus.OK, data=SampleData(value="hi"), message="bad")


def test_ok_rejects_error_type() -> None:
    with pytest.raises(ValueError, match="ok must not carry"):
        ClinkrExit(status=ExitStatus.OK, data=SampleData(value="hi"), error_type="x")


def test_negative_rejects_missing_message() -> None:
    with pytest.raises(ValueError, match="negative requires a message"):
        ClinkrExit(status=ExitStatus.NEGATIVE, data=SampleData(value="hi"))


def test_negative_rejects_error_type() -> None:
    with pytest.raises(ValueError, match="negative must not carry an error_type"):
        ClinkrExit(
            status=ExitStatus.NEGATIVE,
            data=SampleData(value="hi"),
            message="m",
            error_type="x",
        )


def test_failure_rejects_missing_error_type() -> None:
    with pytest.raises(ValueError, match="failure requires both"):
        ClinkrExit(status=ExitStatus.FAILURE, message="boom")


def test_failure_rejects_missing_message() -> None:
    with pytest.raises(ValueError, match="failure requires both"):
        ClinkrExit(status=ExitStatus.FAILURE, error_type="bad")


def test_failure_allows_optional_data() -> None:
    exit_obj = ClinkrExit.failure(
        error_type="bad",
        message="m",
        data=SampleData(value="detail"),
    )

    assert exit_obj.exit_code == 2
    assert exit_obj.error_type == "bad"
    assert exit_obj.message == "m"
    assert exit_obj.data == SampleData(value="detail")


def test_envelope_failure_includes_data_when_present() -> None:
    exit_obj = ClinkrExit.failure(
        error_type="bad",
        message="m",
        data=SampleData(value="detail"),
    )

    assert exit_obj.to_envelope_dict() == {
        "exit_code": 2,
        "error_type": "bad",
        "message": "m",
        "data": {"value": "detail"},
    }


def test_envelope_ok_includes_data_only() -> None:
    exit_obj = ClinkrExit.ok(SampleData(value="hi"))

    assert exit_obj.to_envelope_dict() == {
        "exit_code": 0,
        "data": {"value": "hi"},
    }


def test_envelope_negative_includes_message_and_data() -> None:
    exit_obj = ClinkrExit.negative(SampleData(value="partial"), message="not found")

    assert exit_obj.to_envelope_dict() == {
        "exit_code": 1,
        "message": "not found",
        "data": {"value": "partial"},
    }


def test_envelope_negative_without_data_omits_data_key() -> None:
    exit_obj = ClinkrExit.negative(message="nope")

    assert exit_obj.to_envelope_dict() == {
        "exit_code": 1,
        "message": "nope",
    }


def test_envelope_failure_includes_error_type_and_message_no_data() -> None:
    exit_obj = ClinkrExit.failure(error_type="invalid_branch", message="bad name")

    assert exit_obj.to_envelope_dict() == {
        "exit_code": 2,
        "error_type": "invalid_branch",
        "message": "bad name",
    }


def test_envelope_data_uses_to_json_dict_when_available() -> None:
    @dataclass(frozen=True)
    class CustomPayload(JsonSerializable):
        raw: str

        def to_json_dict(self) -> dict[str, str]:
            return {"normalized": self.raw.upper()}

    exit_obj = ClinkrExit.ok(CustomPayload(raw="hi"))

    assert exit_obj.to_envelope_dict() == {
        "exit_code": 0,
        "data": {"normalized": "HI"},
    }
