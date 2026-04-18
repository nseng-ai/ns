from __future__ import annotations

from sklish.discovery import Manifest, aggregate


def test_aggregate_empty() -> None:
    assert aggregate(()) == ()


def test_aggregate_single_manifest_preserves_order() -> None:
    manifest = Manifest(
        dist_name="pkg-a",
        source="owner/repo",
        skills=("b", "a", "c"),
    )
    groups = aggregate([manifest])
    assert len(groups) == 1
    assert groups[0].source == "owner/repo"
    assert groups[0].skills == ("b", "a", "c")


def test_aggregate_dedupes_and_preserves_first_seen_order() -> None:
    m1 = Manifest(dist_name="pkg-a", source="owner/repo", skills=("a", "b"))
    m2 = Manifest(dist_name="pkg-b", source="owner/repo", skills=("b", "c", "a"))
    groups = aggregate([m1, m2])
    assert len(groups) == 1
    assert groups[0].skills == ("a", "b", "c")


def test_aggregate_multiple_sources_preserves_source_order() -> None:
    m1 = Manifest(dist_name="pkg-a", source="o1/r1", skills=("s1",))
    m2 = Manifest(dist_name="pkg-b", source="o2/r2", skills=("s2",))
    m3 = Manifest(dist_name="pkg-c", source="o1/r1", skills=("s3",))
    groups = aggregate([m1, m2, m3])
    assert [group.source for group in groups] == ["o1/r1", "o2/r2"]
    assert groups[0].skills == ("s1", "s3")
    assert groups[1].skills == ("s2",)
