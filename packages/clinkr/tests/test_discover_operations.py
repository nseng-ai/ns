from __future__ import annotations

import json
import sys
import types
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

from click.testing import CliRunner

from clinkr.command import ClinkrCommandError
from clinkr.group import discover_operations
from clinkr.operation import clinkr_operation


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
    operations_module_name: str,
    *decorated_fns: Any,
) -> Iterator[types.ModuleType]:
    """Create a fake package in sys.modules with the given decorated functions."""
    pkg = types.ModuleType(package_name)
    pkg.__path__ = []  # type: ignore[attr-defined]
    sys.modules[package_name] = pkg

    mod = types.ModuleType(operations_module_name)
    for fn in decorated_fns:
        setattr(mod, fn.__name__, fn)
    sys.modules[operations_module_name] = mod

    try:
        yield pkg
    finally:
        sys.modules.pop(package_name, None)
        sys.modules.pop(operations_module_name, None)


def test_discover_finds_decorated_operations() -> None:
    pkg_name = "_test_discover_pkg"
    mod_name = f"{pkg_name}.ops"
    with _fake_package(pkg_name, mod_name, run_ping) as pkg:
        # Since walk_packages needs __path__ to find submodules,
        # and our fake package has an empty __path__, we put the
        # decorated function directly on the root package module.
        pkg.run_ping = run_ping  # type: ignore[attr-defined]
        group = discover_operations(pkg_name)

        assert "ping" in group.commands
        assert "ping" in group.json_group.commands

        runner = CliRunner()
        result = runner.invoke(group, ["ping"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["pong"] is True


def test_discover_alias_works() -> None:
    pkg_name = "_test_discover_alias_pkg"
    mod_name = f"{pkg_name}.ops"
    with _fake_package(pkg_name, mod_name, run_ping) as pkg:
        pkg.run_ping = run_ping  # type: ignore[attr-defined]
        group = discover_operations(pkg_name)

        runner = CliRunner()
        result = runner.invoke(group, ["p"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["pong"] is True


def test_discover_empty_package() -> None:
    pkg_name = "_test_discover_empty_pkg"
    mod_name = f"{pkg_name}.ops"
    with _fake_package(pkg_name, mod_name):
        group = discover_operations(pkg_name)
        # Only the reserved 'json' subgroup should exist.
        public_commands = {n for n in group.commands if n != "json"}
        assert public_commands == set()
