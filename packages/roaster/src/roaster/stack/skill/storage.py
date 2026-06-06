"""Skill-first roaster stack run storage binding."""

from __future__ import annotations

from brmem.gateway import BranchMemoryGateway
from roaster.stack.common.run_models import StackRunManifest
from roaster.stack.common.run_storage import (
    StackRunArtifactPlan,
    StackRunIndex,
    StackRunLocator,
    StackRunStore,
)

SKILL_STACK_RUNS_NAMESPACE = "roaster-runs-skill"
SKILL_STACK_RUN_STORE = StackRunStore(SKILL_STACK_RUNS_NAMESPACE)


def stack_run_artifact_plan(
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
) -> StackRunArtifactPlan:
    """Compute Branch Memory locators for a skill-first run."""
    return SKILL_STACK_RUN_STORE.artifact_plan(
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
    )


def read_stack_run_index(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
) -> StackRunIndex | None:
    """Read the skill-first run index."""
    return SKILL_STACK_RUN_STORE.read_index(
        gateway,
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
    )


def write_stack_run_index(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    index: StackRunIndex,
    dry_run: bool = False,
) -> StackRunLocator:
    """Persist the skill-first run index."""
    return SKILL_STACK_RUN_STORE.write_index(
        gateway,
        impl_branch=impl_branch,
        index=index,
        dry_run=dry_run,
    )


def read_stack_run_manifest(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
) -> StackRunManifest | None:
    """Read a skill-first run manifest."""
    return SKILL_STACK_RUN_STORE.read_manifest(
        gateway,
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
    )


def write_stack_run_manifest(
    gateway: BranchMemoryGateway,
    *,
    impl_branch: str,
    manifest: StackRunManifest,
    dry_run: bool = False,
) -> StackRunLocator:
    """Persist a skill-first run manifest."""
    return SKILL_STACK_RUN_STORE.write_manifest(
        gateway,
        impl_branch=impl_branch,
        manifest=manifest,
        dry_run=dry_run,
    )


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
    """Persist skill-first triage markdown."""
    return SKILL_STACK_RUN_STORE.write_triage(
        gateway,
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
        content=content,
        dry_run=dry_run,
    )


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
    """Persist skill-first resolver markdown."""
    return SKILL_STACK_RUN_STORE.write_resolver(
        gateway,
        impl_branch=impl_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile_slug,
        run_slug=run_slug,
        batch_slug=batch_slug,
        content=content,
        dry_run=dry_run,
    )
