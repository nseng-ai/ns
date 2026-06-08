"""Tests for Graphite gateway production construction helpers."""

from __future__ import annotations

import subprocess

import pytest

from asdl_core.gt.construction import build_gt_gateway
from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.real_gateway import RealGtGateway


def test_build_gt_gateway_returns_real_gt_gateway() -> None:
    gateway = build_gt_gateway()

    assert isinstance(gateway, GtGateway)
    assert isinstance(gateway, RealGtGateway)


def test_build_gt_gateway_is_lazy(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        raise AssertionError("build_gt_gateway should not run subprocesses")

    monkeypatch.setattr("asdl_core.gt.real_gateway.subprocess.run", fail_run)

    gateway = build_gt_gateway()

    assert isinstance(gateway, RealGtGateway)
