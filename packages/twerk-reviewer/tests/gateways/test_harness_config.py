from __future__ import annotations

from pathlib import Path

from twerk_reviewer.gateways.harness_config.fake import FakeHarnessConfigGateway
from twerk_reviewer.gateways.harness_config.gateway import (
    CONFIG_DIRNAME,
    CONFIG_FILENAME,
    ReviewerConfig,
    config_path,
)
from twerk_reviewer.gateways.harness_config.real import RealHarnessConfigGateway
from twerk_reviewer.models import ReviewerFailure


def test_config_path_matches_convention() -> None:
    assert config_path(Path("/repo")) == Path("/repo") / CONFIG_DIRNAME / CONFIG_FILENAME


def test_fake_returns_missing_failure_when_no_config() -> None:
    gateway = FakeHarnessConfigGateway()

    result = gateway.load(Path("/repo"))

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_config_missing"


def test_fake_round_trip() -> None:
    gateway = FakeHarnessConfigGateway()

    gateway.save(Path("/repo"), ReviewerConfig(harness_name="claude-code"))
    loaded = gateway.load(Path("/repo"))

    assert loaded == ReviewerConfig(harness_name="claude-code")
    assert len(gateway.save_calls) == 1


def test_real_writes_and_reads_toml(tmp_path: Path) -> None:
    gateway = RealHarnessConfigGateway()
    config = ReviewerConfig(harness_name="claude-code")

    save_result = gateway.save(tmp_path, config)
    assert save_result is None

    toml_path = config_path(tmp_path)
    assert toml_path.exists()
    text = toml_path.read_text(encoding="utf-8")
    assert "schema_version = 1" in text
    assert "[harness]" in text
    assert 'name = "claude-code"' in text

    loaded = gateway.load(tmp_path)
    assert loaded == config


def test_real_returns_missing_when_file_absent(tmp_path: Path) -> None:
    gateway = RealHarnessConfigGateway()

    result = gateway.load(tmp_path)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_config_missing"


def test_real_rejects_invalid_toml(tmp_path: Path) -> None:
    path = config_path(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_text("this is not { valid toml", encoding="utf-8")

    result = RealHarnessConfigGateway().load(tmp_path)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_config_invalid_toml"


def test_real_rejects_unsupported_schema(tmp_path: Path) -> None:
    path = config_path(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_text(
        'schema_version = 99\n\n[harness]\nname = "claude-code"\n',
        encoding="utf-8",
    )

    result = RealHarnessConfigGateway().load(tmp_path)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_config_unsupported_schema"


def test_real_rejects_missing_harness_section(tmp_path: Path) -> None:
    path = config_path(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_text("schema_version = 1\n", encoding="utf-8")

    result = RealHarnessConfigGateway().load(tmp_path)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_config_invalid"


def test_real_rejects_missing_harness_name(tmp_path: Path) -> None:
    path = config_path(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_text(
        'schema_version = 1\n\n[harness]\nother = "nope"\n',
        encoding="utf-8",
    )

    result = RealHarnessConfigGateway().load(tmp_path)

    assert isinstance(result, ReviewerFailure)
    assert result.error_type == "harness_config_invalid"


def test_real_escapes_special_characters_in_name(tmp_path: Path) -> None:
    gateway = RealHarnessConfigGateway()
    tricky = ReviewerConfig(harness_name='has "quotes" and \\ backslash')

    gateway.save(tmp_path, tricky)
    loaded = gateway.load(tmp_path)

    assert loaded == tricky
