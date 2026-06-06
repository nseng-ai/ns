from __future__ import annotations

import pytest

from brmem.fake import FakeBranchMemoryGateway
from brmem.gateway import BranchMemoryGateway
from roaster.stack_models import StackRunManifest
from roaster.stack_run_storage import (
    ROASTER_RUNS_NAMESPACE,
    StackRunIndex,
    StackRunIndexEntry,
    StackRunStorageError,
    add_run_to_index,
    parse_stack_run_index,
    read_stack_run_index,
    read_stack_run_manifest,
    read_stack_run_resolver,
    read_stack_run_triage,
    render_stack_run_index,
    select_stack_run_slug,
    stack_run_artifact_plan,
    stack_run_keys,
    write_stack_run_index,
    write_stack_run_manifest,
    write_stack_run_resolver,
    write_stack_run_triage,
)


class _CountingBranchMemoryGateway(FakeBranchMemoryGateway):
    def __init__(self) -> None:
        super().__init__()
        self._counted_puts: list[tuple[str, str, str, str]] = []

    def put(self, namespace: str, key: str, branch: str, content: str) -> str:
        self._counted_puts.append((namespace, key, branch, content))
        return super().put(namespace, key, branch, content)

    @property
    def counted_puts(self) -> tuple[tuple[str, str, str, str], ...]:
        return tuple(self._counted_puts)


def test_stack_run_keys_have_canonical_shapes() -> None:
    keys = stack_run_keys(
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug="thermonuclear-stack",
    )

    assert keys.index_key == "indexes/thermonuclear/full-review.md"
    assert keys.manifest_key == "runs/thermonuclear/full-review/thermonuclear-stack/manifest.md"
    assert keys.triage_key == "runs/thermonuclear/full-review/thermonuclear-stack/triage.md"
    assert (
        keys.resolver_key(batch_slug="fix-tests")
        == "runs/thermonuclear/full-review/thermonuclear-stack/batches/fix-tests/resolver.md"
    )


def test_stack_run_plan_scopes_every_locator_to_original_implementation_branch() -> None:
    plan = stack_run_artifact_plan(
        impl_branch="feature/thermonuclear",
        impl_branch_slug="feature-thermonuclear",
        profile_slug="full-review",
        run_slug="thermonuclear-stack",
    )
    resolver = plan.resolver(batch_slug="fix-tests")

    assert plan.index.namespace == ROASTER_RUNS_NAMESPACE
    assert plan.index.branch == "feature/thermonuclear"
    assert plan.manifest.branch == "feature/thermonuclear"
    assert plan.triage.branch == "feature/thermonuclear"
    assert resolver.branch == "feature/thermonuclear"


def test_rejects_unencodable_branch_memory_branch_names_early() -> None:
    gateway = FakeBranchMemoryGateway()

    with pytest.raises(StackRunStorageError, match="Branch Memory branch names"):
        write_stack_run_triage(
            gateway,
            impl_branch="feature---bad",
            impl_branch_slug="feature-bad",
            profile_slug="full-review",
            run_slug="thermonuclear-stack",
            content="triage",
        )


def test_rejects_invalid_branch_memory_key_segments() -> None:
    with pytest.raises(StackRunStorageError, match="implementation branch slug"):
        stack_run_keys(
            impl_branch_slug="bad---slug",
            profile_slug="full-review",
            run_slug="thermonuclear-stack",
        )


def test_write_and_read_stack_run_index_round_trips_through_branch_memory() -> None:
    gateway = FakeBranchMemoryGateway()
    index = StackRunIndex(
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        runs=(StackRunIndexEntry(run_slug="thermonuclear-stack"),),
        latest_run_slug="thermonuclear-stack",
    )

    locator = write_stack_run_index(gateway, impl_branch="feature/thermonuclear", index=index)
    loaded = read_stack_run_index(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
    )

    assert locator.namespace == ROASTER_RUNS_NAMESPACE
    assert locator.key == "indexes/thermonuclear/full-review.md"
    assert locator.branch == "feature/thermonuclear"
    assert loaded == index
    assert (
        gateway.get(ROASTER_RUNS_NAMESPACE, locator.key, "thermonuclear/roaster/generated") is None
    )


def test_render_stack_run_index_is_deterministic_markdown() -> None:
    index = StackRunIndex(
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        runs=(StackRunIndexEntry(run_slug="thermonuclear-stack"),),
        latest_run_slug="thermonuclear-stack",
    )

    rendered = render_stack_run_index(index)

    assert rendered == (
        "---\n"
        "schema_version: roaster.stack.run-index.v1\n"
        "impl_branch_slug: thermonuclear\n"
        "profile_slug: full-review\n"
        "latest_run_slug: thermonuclear-stack\n"
        "runs:\n"
        "- run_slug: thermonuclear-stack\n"
        "---\n\n"
        "# Roaster stack run index\n"
    )
    assert parse_stack_run_index(rendered) == index


def test_write_and_read_stack_run_manifest_round_trips() -> None:
    gateway = FakeBranchMemoryGateway()
    manifest = StackRunManifest(
        profile_slug="full-review",
        run_slug="thermonuclear-stack",
        impl_branch_slug="thermonuclear",
        base_ref="main",
        target_branch="feature/thermonuclear",
        target_pr="123",
        batch_slugs=("fix-tests", "docs"),
    )

    locator = write_stack_run_manifest(
        gateway,
        impl_branch="feature/thermonuclear",
        manifest=manifest,
    )
    loaded = read_stack_run_manifest(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug="thermonuclear-stack",
    )

    assert locator.key == "runs/thermonuclear/full-review/thermonuclear-stack/manifest.md"
    assert loaded == manifest


def test_write_and_read_triage_and_resolver_artifacts() -> None:
    gateway = FakeBranchMemoryGateway()

    triage_locator = write_stack_run_triage(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug="thermonuclear-stack",
        content="triage markdown",
    )
    resolver_locator = write_stack_run_resolver(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug="thermonuclear-stack",
        batch_slug="fix-tests",
        content="resolver markdown",
    )

    assert triage_locator.key == "runs/thermonuclear/full-review/thermonuclear-stack/triage.md"
    assert (
        resolver_locator.key
        == "runs/thermonuclear/full-review/thermonuclear-stack/batches/fix-tests/resolver.md"
    )
    assert (
        read_stack_run_triage(
            gateway,
            impl_branch="feature/thermonuclear",
            impl_branch_slug="thermonuclear",
            profile_slug="full-review",
            run_slug="thermonuclear-stack",
        )
        == "triage markdown"
    )
    assert (
        read_stack_run_resolver(
            gateway,
            impl_branch="feature/thermonuclear",
            impl_branch_slug="thermonuclear",
            profile_slug="full-review",
            run_slug="thermonuclear-stack",
            batch_slug="fix-tests",
        )
        == "resolver markdown"
    )


def test_select_stack_run_slug_reuses_latest_run_by_default() -> None:
    gateway = FakeBranchMemoryGateway()
    index = StackRunIndex(
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        runs=(
            StackRunIndexEntry(run_slug="thermonuclear-stack"),
            StackRunIndexEntry(run_slug="thermonuclear-stack-2"),
        ),
        latest_run_slug="thermonuclear-stack-2",
    )
    write_stack_run_index(gateway, impl_branch="feature/thermonuclear", index=index)

    selection = select_stack_run_slug(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug_stem="thermonuclear-stack",
    )

    assert selection.run_slug == "thermonuclear-stack-2"
    assert selection.resumes_existing_run is True


def test_select_stack_run_slug_allocates_next_semantic_ordinal_for_new_run() -> None:
    gateway = FakeBranchMemoryGateway()
    index = StackRunIndex(
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        runs=(
            StackRunIndexEntry(run_slug="thermonuclear-stack"),
            StackRunIndexEntry(run_slug="thermonuclear-stack-2"),
        ),
        latest_run_slug="thermonuclear-stack-2",
    )
    write_stack_run_index(gateway, impl_branch="feature/thermonuclear", index=index)

    selection = select_stack_run_slug(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug_stem="thermonuclear-stack",
        new_run=True,
    )

    assert selection.run_slug == "thermonuclear-stack-3"
    assert selection.resumes_existing_run is False


def test_select_stack_run_slug_uses_explicit_slug_without_writing() -> None:
    gateway = _CountingBranchMemoryGateway()

    selection = select_stack_run_slug(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug_stem="thermonuclear-stack",
        run_slug="custom-run",
    )

    assert selection.run_slug == "custom-run"
    assert selection.resumes_existing_run is False
    assert gateway.counted_puts == ()


def test_add_run_to_index_sets_latest_and_preserves_existing_runs() -> None:
    index = StackRunIndex(
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        runs=(StackRunIndexEntry(run_slug="thermonuclear-stack"),),
        latest_run_slug="thermonuclear-stack",
    )

    updated = add_run_to_index(
        index,
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug="thermonuclear-stack-2",
    )

    assert updated.runs == (
        StackRunIndexEntry(run_slug="thermonuclear-stack"),
        StackRunIndexEntry(run_slug="thermonuclear-stack-2"),
    )
    assert updated.latest_run_slug == "thermonuclear-stack-2"


def test_dry_run_writes_return_locators_without_putting_entries() -> None:
    gateway = _CountingBranchMemoryGateway()
    manifest = StackRunManifest(
        profile_slug="full-review",
        run_slug="thermonuclear-stack",
        impl_branch_slug="thermonuclear",
        batch_slugs=("fix-tests",),
    )
    index = StackRunIndex(
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        runs=(StackRunIndexEntry(run_slug="thermonuclear-stack"),),
        latest_run_slug="thermonuclear-stack",
    )

    write_stack_run_index(gateway, impl_branch="feature/thermonuclear", index=index, dry_run=True)
    write_stack_run_manifest(
        gateway,
        impl_branch="feature/thermonuclear",
        manifest=manifest,
        dry_run=True,
    )
    write_stack_run_triage(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug="thermonuclear-stack",
        content="triage markdown",
        dry_run=True,
    )
    write_stack_run_resolver(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug="thermonuclear-stack",
        batch_slug="fix-tests",
        content="resolver markdown",
        dry_run=True,
    )

    assert gateway.counted_puts == ()
    assert (
        gateway.list_entries(namespace=ROASTER_RUNS_NAMESPACE, branch="feature/thermonuclear") == []
    )


def test_stack_run_storage_helpers_accept_branch_memory_gateway_interface() -> None:
    gateway: BranchMemoryGateway = FakeBranchMemoryGateway()

    selection = select_stack_run_slug(
        gateway,
        impl_branch="feature/thermonuclear",
        impl_branch_slug="thermonuclear",
        profile_slug="full-review",
        run_slug_stem="thermonuclear-stack",
        new_run=True,
    )

    assert selection.run_slug == "thermonuclear-stack"
