from __future__ import annotations

import json
import sys
import types
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

import pytest
from click.testing import CliRunner

from clinkr.command import ClinkrCommandError
from clinkr.group import (
    ClinkrGroup,
    ClinkrGroupMeta,
    clinkr_group,
    discover_group,
    get_group_meta,
)
from clinkr.operation import clinkr_operation

# -- fixtures ----------------------------------------------------------------


@dataclass(frozen=True)
class PingRequest:
    pass


@dataclass(frozen=True)
class PingResult:
    pong: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {"pong": self.pong}


@clinkr_operation(name="ping", help="Ping.", aliases=("p",))
def run_ping(request: PingRequest) -> PingResult | ClinkrCommandError:
    return PingResult(pong=True)


@contextmanager
def _fake_package(
    package_name: str,
    *,
    init_attrs: dict[str, Any] | None = None,
    submodules: dict[str, dict[str, Any]] | None = None,
) -> Iterator[None]:
    """Create a fake package in sys.modules."""
    pkg = types.ModuleType(package_name)
    pkg.__path__ = []  # type: ignore[attr-defined]
    for attr_name, attr_value in (init_attrs or {}).items():
        setattr(pkg, attr_name, attr_value)
    sys.modules[package_name] = pkg

    created_modules: list[str] = []
    for mod_name, attrs in (submodules or {}).items():
        full_name = f"{package_name}.{mod_name}"
        mod = types.ModuleType(full_name)
        for attr_name, attr_value in attrs.items():
            setattr(mod, attr_name, attr_value)
        sys.modules[full_name] = mod
        created_modules.append(full_name)

    try:
        yield
    finally:
        sys.modules.pop(package_name, None)
        for full_name in created_modules:
            sys.modules.pop(full_name, None)


# -- tests -------------------------------------------------------------------


def test_clinkr_group_decorator_stamps_metadata() -> None:
    @clinkr_group(help="Test help.")
    def my_group() -> ClinkrGroup:
        return ClinkrGroup()

    meta = get_group_meta(my_group)
    assert meta is not None
    assert meta == ClinkrGroupMeta(help="Test help.")


def test_clinkr_group_decorator_no_metadata_on_plain_function() -> None:
    def plain() -> ClinkrGroup:
        return ClinkrGroup()

    assert get_group_meta(plain) is None


def test_clinkr_group_decorator_function_still_callable() -> None:
    @clinkr_group(help="Test.")
    def my_group() -> ClinkrGroup:
        return ClinkrGroup()

    result = my_group()
    assert isinstance(result, ClinkrGroup)


def test_discover_group_basic() -> None:
    @clinkr_group(help="Manage users.")
    def users() -> ClinkrGroup:
        return ClinkrGroup(operations=[run_ping])

    with _fake_package(
        "_test_dg_basic",
        init_attrs={"users": users},
    ):
        group = discover_group("_test_dg_basic")

    assert group.name == "users"
    assert group.help == "Manage users."
    assert "ping" in group.commands

    runner = CliRunner()
    result = runner.invoke(group, ["ping"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["pong"] is True


def test_discover_group_name_from_function_not_module() -> None:
    @clinkr_group(help="Help.")
    def my_custom_name() -> ClinkrGroup:
        return ClinkrGroup()

    with _fake_package(
        "_test_dg_name",
        init_attrs={"my_custom_name": my_custom_name},
    ):
        group = discover_group("_test_dg_name")

    assert group.name == "my_custom_name"


def test_discover_group_name_override_via_decorator() -> None:
    """`@clinkr_group(name=...)` wins over the function's `__name__`.

    Needed when the desired CLI subgroup name contains characters that
    aren't valid in Python identifiers (e.g. the hyphenated `pr-address`
    subgroup exposed by twerk-pr-address).
    """

    @clinkr_group(name="pr-address", help="Hyphenated subgroup.")
    def pr_address() -> ClinkrGroup:
        return ClinkrGroup()

    with _fake_package(
        "_test_dg_hyphenated",
        init_attrs={"pr_address": pr_address},
    ):
        group = discover_group("_test_dg_hyphenated")

    assert group.name == "pr-address"
    assert group.help == "Hyphenated subgroup."


def test_discover_group_defaults_without_decorator() -> None:
    with _fake_package(
        "_test_dg_none",
        init_attrs={"__doc__": "Manage users.", "run_ping": run_ping},
    ):
        group = discover_group("_test_dg_none")

    assert group.name == "_test_dg_none"
    assert group.help == "Manage users."
    assert "ping" in group.commands

    runner = CliRunner()
    result = runner.invoke(group, ["ping"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["pong"] is True

    help_result = runner.invoke(group, ["--help"])
    assert help_result.exit_code == 0
    assert "Manage users." in help_result.output


def test_discover_group_errors_multiple_decorators() -> None:
    @clinkr_group(help="One.")
    def group_a() -> ClinkrGroup:
        return ClinkrGroup()

    @clinkr_group(help="Two.")
    def group_b() -> ClinkrGroup:
        return ClinkrGroup()

    with _fake_package(
        "_test_dg_multi",
        init_attrs={"group_a": group_a, "group_b": group_b},
    ):
        with pytest.raises(ValueError, match="multiple"):
            discover_group("_test_dg_multi")


def test_discover_group_errors_wrong_return_type() -> None:
    @clinkr_group(help="Bad.")
    def bad_group() -> ClinkrGroup:
        return "not a group"  # type: ignore[return-value]

    with _fake_package(
        "_test_dg_bad_type",
        init_attrs={"bad_group": bad_group},
    ):
        with pytest.raises(TypeError, match="must return a ClinkrGroup"):
            discover_group("_test_dg_bad_type")


def test_discover_group_alias_works() -> None:
    @clinkr_group(help="Aliases.")
    def aliased() -> ClinkrGroup:
        return ClinkrGroup(operations=[run_ping])

    with _fake_package(
        "_test_dg_alias",
        init_attrs={"aliased": aliased},
    ):
        group = discover_group("_test_dg_alias")

    runner = CliRunner()
    result = runner.invoke(group, ["p"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["pong"] is True
