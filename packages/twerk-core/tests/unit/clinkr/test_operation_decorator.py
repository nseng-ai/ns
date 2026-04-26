from __future__ import annotations

from dataclasses import dataclass

import click
import pytest

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation, get_operation_meta


@dataclass(frozen=True)
class FakeRequest:
    name: str


@dataclass(frozen=True)
class FakeResult(JsonSerializable):
    message: str


@dataclass(frozen=True)
class BadResult:
    """Fixture for test_result_type_must_subclass_json_serializable.

    Deliberately does not subclass JsonSerializable.
    """

    value: str


def test_clinkr_exit_return_tags_result_type() -> None:
    @clinkr_operation(name="op")
    def op(ctx: click.Context, request: FakeRequest) -> ClinkrExit[FakeResult]:
        return ClinkrExit.ok(FakeResult(message="ok"))

    meta = get_operation_meta(op)
    assert meta is not None
    assert meta.result_types == (FakeResult,)


def test_decorator_attaches_metadata() -> None:
    @clinkr_operation(name="greet", help="Say hi.", aliases=("hi",))
    def greet(ctx: click.Context, request: FakeRequest) -> ClinkrExit[FakeResult]:
        return ClinkrExit.ok(FakeResult(message=f"hello {request.name}"))

    meta = get_operation_meta(greet)
    assert meta is not None
    assert meta.name == "greet"
    assert meta.help == "Say hi."
    assert meta.aliases == ("hi",)
    assert meta.request_type is FakeRequest
    assert meta.result_types == (FakeResult,)
    assert meta.human_renderer is None


def test_clinkr_exit_unparameterized_rejected() -> None:
    with pytest.raises(TypeError, match="ClinkrExit must be parameterized"):

        @clinkr_operation(name="op")
        # Test subject: ClinkrExit without a type parameter — must reject.
        def op(ctx: click.Context, request: FakeRequest) -> ClinkrExit:  # type: ignore[type-arg]
            return ClinkrExit.ok(FakeResult(message="ok"))


def test_result_type_must_subclass_json_serializable() -> None:
    with pytest.raises(
        TypeError,
        match=r"clinkr_operation function .*op_with_bad_result.*"
        r"result type BadResult must subclass JsonSerializable",
    ):

        @clinkr_operation(name="op")
        def op_with_bad_result(ctx: click.Context, request: FakeRequest) -> ClinkrExit[BadResult]:  # type: ignore[type-var]
            del ctx, request
            return ClinkrExit.ok(BadResult(value="x"))  # type: ignore[type-var]


def test_plain_return_type_rejected() -> None:
    with pytest.raises(TypeError, match="return annotation must be ClinkrExit"):

        @clinkr_operation(name="op")
        def op(ctx: click.Context, request: FakeRequest) -> FakeResult:
            return FakeResult(message="ok")


def test_decorated_function_still_callable() -> None:
    @clinkr_operation(name="op")
    def op(ctx: click.Context, request: FakeRequest) -> ClinkrExit[FakeResult]:
        return ClinkrExit.ok(FakeResult(message=f"hi {request.name}"))

    ctx = click.Context(click.Command("dummy"))
    result = op(ctx, FakeRequest(name="alice"))
    assert result.status.name == "OK"
    assert result.data is not None
    assert result.data.message == "hi alice"


def test_undecorated_function_returns_none() -> None:
    def plain(ctx: click.Context, request: FakeRequest) -> ClinkrExit[FakeResult]:
        return ClinkrExit.ok(FakeResult(message="ok"))

    assert get_operation_meta(plain) is None


def test_error_no_params() -> None:
    with pytest.raises(TypeError, match="exactly two parameters"):

        @clinkr_operation(name="op")
        def op() -> ClinkrExit[FakeResult]:
            return ClinkrExit.ok(FakeResult(message="ok"))


def test_error_one_param() -> None:
    with pytest.raises(TypeError, match="exactly two parameters"):

        @clinkr_operation(name="op")
        def op(request: FakeRequest) -> ClinkrExit[FakeResult]:
            return ClinkrExit.ok(FakeResult(message="ok"))


def test_error_too_many_params() -> None:
    with pytest.raises(TypeError, match="exactly two parameters"):

        @clinkr_operation(name="op")
        def op(ctx: click.Context, a: FakeRequest, b: str) -> ClinkrExit[FakeResult]:
            return ClinkrExit.ok(FakeResult(message="ok"))


def test_error_first_param_not_click_context() -> None:
    with pytest.raises(TypeError, match="must be annotated as click.Context"):

        @clinkr_operation(name="op")
        def op(ctx: str, request: FakeRequest) -> ClinkrExit[FakeResult]:
            return ClinkrExit.ok(FakeResult(message="ok"))


def test_error_first_param_missing_annotation() -> None:
    with pytest.raises(TypeError, match="parameter 'ctx' must have a type annotation"):

        @clinkr_operation(name="op")
        # Test subject: missing `ctx` annotation — @clinkr_operation must reject.
        def op(ctx, request: FakeRequest) -> ClinkrExit[FakeResult]:  # type: ignore[no-untyped-def]
            return ClinkrExit.ok(FakeResult(message="ok"))


def test_error_second_param_missing_annotation() -> None:
    with pytest.raises(TypeError, match="parameter 'request' must have a type annotation"):

        @clinkr_operation(name="op")
        # Test subject: missing `request` annotation — @clinkr_operation must reject.
        def op(ctx: click.Context, request) -> ClinkrExit[FakeResult]:  # type: ignore[no-untyped-def]
            return ClinkrExit.ok(FakeResult(message="ok"))


def test_error_no_return_annotation() -> None:
    with pytest.raises(TypeError, match="return type annotation"):

        @clinkr_operation(name="op")
        # Test subject: missing return annotation — @clinkr_operation must reject.
        def op(ctx: click.Context, request: FakeRequest):  # type: ignore[no-untyped-def]
            return ClinkrExit.ok(FakeResult(message="ok"))


def test_custom_human_renderer() -> None:
    def my_renderer(result: FakeResult) -> None:
        pass

    @clinkr_operation(name="op", human_renderer=my_renderer)
    def op(ctx: click.Context, request: FakeRequest) -> ClinkrExit[FakeResult]:
        return ClinkrExit.ok(FakeResult(message="ok"))

    meta = get_operation_meta(op)
    assert meta is not None
    assert meta.human_renderer is my_renderer
