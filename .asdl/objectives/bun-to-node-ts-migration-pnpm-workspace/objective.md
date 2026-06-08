# Bun-to-Node TypeScript Migration: pnpm Workspace

## Thesis

The Bun-to-Node TypeScript migration needs a concrete package-manager implementation slice that replaces active Bun install, lockfile, and script-running assumptions with pnpm while preserving the tooling contract already settled by the parent Objective family.

This child Objective owns the pnpm migration for the repository's TypeScript package-manager surfaces: `ts/` as a pnpm workspace for `packages/*`, `docs-site/` as a standalone pnpm-managed docs surface, and root-level orchestration that delegates into those surfaces without becoming a TypeScript workspace itself.

## Scope

This Objective covers the pnpm workspace/package-manager migration work needed before test-runner, runtime-compatibility, and broader Bun-reference cleanup can proceed confidently:

- convert the TypeScript workspace under `ts/` from Bun-managed package metadata and lockfiles to pnpm-managed workspace metadata and lockfiles;
- represent the `ts/packages/*` workspace through pnpm while preserving source-link behavior needed by Node v24.12+ native TypeScript type stripping;
- preserve the current patched Pi dependency through pnpm-native patch metadata until downstream evidence proves the patch can be removed;
- migrate root orchestration commands, `justfile` targets, package scripts, and agent-facing command examples that actively invoke Bun for this TypeScript workspace slice;
- migrate `docs-site/` install/build/deploy package-manager commands to pnpm while keeping it a standalone surface rather than folding it into the `ts/` workspace;
- document the resulting pnpm workflow and Node v24.12+ baseline where users or agents need to run the migrated commands;
- record dependency-resolution differences, patch handling decisions, and any surfaced constraints for downstream child Objectives.

## Non-Goals

- Do not convert `bun:test` tests to Vitest in this Objective except for command references that must defer to the Vitest child Objective.
- Do not harden every TypeScript CLI or Pi extension module under Node beyond package-manager changes needed to keep entry points runnable.
- Do not replace the Graphite metadata sqlite reader or decide new `node:sqlite` implementation details.
- Do not reconcile every historical or template-level Bun reference; broad prose/template cleanup belongs to the Bun-reference reconciliation child Objective.
- Do not migrate Python package management, Python test tooling, or repository-wide non-TypeScript workflows.
- Do not turn the repository root into a monolithic pnpm workspace unless implementation evidence invalidates the settled separate-surface contract.

## Completion Criteria

This Objective is complete when:

- `ts/` has pnpm-native workspace metadata, package-manager metadata, lockfile state, and Node v24.12+ engine guidance consistent with the settled tooling contract;
- `ts/packages/*` package scripts and dependency relationships run through pnpm without relying on Bun lock/install/run behavior;
- the current Pi dependency patch is either preserved through pnpm patch metadata or removed only with explicit evidence that it is no longer needed;
- root orchestration and `justfile` targets that exercise the TypeScript workspace call directory-scoped pnpm commands rather than Bun commands;
- `docs-site/` uses pnpm for install/build/deploy commands while remaining a standalone package-manager surface;
- user-facing or agent-facing docs that explain active TypeScript workspace and docs-site commands match the migrated pnpm workflow;
- dependency-resolution, patch-handling, and representative command evidence is recorded through Objective updates for downstream migration work.

## Assumptions and Risks

Assumptions:

- Node v24.12+ remains the baseline for TypeScript tooling and project-local runtime compatibility.
- The settled package-manager contract remains valid: `ts/` is a pnpm workspace, `docs-site/` is a standalone pnpm surface, and the repository root stays orchestration-only.
- pnpm workspace source links will preserve the source layout needed for Node native TypeScript type stripping and will not force built artifacts for local package consumption.
- The current patched Pi dependency should be carried forward into pnpm-native patch metadata until representative Pi extension coverage proves the patch can be retired.
- Vitest migration will happen separately, so this Objective may leave test implementation imports and runner semantics untouched while changing package-manager command surfaces where necessary.

Risks:

- pnpm dependency resolution may expose version or peer-dependency differences that were hidden by Bun's installer; these should be recorded as migration findings rather than silently papered over.
- pnpm patch representation may not map mechanically from the current Bun patch state; losing the patch could break project-local Pi extension behavior.
- Root orchestration may accidentally imply a repository-wide pnpm workspace; keep commands directory-scoped unless evidence justifies changing the contract.
- Docs-site deployment configuration may have Vercel or Astro constraints separate from local package-manager commands.
- Changing package-manager scripts before Vitest migration may create awkward transitional commands; defer runner-semantics changes to the Vitest Objective when possible and document any intentional temporary state.

## Open Questions

- What exact pnpm patch metadata should represent the current Pi dependency patch, and what evidence would allow its later removal?
- Which Bun command references are active package-manager workflow references owned here versus stale documentation/template references that should wait for Bun-reference reconciliation?
- Do docs-site deployment settings need separate host-side configuration changes beyond local `package.json` script and lockfile migration?
