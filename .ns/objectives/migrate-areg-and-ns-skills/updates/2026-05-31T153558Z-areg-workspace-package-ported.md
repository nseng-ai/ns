# Areg Workspace Package Ported

## Summary

The standalone `areg` package has been ported into this workspace as `packages/areg` while preserving the standalone `areg` CLI surface. The branch adds package metadata, source, templates, README/license, unit/scenario/integration/gateway tests, root workspace wiring, root lint/test configuration, and lockfile changes that replace the registry `nonslop` dev dependency with the workspace `areg` package.

The package-local default skill source is now `dagster-io/asdl-tools`: `areg.skillx` defaults, generated-project templates, README examples, and ported tests no longer use `nseng-ai/nonslop` or `uvx nonslop`. The root `nonslop-check` recipe was renamed to `areg-check`; the broader skill-promotion/reference rewrite remains separate Objective work.

Evidence: local branch diff against Graphite parent `migrate-areg-ns/finalize-capability-dispositions`; PR #753 corroborates the same file set. Verification during implementation included `uv run pytest packages/areg/tests -q`, targeted ruff check/format, `uv run ty check`, `uv run areg exec skillx parse "dagster-io/asdl-tools --skill ns-pytest"`, `just areg-check`, and full `just`.

## Objective Impact

The `Port areg as a standalone workspace package` roadmap row is complete. Completion criteria covering `packages/areg`, root workspace metadata, removal of the root `nonslop` dev dependency, and fake-gateway coverage for the `areg` commands are now evidenced.

The `Repoint distribution and command references` row is partially complete for the `areg` package and root `areg-check` recipe, but remains open for promoted skill prose, `skills-lock.json`, repo docs, and the stale root `refresh-nonslop` recipe.

## Follow-Ups

- Promote the exact 21-skill `ns-*` catalog to first-party local `skills/<name>/` directories, reconciling the known differing copies first.
- Finish rewriting `ns-install`, `ns-skill-management`, `ns-skillx`, `nsx`, repo docs, lockfile entries, and stale root just recipes away from `nonslop` / `nseng-ai/nonslop` / `uvx nonslop`.
- After skill promotion and reference rewrites, record deletion-readiness evidence with package/skill checks and targeted stale-reference searches.
