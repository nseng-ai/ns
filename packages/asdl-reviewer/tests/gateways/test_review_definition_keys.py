from __future__ import annotations

from pathlib import Path

from asdl_core.clinkr.non_ideal_state import error_type_for
from asdl_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from asdl_reviewer.gateways.review_definition.real import RealReviewDefinitionGateway
from asdl_reviewer.models import ReviewerFailure, ReviewsDirMissing


def _write(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def test_real_list_reviews_is_empty_for_empty_dir(tmp_path: Path) -> None:
    reviews_dir = tmp_path / "reviews"
    reviews_dir.mkdir()

    keys = RealReviewDefinitionGateway().list_reviews(reviews_dir)

    assert keys == ()


def test_real_list_reviews_reports_flat_and_nested_keys(tmp_path: Path) -> None:
    reviews_dir = tmp_path / "reviews"
    _write(reviews_dir / "dignified-python.md", "# Dignified Python")
    _write(reviews_dir / "python" / "typing.md", "# Typing")
    _write(reviews_dir / "python" / "errors.md", "# Errors")
    _write(reviews_dir / "not-a-review.txt", "ignored")

    keys = RealReviewDefinitionGateway().list_reviews(reviews_dir)

    assert keys == ("dignified-python", "python/errors", "python/typing")


def test_real_list_reviews_fails_when_dir_missing(tmp_path: Path) -> None:
    result = RealReviewDefinitionGateway().list_reviews(tmp_path / "reviews")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "reviews_dir_missing"


def test_real_list_reviews_fails_when_path_is_a_file(tmp_path: Path) -> None:
    weird = tmp_path / "reviews"
    weird.write_text("not a dir", encoding="utf-8")

    result = RealReviewDefinitionGateway().list_reviews(weird)

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "reviews_dir_not_a_directory"


def test_real_resolve_key_returns_path(tmp_path: Path) -> None:
    reviews_dir = tmp_path / "reviews"
    _write(reviews_dir / "python" / "typing.md", "# Typing")

    result = RealReviewDefinitionGateway().resolve_key(reviews_dir, "python/typing")

    assert result == reviews_dir / "python" / "typing.md"


def test_real_resolve_key_returns_failure_for_missing_key(tmp_path: Path) -> None:
    reviews_dir = tmp_path / "reviews"
    reviews_dir.mkdir()

    result = RealReviewDefinitionGateway().resolve_key(reviews_dir, "nope")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_definition_not_found"


def test_real_resolve_key_rejects_empty_key(tmp_path: Path) -> None:
    reviews_dir = tmp_path / "reviews"
    reviews_dir.mkdir()

    result = RealReviewDefinitionGateway().resolve_key(reviews_dir, "  ")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_key_invalid"


def test_real_resolve_key_rejects_traversal(tmp_path: Path) -> None:
    reviews_dir = tmp_path / "reviews"
    reviews_dir.mkdir()

    result = RealReviewDefinitionGateway().resolve_key(reviews_dir, "../outside")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_key_invalid"


def test_real_resolve_key_rejects_absolute_path(tmp_path: Path) -> None:
    reviews_dir = tmp_path / "reviews"
    reviews_dir.mkdir()

    result = RealReviewDefinitionGateway().resolve_key(reviews_dir, "/etc/passwd")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_key_invalid"


def test_fake_list_reviews_infers_from_sources() -> None:
    reviews_dir = Path("/repo/reviews")
    gateway = FakeReviewDefinitionGateway(
        sources_by_path={
            reviews_dir / "dignified-python.md": "# Dignified Python",
            reviews_dir / "python" / "typing.md": "# Typing",
        }
    )

    keys = gateway.list_reviews(reviews_dir)

    assert keys == ("dignified-python", "python/typing")


def test_fake_list_reviews_returns_configured_failure() -> None:
    reviews_dir = Path("/repo/reviews")
    failure = ReviewsDirMissing(message="nope")
    gateway = FakeReviewDefinitionGateway(list_failures={reviews_dir: failure})

    assert gateway.list_reviews(reviews_dir) is failure


def test_fake_resolve_key_returns_configured_path() -> None:
    reviews_dir = Path("/repo/reviews")
    path = reviews_dir / "dignified-python.md"
    gateway = FakeReviewDefinitionGateway(sources_by_path={path: "# D"})

    assert gateway.resolve_key(reviews_dir, "dignified-python") == path


def test_fake_resolve_key_returns_failure_for_unknown_key() -> None:
    reviews_dir = Path("/repo/reviews")
    gateway = FakeReviewDefinitionGateway()

    result = gateway.resolve_key(reviews_dir, "nope")

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_definition_not_found"
