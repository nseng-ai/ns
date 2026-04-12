from __future__ import annotations

from dataclasses import dataclass

import pytest

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation, get_operation_meta


@dataclass(frozen=True)
class FakeRequest:
    name: str


@dataclass(frozen=True)
class FakeResult:
    message: str


def test_decorator_attaches_metadata() -> None:
    @clinkr_operation(name="greet", help="Say hi.", aliases=("hi",))
    def greet(request: FakeRequest) -> FakeResult | ClinkrCommandError:
        return FakeResult(message=f"hello {request.name}")

    meta = get_operation_meta(greet)
    assert meta is not None
    assert meta.name == "greet"
    assert meta.help == "Say hi."
    assert meta.aliases == ("hi",)
    assert meta.request_type is FakeRequest
    assert meta.result_types == (FakeResult,)
    assert meta.human_renderer is None


def test_plain_return_type_no_union() -> None:
    @clinkr_operation(name="op")
    def op(request: FakeRequest) -> FakeResult:
        return FakeResult(message="ok")

    meta = get_operation_meta(op)
    assert meta is not None
    assert meta.result_types == (FakeResult,)


def test_decorated_function_still_callable() -> None:
    @clinkr_operation(name="op")
    def op(request: FakeRequest) -> FakeResult:
        return FakeResult(message=f"hi {request.name}")

    result = op(FakeRequest(name="alice"))
    assert result.message == "hi alice"


def test_undecorated_function_returns_none() -> None:
    def plain(request: FakeRequest) -> FakeResult:
        return FakeResult(message="ok")

    assert get_operation_meta(plain) is None


def test_error_no_params() -> None:
    with pytest.raises(TypeError, match="exactly one parameter"):

        @clinkr_operation(name="op")
        def op() -> FakeResult:
            return FakeResult(message="ok")


def test_error_too_many_params() -> None:
    with pytest.raises(TypeError, match="exactly one parameter"):

        @clinkr_operation(name="op")
        def op(a: FakeRequest, b: str) -> FakeResult:
            return FakeResult(message="ok")


def test_error_no_return_annotation() -> None:
    with pytest.raises(TypeError, match="return type annotation"):

        @clinkr_operation(name="op")
        def op(request: FakeRequest):  # type: ignore[no-untyped-def]
            return FakeResult(message="ok")


def test_error_only_machine_command_error_return() -> None:
    with pytest.raises(TypeError, match="cannot infer result_types"):

        @clinkr_operation(name="op")
        def op(request: FakeRequest) -> ClinkrCommandError:
            return ClinkrCommandError(error_type="x", message="y")


def test_custom_human_renderer() -> None:
    def my_renderer(result: FakeResult) -> None:
        pass

    @clinkr_operation(name="op", human_renderer=my_renderer)
    def op(request: FakeRequest) -> FakeResult:
        return FakeResult(message="ok")

    meta = get_operation_meta(op)
    assert meta is not None
    assert meta.human_renderer is my_renderer
