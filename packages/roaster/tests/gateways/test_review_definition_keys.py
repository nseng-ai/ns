from __future__ import annotations

from pathlib import Path

import pytest

from asdl_core.clinkr.non_ideal_state import error_type_for
from roaster.gateways.review_catalog import real as review_catalog_real
from roaster.gateways.review_catalog.real import RealReviewCatalogGateway
from roaster.models import ReviewerFailure, ReviewSource


def _write(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def _gateway(repo_root: Path, monkeypatch: pytest.MonkeyPatch) -> RealReviewCatalogGateway:
    def fake_git_toplevel(*, cwd: Path) -> Path:
        return repo_root

    monkeypatch.setattr(review_catalog_real, "git_toplevel", fake_git_toplevel)
    return RealReviewCatalogGateway(cwd=repo_root)


def test_real_list_review_keys_is_empty_for_empty_dir(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reviews_dir = tmp_path / "reviews"
    reviews_dir.mkdir()

    catalog = _gateway(tmp_path, monkeypatch).list_review_keys()

    assert not isinstance(catalog, ReviewerFailure)
    assert catalog.keys == ()
    assert catalog.reviews_dir == reviews_dir


def test_real_list_review_keys_reports_flat_and_nested_keys(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reviews_dir = tmp_path / "reviews"
    _write(reviews_dir / "dignified-python.md", "# Dignified Python")
    _write(reviews_dir / "python" / "typing.md", "# Typing")
    _write(reviews_dir / "python" / "errors.md", "# Errors")
    _write(reviews_dir / "not-a-review.txt", "ignored")

    catalog = _gateway(tmp_path, monkeypatch).list_review_keys()

    assert not isinstance(catalog, ReviewerFailure)
    assert catalog.keys == ("dignified-python", "python/errors", "python/typing")
    assert catalog.reviews_dir == reviews_dir


def test_real_list_review_keys_fails_when_dir_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = _gateway(tmp_path, monkeypatch).list_review_keys()

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "reviews_dir_missing"


def test_real_list_review_keys_fails_when_path_is_a_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    weird = tmp_path / "reviews"
    weird.write_text("not a dir", encoding="utf-8")

    result = _gateway(tmp_path, monkeypatch).list_review_keys()

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "reviews_dir_not_a_directory"


def test_real_load_review_source_returns_source_for_key(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reviews_dir = tmp_path / "reviews"
    path = reviews_dir / "python" / "typing.md"
    _write(path, "# Typing")

    result = _gateway(tmp_path, monkeypatch).load_review_source(key="python/typing")

    assert isinstance(result, ReviewSource)
    assert result.key == "python/typing"
    assert result.path == path
    assert result.source == "# Typing"


def test_real_load_review_source_returns_failure_for_missing_key(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    (tmp_path / "reviews").mkdir()

    result = _gateway(tmp_path, monkeypatch).load_review_source(key="nope")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_definition_not_found"


def test_real_load_review_source_fails_when_reviews_dir_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = _gateway(tmp_path, monkeypatch).load_review_source(key="dignified-python")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "reviews_dir_missing"


def test_real_load_review_source_fails_when_reviews_path_is_a_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    (tmp_path / "reviews").write_text("not a dir", encoding="utf-8")

    result = _gateway(tmp_path, monkeypatch).load_review_source(key="dignified-python")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "reviews_dir_not_a_directory"


def test_real_load_review_source_rejects_empty_key(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    (tmp_path / "reviews").mkdir()

    result = _gateway(tmp_path, monkeypatch).load_review_source(key="  ")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_key_invalid"


def test_real_load_review_source_rejects_traversal(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    (tmp_path / "reviews").mkdir()

    result = _gateway(tmp_path, monkeypatch).load_review_source(key="../outside")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_key_invalid"


def test_real_load_review_source_rejects_absolute_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    (tmp_path / "reviews").mkdir()

    result = _gateway(tmp_path, monkeypatch).load_review_source(key="/etc/passwd")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_key_invalid"
