from __future__ import annotations

import pytest

from asdl_reviewer.gateways.harness_detection import real as real_module
from asdl_reviewer.gateways.harness_detection.fake import FakeHarnessDetectionGateway
from asdl_reviewer.gateways.harness_detection.real import RealHarnessDetectionGateway


def test_fake_reports_binary_present() -> None:
    gateway = FakeHarnessDetectionGateway(paths_by_binary={"claude": "/usr/local/bin/claude"})

    detection = gateway.detect(name="claude-code", binary="claude")

    assert detection.available is True
    assert detection.path == "/usr/local/bin/claude"
    assert gateway.detect_calls == (("claude-code", "claude"),)


def test_fake_reports_binary_absent() -> None:
    gateway = FakeHarnessDetectionGateway()

    detection = gateway.detect(name="claude-code", binary="claude")

    assert detection.available is False
    assert detection.path is None


def test_real_delegates_to_shutil_which(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_which(binary: str) -> str | None:
        calls.append(binary)
        return "/usr/local/bin/claude"

    monkeypatch.setattr(real_module.shutil, "which", fake_which)

    detection = RealHarnessDetectionGateway().detect(name="claude-code", binary="claude")

    assert detection.path == "/usr/local/bin/claude"
    assert detection.available is True
    assert calls == ["claude"]


def test_real_reports_absent_binary(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(real_module.shutil, "which", lambda _binary: None)

    detection = RealHarnessDetectionGateway().detect(name="codex", binary="codex")

    assert detection.path is None
    assert detection.available is False
