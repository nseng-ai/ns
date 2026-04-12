from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from clinkr.params import build_request_from_click_params, extract_click_params


@dataclass(frozen=True)
class AnnotatedRequest:
    target: Annotated[str, click.Argument(["target"])]
    verbose: Annotated[bool, click.Option(["--verbose", "-v"], is_flag=True)] = False


@dataclass(frozen=True)
class InferredRequest:
    name: str
    count: int = 3
    dry_run: bool = False


@dataclass(frozen=True)
class EmptyRequest:
    pass


def test_extract_annotated_argument() -> None:
    params = extract_click_params(AnnotatedRequest)
    arg = params[0]
    assert isinstance(arg, click.Argument)
    assert arg.name == "target"


def test_extract_annotated_option() -> None:
    params = extract_click_params(AnnotatedRequest)
    opts = [p for p in params if isinstance(p, click.Option)]
    assert len(opts) == 1
    assert opts[0].name == "verbose"
    assert opts[0].is_flag is True


def test_extract_auto_inferred_argument() -> None:
    params = extract_click_params(InferredRequest)
    args = [p for p in params if isinstance(p, click.Argument)]
    assert len(args) == 1
    assert args[0].name == "name"


def test_extract_auto_inferred_option() -> None:
    params = extract_click_params(InferredRequest)
    opts = [p for p in params if isinstance(p, click.Option) and not p.is_flag]
    assert len(opts) == 1
    assert opts[0].name == "count"
    assert opts[0].default == 3


def test_extract_auto_inferred_flag() -> None:
    params = extract_click_params(InferredRequest)
    flags = [p for p in params if isinstance(p, click.Option) and p.is_flag]
    assert len(flags) == 1
    assert flags[0].name == "dry_run"


def test_extract_empty_request() -> None:
    params = extract_click_params(EmptyRequest)
    assert params == []


def test_build_request_from_click_params() -> None:
    kwargs = {"name": "alice", "count": 5, "dry_run": True}
    request = build_request_from_click_params(InferredRequest, kwargs)
    assert request == InferredRequest(name="alice", count=5, dry_run=True)


def test_build_request_handles_hyphens() -> None:
    kwargs = {"name": "bob", "count": 1, "dry-run": False}
    request = build_request_from_click_params(InferredRequest, kwargs)
    assert request == InferredRequest(name="bob", count=1, dry_run=False)
