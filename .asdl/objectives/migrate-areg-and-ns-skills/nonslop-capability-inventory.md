# Nonslop Capability Inventory

Final disposition audit for `/Users/schrockn/code/nonslop`. This is a whole-repo capability catalog, not an `areg`-only list.

Discovery evidence used for this disposition pass:

- `git -C /Users/schrockn/code/nonslop ls-files` showed a clean tracked source tree with the `areg` package, tests, 21 first-party `ns-*` skills, symlink installs, docs, scripts, CI, agent config, and root package/development files.
- Bounded checkout inspection excluded `.git`, `.venv`, caches, `dist`, `__pycache__`, and empty local-state output while still recording checkout-visible local symlinks and skeletal directories.
- Existing asdl-tools `ns-*` copies were compared against nonslop: most overlapping skills are byte-identical, `ns-dignified-python` differs in three files, `ns-py-fake-driven-testing` differs in two files, six nonslop skills are missing from asdl-tools, and asdl-tools has an asdl-only `ns-setup-python-ci` that overlaps with nonslop's `ns-setup-python-gh-ci`.

Allowed final dispositions are `migrate`, `rewrite`, `fold`, `retire`, or `ignore`.

## Product and Package Surface

- `pyproject.toml` — Disposition: **rewrite** into `packages/areg/pyproject.toml`. Preserve project identity (`name = "areg"`), the `areg` console script, Click runtime dependency, and package build target, but adapt to the asdl-tools uv workspace, root lint/type/test configuration, and package-version conventions. Do not copy nonslop's standalone dev dependency group wholesale.
- `README.md` — Disposition: **rewrite** into `packages/areg/README.md` or package docs. Preserve the skills-ready project narrative, but replace `nseng-ai/nonslop` examples with `dagster-io/asdl-tools` and replace stale transient invocation examples with `areg exec skillx` / `areg exec nsx` guidance.
- `LICENSE` — Disposition: **migrate** with the package if needed for `areg` distribution metadata. asdl-tools has no root `LICENSE` today, so the implementation should either add a package-local `packages/areg/LICENSE` or make an explicit root-license decision before publishing `areg` from this monorepo.
- `uv.lock` — Disposition: **ignore** as source material. Do not port the nonslop lockfile; regenerate/update this repo's root `uv.lock` when `packages/areg` joins the workspace.
- `.gitignore` — Disposition: **fold** into this repo's root `.gitignore` only for missing, generally useful ignore patterns. Do not replace the existing root ignore file.
- `dprint.json` — Disposition: **fold** only if nonslop has Markdown/TOML formatting settings missing from this repo. This repo already has root dprint configuration, so no standalone nonslop config should survive.
- `justfile` — Disposition: **rewrite**. Move only selected recipe behavior into this repo's root `justfile`: replace `nonslop-check` with an `areg check` path after the package is ported, add `areg` to build/publish flows if desired, and delete `refresh-nonslop` / `nonslop_skills` after local skill promotion.

## `areg` Runtime Capabilities

- `src/areg/cli.py` — Disposition: **migrate** to `packages/areg/src/areg/cli.py`, keeping standalone `areg` as the product surface and not mounting it into the top-level `asdl` CLI.
- `src/areg/create_project.py` — Disposition: **rewrite** during migration. Preserve scaffolding behavior and default skill installation, but repoint the default skill source to `dagster-io/asdl-tools`, keep the installed defaults intentionally small (`ns-install`, `ns-skill-management`, `ns-skillx`, `nsx` unless changed in implementation), and update generated prose away from nonslop.
- `src/areg/_templates/AGENTS.md` — Disposition: **rewrite**. Preserve skills-ready project instructions and progressive skill loading rules, but use asdl-tools/source-neutral wording and the new `areg` install/update commands.
- `src/areg/_templates/CLAUDE.md` — Disposition: **rewrite** only where it names old sources; otherwise preserve the forwarding/project-instruction role.
- `src/areg/_templates/gitignore` — Disposition: **migrate** as generated-project template material.
- `src/areg/_templates/settings.local.json` — Disposition: **rewrite** as generated-project Claude settings. Keep only broadly appropriate permissions; do not inherit nonslop checkout-local allowances blindly.
- `src/areg/check/*` — Disposition: **migrate** as `areg check`. Preserve lockfile parsing, local/GitHub skill structure checks, orphan checks, AGENTS/CLAUDE pairing checks, and SKILL.md frontmatter validation. Adapt any path assumptions to this repo's local-skill convention (`skills/<name>` canonical, `.agents/skills/<name>` symlink, `.claude/skills/<name>` symlink).
- `src/areg/update_skills.py` — Disposition: **rewrite**. Preserve the curated lockfile-preserving update workaround, but docs/tests/defaults must describe `areg update-skills` rather than `uvx nonslop update-skills`, and the default source examples should be `dagster-io/asdl-tools`.
- `src/areg/skillx.py` — Disposition: **rewrite**. Preserve generic `exec skillx` parse/list/fetch/cleanup and hardcoded `exec nsx`, but change `_DEFAULT_SKILL_REPO` from `nseng-ai/nonslop` to `dagster-io/asdl-tools` and update CLI help/docstrings/tests accordingly.
- `src/areg/gateways/gh/*` — Disposition: **migrate**. Keep the GitHub CLI directory-listing gateway and fake gateway; adapt package paths and tests to `packages/areg`.
- `src/areg/gateways/npx_skills/*` — Disposition: **migrate**. Keep the `npx skills` gateway and fake invocation capture; adapt tests and generated lockfile expectations to local/asdl sources.
- `src/areg/preconditions.py` — Disposition: **migrate**. Keep tool precondition checks, but consider fake-driven injection if the port touches tests that currently patch module-level functions.
- `src/areg/context.py` — Disposition: **migrate**. Keep the gateway container as `areg` package infrastructure.

## `areg` Tests

- `tests/unit/test_areg.py` — Disposition: **rewrite** under `packages/areg/tests/unit/`; preserve package metadata checks and update workspace package expectations.
- `tests/unit/test_frontmatter.py` — Disposition: **migrate** under `packages/areg/tests/unit/`.
- `tests/unit/test_pairing.py` — Disposition: **migrate** under `packages/areg/tests/unit/`.
- `tests/unit/test_skillx.py` — Disposition: **rewrite** under `packages/areg/tests/unit/`; preserve parser/list/fetch/cleanup coverage while changing hardcoded nonslop URLs/default-repo expectations to `dagster-io/asdl-tools` where they are default-source tests. Generic parser tests may still use arbitrary `owner/repo` examples.
- `tests/scenario/test_create_project.py` — Disposition: **rewrite** under `packages/areg/tests/scenario/`; assert generated projects install from `dagster-io/asdl-tools`, include updated default skills, and write current templates.
- `tests/scenario/test_skillx_cli.py` — Disposition: **rewrite** under `packages/areg/tests/scenario/`; preserve `exec skillx` and `exec nsx` JSON behavior while updating default `nsx` repo expectations.
- `tests/scenario/test_update_skills.py` — Disposition: **rewrite** under `packages/areg/tests/scenario/`; preserve dry-run/filter/agent behavior while replacing `nseng-ai/nonslop` fixtures with `dagster-io/asdl-tools` where the test is about migrated defaults.
- `tests/scenario/test_cli_preconditions.py` — Disposition: **migrate** under `packages/areg/tests/scenario/`. If touched substantially, prefer gateway/fake injection over additional `unittest.mock.patch` usage.
- `tests/integration/test_check.py` — Disposition: **rewrite** under `packages/areg/tests/integration/`; preserve skill checker edge cases and adapt fixture paths for package-local templates and this repo's local skill layout.
- `tests/gateways/test_fakes.py` — Disposition: **migrate** under `packages/areg/tests/gateways/`.
- `tests/gateways/test_real_gateways.py` — Disposition: **migrate** under `packages/areg/tests/gateways/`; preserve command-shape assertions, update source names, and consider replacing patch-heavy subprocess tests with explicit fake gateways if the implementation touches the gateway boundary.

## First-Party `ns-*` Skills

Target convention for every migrated skill: canonical source in `skills/<name>/`, `.agents/skills/<name>` symlink to `../../skills/<name>`, `.claude/skills/<name>` symlink to `../../.agents/skills/<name>`, and `skills-lock.json` entry with `sourceType: "local"` and `source: "skills/<name>"`.

- `ns-changelog-update` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop; promote to first-party local skill without content reconciliation beyond any stale source-name search.
- `ns-create-bun-ts-project` — Disposition: **migrate**. Missing from asdl-tools; copy from nonslop into `skills/ns-create-bun-ts-project/` and install symlinks/lockfile as local.
- `ns-create-py-dev-cli` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop; promote to first-party local.
- `ns-create-pypackage-project` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop; promote to first-party local.
- `ns-dignified-python` — Disposition: **migrate**. Existing asdl-tools copy differs from nonslop in `SKILL.md`, `references/README.md`, and `subprocess.md`; reconcile before promotion by starting from the asdl-tools copy unless nonslop contains a clearly newer general-purpose improvement, and record any intentional merge choice in the skill PR.
- `ns-fake-driven-test-layout` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop; promote to first-party local.
- `ns-install` — Disposition: **rewrite**. Missing from asdl-tools and currently hardcodes `nseng-ai/nonslop` plus `uvx nonslop exec nsx`; keep the skill name but rewrite it as the permanent-install shortcut for `dagster-io/asdl-tools`, listing via `areg exec nsx list` and installing with `npx skills add dagster-io/asdl-tools --skill <name> --agent codex claude-code -y`.
- `ns-py-fake-driven-testing` — Disposition: **migrate**. Existing asdl-tools copy differs from nonslop in `SKILL.md` and `references/testing-strategy.md`; reconcile before promotion by starting from the asdl-tools copy unless nonslop has a clearly newer general-purpose improvement, and record the merge choice.
- `ns-pytest` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop; promote to first-party local.
- `ns-refac-cli-push-down` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop; promote to first-party local.
- `ns-refactor-swarm` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop; promote to first-party local.
- `ns-resolve-merge-conflicts` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop; promote to first-party local.
- `ns-setup-dprint` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop; promote to first-party local.
- `ns-setup-dprint-gh-ci` — Disposition: **migrate**. Missing from asdl-tools; copy from nonslop into `skills/ns-setup-dprint-gh-ci/` and install symlinks/lockfile as local.
- `ns-setup-pypi-publish` — Disposition: **migrate**. Missing from asdl-tools; copy from nonslop into `skills/ns-setup-pypi-publish/` and install symlinks/lockfile as local.
- `ns-setup-python-gh-ci` — Disposition: **migrate**. Missing from asdl-tools under the exact nonslop name; copy from nonslop into `skills/ns-setup-python-gh-ci/` and install symlinks/lockfile as local. Existing asdl-tools `ns-setup-python-ci` is a separate asdl-only alias/variant and should be folded or retired explicitly (see below).
- `ns-setup-repo-to-use-gt` — Disposition: **migrate**. Missing from asdl-tools; copy from nonslop into `skills/ns-setup-repo-to-use-gt/` and install symlinks/lockfile as local.
- `ns-skill-audit` — Disposition: **migrate**. Existing asdl-tools copy is identical to nonslop, but it contains nonslop-specific wording such as editing local nonslop skills; promote to first-party local and rewrite those phrases to this repo's local-skill convention.
- `ns-skill-management` — Disposition: **rewrite**. Existing asdl-tools copy is identical to nonslop and contains many nonslop-specific commands (`uvx nonslop update-skills`, `nseng-ai/nonslop`, and nonslop install-flag wording). Keep the skill name, but rewrite for asdl-tools: local skills in `skills/<name>/`, install flag `--agent codex claude-code -y`, and update workaround through `areg update-skills`.
- `ns-skillx` — Disposition: **rewrite**. Existing asdl-tools copy is identical to nonslop but invokes `uvx nonslop exec skillx`; keep the workflow and rename command examples to `areg exec skillx`.
- `nsx` — Disposition: **rewrite**. Existing asdl-tools copy is identical to nonslop but hardcodes `nseng-ai/nonslop` and `uvx nonslop exec nsx`; keep the skill name and shorthand behavior, but hardcode the new source `dagster-io/asdl-tools` and invoke `areg exec nsx`.

## Existing asdl-tools Skill Variants and Lockfile Entries

- Existing `.agents/skills/ns-*` vendored directories — Disposition: **fold** into canonical `skills/<name>/` directories when each skill is promoted. Do not leave migrated `ns-*` skills as real vendored directories under `.agents/skills`.
- Existing `.claude/skills/ns-*` symlinks — Disposition: **rewrite** targets only as needed after `.agents/skills/<name>` becomes a symlink to `../../skills/<name>`; final target remains `../../.agents/skills/<name>`.
- Existing `skills-lock.json` entries for `ns-*` sourced from `nseng-ai/nonslop` — Disposition: **rewrite** to local entries (`sourceType: "local"`, `source: "skills/<name>"`) for all migrated `ns-*` skills.
- Existing asdl-only `ns-setup-python-ci` — Disposition: **retire** after `ns-setup-python-gh-ci` lands. It overlaps the nonslop exact catalog but is not one of the 21 nonslop names. Prefer updating docs/lockfile/references to `ns-setup-python-gh-ci` and removing `ns-setup-python-ci` unless an implementation PR finds a live user-facing need for a compatibility alias.
- Existing non-`ns-*` first-party/dev skills in `skills/` — Disposition: **ignore** for this Objective except where lockfile or local-skill tests need to coexist with the migrated `ns-*` catalog.

## Skill Authoring and Skill-Sync Support

- `docs/skill-standards.md` — Disposition: **rewrite** into this repo's docs or AGENTS-adjacent guidance. Preserve the explicit-command `description: "Command: <skill-name>"` convention, frontmatter guidance, references/templates guidance, and human-facing README distinction; rewrite "areg/nonslop" wording to asdl-tools.
- `scripts/sync_dignified_python.py` — Disposition: **retire** for the migration. It is a nonslop maintenance helper for syncing from `dagster-io/skills` into `skills/ns-dignified-python`; the migrated repo should treat `skills/ns-dignified-python` as first-party unless a future explicit maintenance workflow is requested.
- `scripts/clean_dagster_refs.md` — Disposition: **retire** with `scripts/sync_dignified_python.py`. Its cleanup instructions are only useful for that retired sync flow.
- Nonslop `skills-lock.json` — Disposition: **rewrite**. Use it as source evidence for the exact 21-skill catalog and local-skill install shape, but regenerate/edit the asdl-tools lockfile to this repo's current full skill set and hashes.

## CI, Automation, and Development Recipes

- `.github/actions/setup-python-uv/action.yml` — Disposition: **fold** only if it has behavior missing from this repo's existing setup action. asdl-tools already has `.github/actions/setup-python-uv/action.yml`; do not copy nonslop's action verbatim unless a later PR intentionally updates the shared action.
- `.github/workflows/python-ci.yml` — Disposition: **fold** into existing asdl-tools CI. Do not add a separate nonslop workflow; ensure `packages/areg` tests run through this repo's existing Python CI/testpaths after workspace wiring.
- `.github/workflows/ns-ci.yml` — Disposition: **fold** into existing dprint/skill-management checks. After `areg check` is ported, replace stale `nonslop-check` behavior with an asdl-tools `areg check` validation path rather than copying nonslop's workflow.
- Nonslop root `justfile` QA/build/publish recipes — Disposition: **fold** into the root `justfile` as needed: add `packages/areg` to build/publish and test paths, replace `nonslop-check` with `areg check`, and remove `refresh-nonslop` after skill promotion.
- `local.just` — Disposition: **ignore** as checkout-local developer state. It points to `/Users/schrockn/code/twerk` and installs twerk packages/skills for local development; it is not part of deletion readiness for nonslop capabilities.

## Agent Configuration and Installed Skill Links

- `AGENTS.md` — Disposition: **fold** relevant skill-layout guidance into this repo's `AGENTS.md` only where it improves existing instructions. Do not copy nonslop's always-on Python skill rule wholesale; this repo already has its own project instructions.
- `CLAUDE.md` — Disposition: **ignore**. Nonslop's `CLAUDE.md` is project-specific forwarding/naming and should not be copied verbatim; fold only if a later implementation finds durable guidance not already present.
- `.claude/settings.local.json` — Disposition: **ignore** as local agent permission state, even though it is checkout-visible. Do not commit or migrate local allowlists from the retiring checkout.
- `.codex/config.toml` — Disposition: **ignore** as nonslop-specific agent configuration. This repo already has its own global/project instructions for command execution; do not copy host/sandbox advice blindly.
- Tracked nonslop `.agents/skills/<ns-name>` symlinks — Disposition: **migrate** conceptually via this repo's local-skill symlink convention after canonical `skills/<name>/` directories exist.
- Tracked nonslop `.claude/skills/<ns-name>` symlinks — Disposition: **migrate** conceptually via this repo's Claude symlink convention after `.agents/skills/<name>` is correct.
- Checkout-local `.agents/skills/fix-just` and `.claude/skills/fix-just` symlinks to `/Users/schrockn/code/twerk` — Disposition: **ignore** as local-only twerk development state.
- Checkout-local `.agents`/`.claude` symlinks to `twerk-objective-create`, `twerk-objective-progress`, and `twerk-objective-reconcile` — Disposition: **ignore** as local-only twerk development state, not nonslop product/source capabilities.

## Empty or Skeletal Package Areas

- `packages/nonslop-dev/src/nonslop_dev/...` — Disposition: **retire**. The bounded inventory found an empty/skeletal package tree with no source files; do not create an asdl-tools package for it.
- `packages/nonslop-dev/tests` — Disposition: **retire**. No tests or source capability were discovered.

## Excluded Non-Capability Output

- `.git`, `.venv`, `.pytest_cache`, `.ruff_cache`, `dist`, `__pycache__`, `.deepeval`, and other cache/build/environment output — Disposition: **ignore**. These are not migration inputs.

## Implementation Order Implied by This Audit

1. Port `areg` as `packages/areg`, updating default sources and package/workspace wiring.
2. Promote/reconcile the `ns-*` catalog into canonical `skills/<name>/` local skills and symlink/lockfile form.
3. Rewrite command/distribution references from `nonslop`, `uvx nonslop`, and `nseng-ai/nonslop` to `areg` and `dagster-io/asdl-tools`.
4. Fold or retire residual nonslop CI/dev/docs/agent artifacts according to the dispositions above.
5. Prove deletion readiness with targeted tests and live-reference searches.
