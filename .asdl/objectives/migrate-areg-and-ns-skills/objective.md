# Migrate areg and ns Skills into asdl-tools

## Thesis

`/Users/schrockn/code/nonslop` should stop being a separate code, skill, and distribution source. This Objective migrates every useful capability in that checkout—not only the `areg` package and `ns-*` skills—so the nonslop repository and project can be deleted afterward without leaving this repo dependent on `nonslop`, `nseng-ai/nonslop`, or a local checkout.

The known primary capabilities are the standalone `areg` CLI/package and the exact 21-skill `ns-*` catalog, but the first migration slice must catalog all nonslop capabilities before assigning dispositions. That inventory includes source code, skills, tests, docs, scripts, CI/workflow configuration, package/release configuration, agent configuration, local development integrations, lockfiles, generated templates, and any checkout-local symlinked capabilities that are not part of the tracked first-party catalog.

The target shape is intentionally private/in-development: preserve useful behavior, not backward compatibility. `areg` remains a standalone workspace package and CLI in this monorepo, while the `ns-*` catalog becomes first-party local skill content in this repo. Existing installed copies in `asdl-tools` must be reconciled with the nonslop source before promotion rather than blindly overwritten.

Local evidence gathered at Objective creation:

- `nonslop` currently packages `areg` (`create-project`, `check`, `update-skills`, generic hidden skill fetch/list/cleanup helpers, and a now-deleted default-source shortcut) and source lives under `/Users/schrockn/code/nonslop/src/areg` with unit, scenario, integration, and gateway tests.
- `nonslop/skills` originally contained 21 prefixed local skills. The retained promoted catalog now has 19 flat semantic names: `changelog-update`, `create-bun-typescript-project`, `create-python-dev-cli`, `create-python-package`, `dignified-python`, `python-fake-driven-test-layout`, `python-fake-driven-testing`, `pytest`, `cli-push-down`, `refactor-swarm`, `resolve-merge-conflicts`, `setup-dprint`, `setup-dprint-gh-ci`, `setup-pypi-publish`, `setup-python-gh-ci`, `setup-graphite`, `skill-audit`, `skill-management`, and `skillx`; two distribution-boundary shortcuts are intentionally deleted.
- `asdl-tools` already vendors many `ns-*` skills under `.agents/skills` from `nseng-ai/nonslop`, has `nonslop` in the root dev dependency group, and references nonslop in `justfile`, `skills-lock.json`, `docs/agent-resource-catalog.md`, and skill-management tests.
- The current replacement GitHub source for migrated skill install/fetch instructions is `dagster-io/asdl-tools`.
- A bounded source-tree inventory of `/Users/schrockn/code/nonslop` found additional non-`areg` capabilities that must be cataloged: GitHub Actions workflows (`python-ci`, `ns-ci`) and the `setup-python-uv` action; root development/release recipes (`justfile`, `pyproject.toml`, `dprint.json`, `.gitignore`, `uv.lock`); skill-authoring standards in `docs/skill-standards.md`; upstream sync/cleanup scripts for `dignified-python`; agent/tool configuration under `.codex` and `.claude`; `local.just` twerk-development linkage; checkout-local `.agents`/`.claude` symlinks to twerk skills; and an empty/skeletal `packages/nonslop-dev` directory tree.

## Scope

- Catalog every capability in `/Users/schrockn/code/nonslop` before moving files, including tracked source, tests, skills, docs, scripts, CI/workflows/actions, packaging/release/dev recipes, generated templates, agent configuration, lockfiles, local-only symlinked skills, local dev integrations, and empty or skeletal package directories. Assign each item an explicit disposition: migrate, rewrite, fold into an existing asdl-tools capability, retire, or ignore as cache/build output/local-only state.
- Add `areg` as a standalone workspace package in `asdl-tools`, preserving the package/module/CLI identity rather than mounting it into the top-level `asdl` CLI initially.
- Port `areg` source, templates, and tests from nonslop into the monorepo structure, adapting package metadata, workspace wiring, and test configuration to this repo's conventions.
- Preserve `areg` capabilities: project scaffolding, skill-layout checks, curated lockfile-based skill updates, and generic hidden `exec skillx` helpers for agent-facing skill fetch/list/cleanup mechanics.
- Repoint generated-project skill installation from `nseng-ai/nonslop` to `dagster-io/asdl-tools`, with only `skill-management` and `skillx` installed by default.
- Promote and unprefix the retained catalog into this repo as first-party local skills under `skills/<name>/`, with `.agents/skills/<name>` and `.claude/skills/<name>` following this repo's local-skill symlink conventions; delete the old distribution-boundary shortcut skills instead of preserving compatibility aliases.
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

- A nonslop capability catalog exists before implementation finishes and covers every non-cache source/config/documentation/development artifact in `/Users/schrockn/code/nonslop`, with explicit dispositions for both tracked files and relevant checkout-local symlinked capabilities.
- `packages/areg` exists as a workspace package with the `areg` script, module source, templates, package metadata, and tests ported from nonslop and adapted to this repo.
- Root workspace metadata includes `areg` and removes the dev dependency on `nonslop`; repo checks exercise the ported package in the normal workspace flow.
- `areg create-project`, `areg check`, `areg update-skills`, and `areg exec skillx ...` work in scenario tests with fake gateways and no dependency on the old nonslop package or repo.
- The generated-project default skill source is `dagster-io/asdl-tools`, and generated projects install only `skill-management` and `skillx` by default.
- The retained promoted skills from nonslop exist as first-party local skills under flat semantic names in `skills/<name>/`, with `.agents/skills/<name>` symlinks to `../../skills/<name>` and `.claude/skills/<name>` symlinks to `../../.agents/skills/<name>`.
- Existing asdl-tools copies of overlapping prefixed skills have been compared with nonslop copies; any intentional content choice is reflected in the migrated local skill files rather than hidden in a temp diff.
- `skills-lock.json` records the retained promoted skills as local sources (`skills/<name>`) instead of GitHub sources from `nseng-ai/nonslop`, and the deleted shortcuts have no lockfile entries.
- `justfile`, repo docs, generated templates, public skill prose, and tests no longer contain stale actionable references to `nonslop`, `uvx nonslop`, or `nseng-ai/nonslop`, except in historical notes that explicitly say the old repo was retired.
- Missing nonslop-only retained skills (`create-bun-typescript-project`, `setup-dprint-gh-ci`, `setup-pypi-publish`, `setup-python-gh-ci`, `setup-graphite`) are present as local first-party skills, and the deleted shortcut skills have explicit documented dispositions.
- Deletion-readiness evidence is recorded: a grep/search of the migrated repo shows no live dependency path to the old nonslop checkout/repo, and targeted package/skill checks pass.

## Assumptions and Risks

Assumptions:

- `areg` is the package identity to preserve. The old repo name `nonslop` is distribution history, not a compatibility constraint.
- `dagster-io/asdl-tools` is the correct replacement GitHub source for generated-project skill installation and generic transient skill fetch examples.
- The promoted catalog should use flat semantic skill names, not preserve the old organization-prefixed names or distribution-boundary shortcuts.
- Some nonslop checkout capabilities may be intentionally retired or ignored rather than migrated, but they must still be cataloged with a rationale before deletion readiness is claimed.
- Reconciliation can be done from local checkouts: `/Users/schrockn/code/nonslop` as the retiring source and this repo's existing `.agents/skills/ns-*` copies as potentially newer local edits.
- The existing asdl-tools local-skill convention is the right destination: canonical content in `skills/<name>/`, universal agent discovery via `.agents/skills/<name>` symlink, and Claude discovery via `.claude/skills/<name>` symlink.

Risks:

- A blind copy from nonslop could lose edits already made in asdl-tools vendored skill copies. Status: de-risked by starting from the asdl-tools copies for overlapping skills, adopting nonslop's more general `subprocess.run(check=False)` guidance for `dignified-python`, and adopting nonslop's optional conformance layer for `python-fake-driven-testing` while updating the layout skill to match.
- Some nonslop skills were wrappers around the old distribution boundary. Status: de-risked by deleting the obsolete shortcuts and keeping generic `skillx` on `areg` / `dagster-io/asdl-tools`.
- `setup-python-gh-ci` and the existing `ns-setup-python-ci` may represent a naming/content duplicate. Status: resolved by preserving the exact nonslop catalog name `setup-python-gh-ci` and retiring the asdl-only `ns-setup-python-ci` lockfile/discovery entry.
- Porting `areg` tests could have exposed repo-style differences: this repo uses workspace packages, Clinkr conventions in several packages, empty `__init__.py` re-export rules, and fake-driven testing expectations. Status: de-risked for the standalone `areg` package slice by adapting it as a workspace package without mounting it as an `asdl` plugin, preserving empty `__init__.py` files, keeping gateway/fake tests, and passing targeted package checks plus full `just`.
- `npx skills` behavior around update/install has known quirks that `areg update-skills` works around. Status: de-risked by keeping the workaround covered by scenario tests and updating skill-management docs to reference `areg update-skills`.
- Deletion readiness may miss hidden references in generated artifacts or docs. Status: de-risked for the migrated repo by a live-reference search excluding Objective history and cache/build output; no live dependency path to the old checkout/repo remained.
- The initial migration framing could over-focus on `areg` and the `ns-*` catalog, missing nonslop's CI setup, release/dev recipes, skill standards, sync scripts, agent configuration, or checkout-local linked skills. Mitigation: the first roadmap row is now an all-capabilities audit over the whole nonslop checkout, with caches/build output/virtualenvs explicitly excluded rather than silently ignored.

## Open Questions

- Resolved: the existing asdl-only `ns-setup-python-ci` skill was retired after `setup-python-gh-ci` landed under the exact nonslop catalog name.
- Should `areg` eventually mount under the top-level `asdl` CLI after the migration proves stable? Initial decision: no; standalone only.
- Deletion readiness is now proven for this repo, but the old nonslop GitHub repository deletion/archive/redirect remains a future explicit destructive decision outside this Objective.
