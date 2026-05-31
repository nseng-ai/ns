# Migrate areg and ns Skills into asdl-tools

## Thesis

`/Users/schrockn/code/nonslop` should stop being a separate code, skill, and distribution source. Its useful capabilities are the standalone `areg` CLI/package and the exact 21-skill `ns-*` catalog. This Objective moves those capabilities into `asdl-tools` so the nonslop repository and project can be deleted afterward without leaving this repo dependent on `nonslop`, `nseng-ai/nonslop`, or a local checkout.

The target shape is intentionally private/in-development: preserve useful behavior, not backward compatibility. `areg` remains a standalone workspace package and CLI in this monorepo, while the `ns-*` catalog becomes first-party local skill content in this repo. Existing installed copies in `asdl-tools` must be reconciled with the nonslop source before promotion rather than blindly overwritten.

Local evidence gathered at Objective creation:

- `nonslop` currently packages `areg` (`create-project`, `check`, `update-skills`, and hidden `exec skillx/nsx` commands) and source lives under `/Users/schrockn/code/nonslop/src/areg` with unit, scenario, integration, and gateway tests.
- `nonslop/skills` contains 21 local `ns-*` skills: `ns-changelog-update`, `ns-create-bun-ts-project`, `ns-create-py-dev-cli`, `ns-create-pypackage-project`, `ns-dignified-python`, `ns-fake-driven-test-layout`, `ns-install`, `ns-py-fake-driven-testing`, `ns-pytest`, `ns-refac-cli-push-down`, `ns-refactor-swarm`, `ns-resolve-merge-conflicts`, `ns-setup-dprint`, `ns-setup-dprint-gh-ci`, `ns-setup-pypi-publish`, `ns-setup-python-gh-ci`, `ns-setup-repo-to-use-gt`, `ns-skill-audit`, `ns-skill-management`, `ns-skillx`, and `nsx`.
- `asdl-tools` already vendors many `ns-*` skills under `.agents/skills` from `nseng-ai/nonslop`, has `nonslop` in the root dev dependency group, and references nonslop in `justfile`, `skills-lock.json`, `docs/agent-resource-catalog.md`, and skill-management tests.
- The current replacement GitHub source for migrated skill install/fetch instructions is `dagster-io/asdl-tools`.

## Scope

- Add `areg` as a standalone workspace package in `asdl-tools`, preserving the package/module/CLI identity rather than mounting it into the top-level `asdl` CLI initially.
- Port `areg` source, templates, and tests from nonslop into the monorepo structure, adapting package metadata, workspace wiring, and test configuration to this repo's conventions.
- Preserve `areg` capabilities: project scaffolding, skill-layout checks, curated lockfile-based skill updates, and hidden `exec skillx/nsx` helpers for agent-facing skill fetch/list/cleanup mechanics.
- Repoint the default `nsx`/`ns-install`/generated-project skill source from `nseng-ai/nonslop` to `dagster-io/asdl-tools`.
- Promote the exact 21-skill `ns-*` catalog into this repo as first-party local skills under `skills/<name>/`, with `.agents/skills/<name>` and `.claude/skills/<name>` following this repo's local-skill symlink conventions.
- Reconcile existing asdl-tools vendored copies against nonslop copies before promotion, preserving the best/newest content where the same skill differs.
- Rewrite skill prose, templates, allowed-tools command examples, lockfile entries, just recipes, docs, and tests so no migrated path depends on `nonslop`, `uvx nonslop`, or `nseng-ai/nonslop`.
- Make `asdl-tools` deletion-ready for nonslop: after closure, a future explicit/manual deletion of the old local checkout and GitHub/project artifacts should not break normal development or skill invocation in this repo.

## Non-Goals

- Do not preserve compatibility for the old `nonslop` package name, the old `nseng-ai/nonslop` GitHub source, or `uvx nonslop` command examples.
- Do not rename `areg` into an asdl-native command group during this Objective. Standalone `areg` is the chosen product surface for the initial migration.
- Do not mount `areg` into the top-level `asdl` CLI unless a later explicit decision changes the surface.
- Do not delete `/Users/schrockn/code/nonslop`, delete the GitHub repository, or decommission external project artifacts as an automatic part of this Objective. The Objective owns readiness for deletion, not the destructive deletion itself.
- Do not create a new skill registry or hidden Objective metadata. The migrated skills should use the existing `skills/`, `.agents/skills/`, `.claude/skills/`, and `skills-lock.json` conventions.
- Do not turn routine validation into standalone roadmap work. Test and check results are completion evidence for semantic rows.

## Completion Criteria

- `packages/areg` exists as a workspace package with the `areg` script, module source, templates, package metadata, and tests ported from nonslop and adapted to this repo.
- Root workspace metadata includes `areg` and removes the dev dependency on `nonslop`; repo checks exercise the ported package in the normal workspace flow.
- `areg create-project`, `areg check`, `areg update-skills`, `areg exec skillx ...`, and `areg exec nsx ...` work in scenario tests with fake gateways and no dependency on the old nonslop package or repo.
- The default skill source used by `areg` and by the migrated `nsx`/`ns-install` skills is `dagster-io/asdl-tools`.
- All 21 `ns-*` skills from nonslop exist as first-party local skills under `skills/<name>/` in this repo, with `.agents/skills/<name>` symlinks to `../../skills/<name>` and `.claude/skills/<name>` symlinks to `../../.agents/skills/<name>`.
- Existing asdl-tools copies of overlapping `ns-*` skills have been compared with nonslop copies; any intentional content choice is reflected in the migrated local skill files rather than hidden in a temp diff.
- `skills-lock.json` records the migrated `ns-*` skills as local sources (`skills/<name>`) instead of GitHub sources from `nseng-ai/nonslop`.
- `justfile`, repo docs, generated templates, public skill prose, and tests no longer contain stale actionable references to `nonslop`, `uvx nonslop`, or `nseng-ai/nonslop`, except in historical notes that explicitly say the old repo was retired.
- Missing nonslop-only skills (`ns-create-bun-ts-project`, `ns-install`, `ns-setup-dprint-gh-ci`, `ns-setup-pypi-publish`, `ns-setup-python-gh-ci`, `ns-setup-repo-to-use-gt`) are either present as local first-party skills or have an explicit, documented same-name disposition if reconciliation reveals an exact duplicate or intentional fold.
- Deletion-readiness evidence is recorded: a grep/search of the migrated repo shows no live dependency path to the old nonslop checkout/repo, and targeted package/skill checks pass.

## Assumptions and Risks

Assumptions:

- `areg` is the package identity to preserve. The old repo name `nonslop` is distribution history, not a compatibility constraint.
- `dagster-io/asdl-tools` is the correct replacement GitHub source for `npx skills add ... --skill <ns-skill>` and for `areg`'s default `nsx` behavior.
- The exact 21 `ns-*` skill names should remain available after migration, even if some content needs rewrite away from nonslop-specific instructions.
- Reconciliation can be done from local checkouts: `/Users/schrockn/code/nonslop` as the retiring source and this repo's existing `.agents/skills/ns-*` copies as potentially newer local edits.
- The existing asdl-tools local-skill convention is the right destination: canonical content in `skills/<name>/`, universal agent discovery via `.agents/skills/<name>` symlink, and Claude discovery via `.claude/skills/<name>` symlink.

Risks:

- A blind copy from nonslop could lose edits already made in asdl-tools vendored skill copies. Mitigation: start with an inventory and file-level diff/disposition audit before promotion.
- Some nonslop skills are wrappers around the old distribution boundary (`ns-install`, `nsx`, `ns-skillx`) and may contain many stale command examples. Mitigation: keep the exact skill names but rewrite their source and allowed-tools examples to call `areg` and `dagster-io/asdl-tools`.
- `ns-setup-python-gh-ci` and the existing `ns-setup-python-ci` may represent a naming/content duplicate. Mitigation: preserve the exact nonslop catalog while recording an explicit disposition for the existing asdl-only name so both lockfile and discovery behavior are intentional.
- Porting `areg` tests may expose repo-style differences: this repo uses workspace packages, Clinkr conventions in several packages, empty `__init__.py` re-export rules, and fake-driven testing expectations. Mitigation: adapt only where needed for this repo's packaging and test layout, without expanding `areg` into an asdl plugin.
- `npx skills` behavior around update/install has known quirks that `areg update-skills` works around. Mitigation: keep the workaround covered by scenario tests and update skill-management docs to reference `areg update-skills` instead of `uvx nonslop update-skills`.
- Deletion readiness may miss hidden references in generated artifacts or docs. Mitigation: include targeted repo-wide searches excluding caches/dist/lock noise and make any intentional historical references explicit.

## Open Questions

- Should the existing asdl-only `ns-setup-python-ci` skill remain as an alias/local skill, be replaced by `ns-setup-python-gh-ci`, or be retired after the exact nonslop catalog lands?
- Should `areg` eventually mount under the top-level `asdl` CLI after the migration proves stable? Initial decision: no; standalone only.
- Should the old nonslop GitHub repository be deleted, archived, or redirected after deletion readiness is proven? This Objective does not perform that destructive step.
