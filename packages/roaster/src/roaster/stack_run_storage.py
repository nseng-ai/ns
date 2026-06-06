"""Branch Memory storage helpers for roaster stack runs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, TypeAlias, cast

import yaml

from brmem.gateway import BranchMemoryGateway
from roaster.stack_models import (
    StackRunArtifactLocator,
    StackRunBatchState,
    StackRunDashboardPublication,
    StackRunFailureContext,
    StackRunManifest,
    StackRunSubmission,
)
from roaster.stack_slugs import (
    StackSlugError,
    validate_batch_slug,
    validate_branch_memory_branch_name,
    validate_branch_memory_segment,
    validate_profile_slug,
    validate_run_slug,
)

ROASTER_RUNS_NAMESPACE = "roaster-runs"
_INDEX_SCHEMA_VERSION = "roaster.stack.run-index.v1"
_FRONTMATTER_FENCE = "---"

YamlMapping: TypeAlias = dict[str, Any]


class StackRunStorageError(ValueError):
    """A roaster stack run storage artifact is malformed or unsafe."""


@dataclass(frozen=True)
class StackRunLocator:
    """Branch Memory locator for one roaster stack run artifact."""

    namespace: str
    key: str
    branch: str


@dataclass(frozen=True)
class StackRunKeys:
    """Centralized Branch Memory keys for one roaster stack run lineage."""

    index_key: str
    manifest_key: str
    triage_key: str

    def resolver_key(self, *, batch_slug: str) -> str:
        """Return the resolver artifact key for one batch slug."""
        normalized_batch_slug = validate_batch_slug(batch_slug)
        run_prefix = self.manifest_key.removesuffix("/manifest.md")
        return f"{run_prefix}/batches/{normalized_batch_slug}/resolver.md"


@dataclass(frozen=True)
class StackRunIndexEntry:
    """One run listed in the persisted stack run index."""

    run_slug: str


@dataclass(frozen=True)
class StackRunIndex:
    """Persisted index for one implementation branch/profile lineage."""

    impl_branch_slug: str
    profile_slug: str
    runs: tuple[StackRunIndexEntry, ...]
    latest_run_slug: str | None = None
    schema_version: str = _INDEX_SCHEMA_VERSION


@dataclass(frozen=True)
class StackRunSelection:
    """Result of resolving resume, explicit, or new-run behavior."""

    run_slug: str
    index: StackRunIndex | None
    resumes_existing_run: bool


@dataclass(frozen=True)
class StackRunArtifactPlan:
    """Computed locators for a run without implying any writes."""

    index: StackRunLocator
    manifest: StackRunLocator
    triage: StackRunLocator

    def resolver(self, *, batch_slug: str) -> StackRunLocator:
        """Return the resolver artifact locator for one batch."""
        keys = stack_run_keys(
            impl_branch_slug=_impl_branch_slug_from_manifest_key(self.manifest.key),
            profile_slug=_profile_slug_from_manifest_key(self.manifest.key),
            run_slug=_run_slug_from_manifest_key(self.manifest.key),
        )
        return StackRunLocator(
            namespace=ROASTER_RUNS_NAMESPACE,
            key=keys.resolver_key(batch_slug=batch_slug),
            branch=self.manifest.branch,
        )


def stack_run_keys(*, impl_branch_slug: str, profile_slug: str, run_slug: str) -> StackRunKeys:
    """Return all canonical Branch Memory keys for a run."""
    normalized_impl_branch_slug = _validate_impl_branch_slug(impl_branch_slug)
    normalized_profile_slug = validate_profile_slug(profile_slug)
    normalized_run_slug = validate_run_slug(run_slug)
    run_prefix = (
        f"runs/{normalized_impl_branch_slug}/{normalized_profile_slug}/{normalized_run_slug}"
    )
    return StackRunKeys(
        index_key=f"indexes/{normalized_impl_branch_slug}/{normalized_profile_slug}.md",
        manifest_key=f"{run_prefix}/manifest.md",
        triage_key=f"{run_prefix}/triage.md",
    )


def stack_run_artifact_plan(
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
) -> StackRunArtifactPlan:
    """Compute Branch Memory locators for a run without writing anything."""
    normalized_impl_branch = _validate_impl_branch(impl_branch)
    keys = stack_run_keys(
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
    )
    return StackRunArtifactPlan(
        index=StackRunLocator(
            namespace=ROASTER_RUNS_NAMESPACE,
            key=keys.index_key,
            branch=normalized_impl_branch,
        ),
        manifest=StackRunLocator(
            namespace=ROASTER_RUNS_NAMESPACE,
            key=keys.manifest_key,
            branch=normalized_impl_branch,
        ),
        triage=StackRunLocator(
            namespace=ROASTER_RUNS_NAMESPACE,
            key=keys.triage_key,
            branch=normalized_impl_branch,
        ),
    )


def resolver_locator(
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
    batch_slug: str,
) -> StackRunLocator:
    """Compute the Branch Memory locator for one resolver artifact."""
    normalized_impl_branch = _validate_impl_branch(impl_branch)
    key = stack_run_keys(
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
    ).resolver_key(batch_slug=batch_slug)
    return StackRunLocator(namespace=ROASTER_RUNS_NAMESPACE, key=key, branch=normalized_impl_branch)


def read_stack_run_index(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
) -> StackRunIndex | None:
    """Read the persisted run index for an implementation branch/profile."""
    locator = _index_locator(
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
    )
    content = gateway.get(locator.namespace, locator.key, locator.branch)
    if content is None:
        return None
    return parse_stack_run_index(content)


def write_stack_run_index(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    index: StackRunIndex,
    dry_run: bool = False,
) -> StackRunLocator:
    """Persist a run index unless ``dry_run`` is set; always return its locator."""
    normalized_index = validate_stack_run_index(index)
    locator = _index_locator(
        impl_branch=impl_branch,
        impl_branch_slug=normalized_index.impl_branch_slug,
        profile_slug=normalized_index.profile_slug,
    )
    if not dry_run:
        gateway.put(
            locator.namespace,
            locator.key,
            locator.branch,
            render_stack_run_index(normalized_index),
        )
    return locator


def read_stack_run_manifest(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
) -> StackRunManifest | None:
    """Read a persisted run manifest."""
    locator = stack_run_artifact_plan(
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
    ).manifest
    content = gateway.get(locator.namespace, locator.key, locator.branch)
    if content is None:
        return None
    return parse_stack_run_manifest(content)


def write_stack_run_manifest(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    manifest: StackRunManifest,
    dry_run: bool = False,
) -> StackRunLocator:
    """Persist a run manifest unless ``dry_run`` is set; always return its locator."""
    normalized_manifest = validate_stack_run_manifest(manifest)
    locator = stack_run_artifact_plan(
        impl_branch=impl_branch,
        impl_branch_slug=normalized_manifest.impl_branch_slug,
        profile_slug=normalized_manifest.profile_slug,
        run_slug=normalized_manifest.run_slug,
    ).manifest
    if not dry_run:
        gateway.put(
            locator.namespace,
            locator.key,
            locator.branch,
            render_stack_run_manifest(normalized_manifest),
        )
    return locator


def read_stack_run_triage(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
) -> str | None:
    """Read raw triage markdown for a run."""
    locator = stack_run_artifact_plan(
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
    ).triage
    return gateway.get(locator.namespace, locator.key, locator.branch)


def write_stack_run_triage(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
    content: str,
    dry_run: bool = False,
) -> StackRunLocator:
    """Persist raw triage markdown unless ``dry_run`` is set; always return its locator."""
    locator = stack_run_artifact_plan(
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
    ).triage
    if not dry_run:
        gateway.put(locator.namespace, locator.key, locator.branch, content)
    return locator


def read_stack_run_resolver(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
    batch_slug: str,
) -> str | None:
    """Read raw resolver markdown for one batch."""
    locator = resolver_locator(
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
        batch_slug=batch_slug,
    )
    return gateway.get(locator.namespace, locator.key, locator.branch)


def write_stack_run_resolver(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
    batch_slug: str,
    content: str,
    dry_run: bool = False,
) -> StackRunLocator:
    """Persist raw resolver markdown unless ``dry_run`` is set; always return its locator."""
    locator = resolver_locator(
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
        batch_slug=batch_slug,
    )
    if not dry_run:
        gateway.put(locator.namespace, locator.key, locator.branch, content)
    return locator


def select_stack_run_slug(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug_stem: str,
    new_run: bool = False,
    run_slug: str | None = None,
) -> StackRunSelection:
    """Resolve resume/default, explicit ``run_slug``, or ``new_run`` ordinal behavior.

    This helper reads the index but never writes. Callers can use the returned
    slug to compute locators during dry-run planning or persist artifacts later.
    """
    normalized_stem = validate_run_slug(run_slug_stem)
    index = read_stack_run_index(
        gateway,
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
    )
    existing_run_slugs = _index_run_slugs(index)

    if run_slug is not None:
        normalized_run_slug = validate_run_slug(run_slug)
        return StackRunSelection(
            run_slug=normalized_run_slug,
            index=index,
            resumes_existing_run=normalized_run_slug in existing_run_slugs,
        )

    if not new_run and index is not None and index.latest_run_slug is not None:
        return StackRunSelection(
            run_slug=index.latest_run_slug,
            index=index,
            resumes_existing_run=True,
        )

    return StackRunSelection(
        run_slug=_next_ordinal_run_slug(normalized_stem, existing_run_slugs),
        index=index,
        resumes_existing_run=False,
    )


def add_run_to_index(
    index: StackRunIndex | None,
    *,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
) -> StackRunIndex:
    """Return an index with ``run_slug`` as the latest run, preserving prior order."""
    normalized_impl_branch_slug = _validate_impl_branch_slug(impl_branch_slug)
    normalized_profile_slug = validate_profile_slug(profile_slug)
    normalized_run_slug = validate_run_slug(run_slug)

    if index is None:
        return StackRunIndex(
            impl_branch_slug=normalized_impl_branch_slug,
            profile_slug=normalized_profile_slug,
            runs=(StackRunIndexEntry(run_slug=normalized_run_slug),),
            latest_run_slug=normalized_run_slug,
        )

    normalized_index = validate_stack_run_index(index)
    if normalized_index.impl_branch_slug != normalized_impl_branch_slug:
        raise StackRunStorageError(
            "run index implementation branch slug does not match requested storage scope."
        )
    if normalized_index.profile_slug != normalized_profile_slug:
        raise StackRunStorageError("run index profile slug does not match requested storage scope.")

    runs = list(normalized_index.runs)
    if normalized_run_slug not in {entry.run_slug for entry in runs}:
        runs.append(StackRunIndexEntry(run_slug=normalized_run_slug))
    return StackRunIndex(
        impl_branch_slug=normalized_impl_branch_slug,
        profile_slug=normalized_profile_slug,
        runs=tuple(runs),
        latest_run_slug=normalized_run_slug,
    )


def validate_stack_run_index(index: StackRunIndex) -> StackRunIndex:
    """Validate a stack run index and return a normalized copy."""
    if index.schema_version != _INDEX_SCHEMA_VERSION:
        raise StackRunStorageError(
            f"unsupported stack run index schema_version {index.schema_version!r}."
        )
    impl_branch_slug = _validate_impl_branch_slug(index.impl_branch_slug)
    profile_slug = validate_profile_slug(index.profile_slug)
    runs = tuple(
        StackRunIndexEntry(run_slug=validate_run_slug(entry.run_slug)) for entry in index.runs
    )
    latest_run_slug = None
    if index.latest_run_slug is not None:
        latest_run_slug = validate_run_slug(index.latest_run_slug)
        if latest_run_slug not in {entry.run_slug for entry in runs}:
            raise StackRunStorageError("stack run index latest_run_slug is not listed in runs.")
    return StackRunIndex(
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        runs=runs,
        latest_run_slug=latest_run_slug,
    )


def validate_stack_run_manifest(manifest: StackRunManifest) -> StackRunManifest:
    """Validate a stack run manifest and return a normalized copy."""
    if manifest.schema_version != "roaster.stack.run-manifest.v1":
        raise StackRunStorageError(
            f"unsupported stack run manifest schema_version {manifest.schema_version!r}."
        )
    impl_branch_slug = _validate_impl_branch_slug(manifest.impl_branch_slug)
    profile_slug = validate_profile_slug(manifest.profile_slug)
    run_slug = validate_run_slug(manifest.run_slug)
    batch_slugs = tuple(validate_batch_slug(batch_slug) for batch_slug in manifest.batch_slugs)
    return StackRunManifest(
        profile_slug=profile_slug,
        run_slug=run_slug,
        impl_branch_slug=impl_branch_slug,
        base_ref=manifest.base_ref,
        target_branch=manifest.target_branch,
        target_pr=manifest.target_pr,
        batch_slugs=batch_slugs,
        generated_branches=manifest.generated_branches,
        markers=manifest.markers,
        batch_states=_validate_manifest_batch_states(manifest.batch_states),
        dashboard_publication=_validate_dashboard_publication(manifest.dashboard_publication),
        submission=_validate_submission(manifest.submission),
    )


def _validate_manifest_batch_states(
    batch_states: tuple[StackRunBatchState, ...],
) -> tuple[StackRunBatchState, ...]:
    normalized_states: list[StackRunBatchState] = []
    for state in batch_states:
        normalized_states.append(
            StackRunBatchState(
                batch_slug=validate_batch_slug(state.batch_slug),
                title=state.title,
                status=state.status,
                generated_branch=state.generated_branch,
                generated_branch_status=state.generated_branch_status,
                resolver_locator=_validate_artifact_locator(state.resolver_locator),
                resolver_status=state.resolver_status,
                summary=state.summary,
                validation_summary=state.validation_summary,
                failure=_validate_failure_context(state.failure),
            )
        )
    return tuple(normalized_states)


def _validate_dashboard_publication(
    publication: StackRunDashboardPublication | None,
) -> StackRunDashboardPublication | None:
    if publication is None:
        return None
    return StackRunDashboardPublication(
        marker=_validate_nonempty_string(publication.marker, label="dashboard marker"),
        target_pr=_validate_nonempty_string(publication.target_pr, label="dashboard target PR"),
        action=publication.action,
        comment_id=publication.comment_id,
        comment_url=publication.comment_url,
    )


def _validate_submission(submission: StackRunSubmission) -> StackRunSubmission:
    return StackRunSubmission(
        status=submission.status,
        failure=_validate_failure_context(submission.failure),
    )


def _validate_artifact_locator(
    locator: StackRunArtifactLocator | None,
) -> StackRunArtifactLocator | None:
    if locator is None:
        return None
    return StackRunArtifactLocator(
        namespace=_validate_nonempty_string(locator.namespace, label="artifact namespace"),
        key=_validate_nonempty_string(locator.key, label="artifact key"),
        branch=_validate_impl_branch(locator.branch),
    )


def _validate_failure_context(
    failure: StackRunFailureContext | None,
) -> StackRunFailureContext | None:
    if failure is None:
        return None
    return StackRunFailureContext(
        error_type=_validate_nonempty_string(failure.error_type, label="failure error_type"),
        message=_validate_nonempty_string(failure.message, label="failure message"),
    )


def _validate_nonempty_string(value: str, *, label: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise StackRunStorageError(f"stack run manifest {label} must be a non-empty string.")
    return normalized


def render_stack_run_index(index: StackRunIndex) -> str:
    """Render a deterministic markdown index with YAML frontmatter."""
    normalized_index = validate_stack_run_index(index)
    frontmatter = {
        "schema_version": normalized_index.schema_version,
        "impl_branch_slug": normalized_index.impl_branch_slug,
        "profile_slug": normalized_index.profile_slug,
        "latest_run_slug": normalized_index.latest_run_slug,
        "runs": [{"run_slug": entry.run_slug} for entry in normalized_index.runs],
    }
    return _render_markdown(frontmatter, body="# Roaster stack run index\n")


def parse_stack_run_index(source: str) -> StackRunIndex:
    """Parse a persisted stack run index markdown document."""
    frontmatter = _parse_markdown_frontmatter(source, artifact_name="stack run index")
    _require_schema(
        frontmatter,
        schema_version=_INDEX_SCHEMA_VERSION,
        artifact_name="stack run index",
    )
    impl_branch_slug = _required_string(
        frontmatter,
        "impl_branch_slug",
        artifact_name="stack run index",
    )
    profile_slug = _required_string(frontmatter, "profile_slug", artifact_name="stack run index")
    latest_run_slug = _optional_string(
        frontmatter,
        "latest_run_slug",
        artifact_name="stack run index",
    )
    raw_runs = frontmatter.get("runs")
    if not isinstance(raw_runs, list):
        raise StackRunStorageError("stack run index field `runs` must be a list.")
    runs: list[StackRunIndexEntry] = []
    for index, raw_run in enumerate(raw_runs):
        if not isinstance(raw_run, dict):
            raise StackRunStorageError(f"stack run index runs item {index} must be an object.")
        run_slug = _required_string(
            cast(YamlMapping, raw_run),
            "run_slug",
            artifact_name=f"stack run index runs item {index}",
        )
        runs.append(StackRunIndexEntry(run_slug=run_slug))
    return validate_stack_run_index(
        StackRunIndex(
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile_slug,
            runs=tuple(runs),
            latest_run_slug=latest_run_slug,
        )
    )


def render_stack_run_manifest(manifest: StackRunManifest) -> str:
    """Render a deterministic markdown manifest with YAML frontmatter."""
    normalized_manifest = validate_stack_run_manifest(manifest)
    frontmatter = normalized_manifest.model_dump(mode="json")
    return _render_markdown(frontmatter, body="# Roaster stack run manifest\n")


def parse_stack_run_manifest(source: str) -> StackRunManifest:
    """Parse a persisted stack run manifest markdown document."""
    frontmatter = _parse_markdown_frontmatter(source, artifact_name="stack run manifest")
    _require_schema(
        frontmatter,
        schema_version="roaster.stack.run-manifest.v1",
        artifact_name="stack run manifest",
    )
    manifest = StackRunManifest.model_validate(frontmatter)
    return validate_stack_run_manifest(manifest)


def _index_locator(
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
) -> StackRunLocator:
    normalized_impl_branch = _validate_impl_branch(impl_branch)
    index_key = stack_run_keys(
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug="placeholder-run",
    ).index_key
    return StackRunLocator(
        namespace=ROASTER_RUNS_NAMESPACE,
        key=index_key,
        branch=normalized_impl_branch,
    )


def _render_markdown(frontmatter: YamlMapping, *, body: str) -> str:
    yaml_text = yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True).strip()
    return f"{_FRONTMATTER_FENCE}\n{yaml_text}\n{_FRONTMATTER_FENCE}\n\n{body}"


def _parse_markdown_frontmatter(source: str, *, artifact_name: str) -> YamlMapping:
    lines = source.splitlines(keepends=True)
    first_content_index = next((index for index, line in enumerate(lines) if line.strip()), None)
    if first_content_index is None:
        raise StackRunStorageError(f"{artifact_name} is empty.")
    if lines[first_content_index].strip() != _FRONTMATTER_FENCE:
        raise StackRunStorageError(f"{artifact_name} must begin with YAML frontmatter.")

    closing_index: int | None = None
    for index in range(first_content_index + 1, len(lines)):
        if lines[index].strip() == _FRONTMATTER_FENCE:
            closing_index = index
            break
    if closing_index is None:
        raise StackRunStorageError(f"{artifact_name} frontmatter is missing closing fence.")

    frontmatter_text = "".join(lines[first_content_index + 1 : closing_index])
    try:
        parsed = yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as exc:
        raise StackRunStorageError(f"{artifact_name} frontmatter is not valid YAML: {exc}") from exc
    if not isinstance(parsed, dict):
        raise StackRunStorageError(f"{artifact_name} frontmatter must be a YAML mapping.")
    return cast(YamlMapping, parsed)


def _require_schema(frontmatter: YamlMapping, *, schema_version: str, artifact_name: str) -> None:
    actual = _required_string(frontmatter, "schema_version", artifact_name=artifact_name)
    if actual != schema_version:
        raise StackRunStorageError(
            f"{artifact_name} has unsupported schema_version {actual!r}; "
            f"expected {schema_version!r}."
        )


def _required_string(frontmatter: YamlMapping, field: str, *, artifact_name: str) -> str:
    if field not in frontmatter:
        raise StackRunStorageError(f"{artifact_name} missing required field `{field}`.")
    value = frontmatter[field]
    if not isinstance(value, str) or not value.strip():
        raise StackRunStorageError(f"{artifact_name} field `{field}` must be a non-empty string.")
    return value.strip()


def _optional_string(frontmatter: YamlMapping, field: str, *, artifact_name: str) -> str | None:
    if field not in frontmatter or frontmatter[field] is None:
        return None
    value = frontmatter[field]
    if not isinstance(value, str) or not value.strip():
        raise StackRunStorageError(
            f"{artifact_name} field `{field}` must be a non-empty string or null."
        )
    return value.strip()


def _validate_impl_branch(branch: str) -> str:
    try:
        return validate_branch_memory_branch_name(branch)
    except StackSlugError as exc:
        raise StackRunStorageError(str(exc)) from exc


def _validate_impl_branch_slug(slug: str) -> str:
    try:
        return validate_branch_memory_segment(slug, label="implementation branch slug")
    except StackSlugError as exc:
        raise StackRunStorageError(str(exc)) from exc


def _index_run_slugs(index: StackRunIndex | None) -> frozenset[str]:
    if index is None:
        return frozenset()
    return frozenset(entry.run_slug for entry in index.runs)


def _next_ordinal_run_slug(stem: str, existing_run_slugs: frozenset[str]) -> str:
    if stem not in existing_run_slugs:
        return stem
    ordinal = 2
    while f"{stem}-{ordinal}" in existing_run_slugs:
        ordinal += 1
    return f"{stem}-{ordinal}"


def _impl_branch_slug_from_manifest_key(key: str) -> str:
    return _manifest_key_part(key, index=1, label="implementation branch slug")


def _profile_slug_from_manifest_key(key: str) -> str:
    return _manifest_key_part(key, index=2, label="profile slug")


def _run_slug_from_manifest_key(key: str) -> str:
    return _manifest_key_part(key, index=3, label="run slug")


def _manifest_key_part(key: str, *, index: int, label: str) -> str:
    parts = key.split("/")
    expected_length = 5
    if len(parts) != expected_length or parts[0] != "runs" or parts[4] != "manifest.md":
        raise StackRunStorageError(f"cannot derive {label} from non-manifest key {key!r}.")
    return parts[index]
